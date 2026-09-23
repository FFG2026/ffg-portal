import {
  fetchAllGoCardlessPayments,
  fetchPaymentsForMandate,
} from "./client";
import {
  matchGcPaymentsToInstalments,
  scheduleCollectionsOnly,
  amountsClose,
  collectedScheduleAmount,
  COLLECTED_STATUSES,
  type GoCardlessPayment,
  type Instalment,
} from "./match-payments";
import { parseAgreementRefFromPayment } from "./parse-ref";
import { missRowsFromGcPayments, type DdMissRow } from "./dd-misses";
import {
  addMonths,
  dueDayFromRows,
  financeLeaseScheduleNeedsRepair,
  hirePurchaseKeepFrom,
  hirePurchaseScheduleNeedsRepair,
  rebuildFinanceLeaseSchedule,
} from "../schedule";
import { isUnwoundAgreement } from "../deal-status";
import { createAdminClient } from "../supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type AgreementToSync = {
  id: string;
  agreement_number?: string;
  gocardless_mandate_id: string | null;
  monthly_instalment?: number | string | null;
  /** More than one live agreement on this mandate — unlabelled GC stays unmatched. */
  mandateShared?: boolean;
};

export type SyncResult = {
  agreementId: string;
  mandateId: string;
  gcPayments: number;
  markedPaid: number;
  markedFailed: number;
  error?: string;
};

type ListedGcPayment = GoCardlessPayment & {
  mandateId: string | null;
  agreement_number: string | null;
};

function asGcPayment(p: any): ListedGcPayment {
  const ref = parseAgreementRefFromPayment({
    description: p.description,
    reference: p.reference,
    metadata: p.metadata,
  });
  return {
    id: p.id,
    charge_date: p.charge_date || null,
    status: p.status,
    amount: Number(p.amount),
    instalment_number: ref?.instalment_number ?? null,
    mandateId: p.links?.mandate || null,
    agreement_number: ref?.agreement_number || null,
  };
}

export function paymentsForAgreement(
  gcRaw: any[],
  agreement: AgreementToSync
): GoCardlessPayment[] {
  const number = (agreement.agreement_number || "").toUpperCase();
  const monthly = Number(agreement.monthly_instalment || 0);
  const mapped = (gcRaw || []).map(asGcPayment);
  return mapped.filter((p) => {
    if (p.agreement_number) return p.agreement_number === number;
    if (
      !agreement.gocardless_mandate_id ||
      p.mandateId !== agreement.gocardless_mandate_id
    ) {
      return false;
    }
    // Shared mandates (one customer, many HPs) only tick from HP41/3-style refs.
    if (agreement.mandateShared) return false;
    // As-and-when books have no contracted monthly Direct Debit — only HP104/3-style refs.
    if (!(monthly > 0)) return false;
    // Deposits / other lumps on this mandate are not monthly Direct Debits.
    if (!amountsClose(monthly, p.amount)) return false;
    return true;
  });
}

export function withPaymentMatchContext(
  agreements: AgreementToSync[]
): AgreementToSync[] {
  const mandateCounts = new Map<string, number>();
  for (const agreement of agreements) {
    const mandate = agreement.gocardless_mandate_id;
    if (!mandate) continue;
    mandateCounts.set(mandate, (mandateCounts.get(mandate) || 0) + 1);
  }
  return agreements.map((agreement) => ({
    ...agreement,
    mandateShared:
      agreement.mandateShared ??
      (mandateCounts.get(agreement.gocardless_mandate_id || "") || 0) > 1,
  }));
}

async function persistDirectDebitMisses(
  supabase: AdminClient,
  agreementId: string,
  gcPayments: GoCardlessPayment[]
) {
  await persistDirectDebitMissRows(
    supabase,
    missRowsFromGcPayments(agreementId, gcPayments)
  );
}

export async function persistDirectDebitMissRows(
  supabase: AdminClient,
  rows: DdMissRow[]
) {
  if (!rows.length) return;
  await supabase.from("direct_debit_misses").upsert(rows, {
    onConflict: "gc_payment_id",
    ignoreDuplicates: true,
  });
}

export function missRowsForAgreements(
  gcRaw: any[],
  agreements: AgreementToSync[],
  fromInclusive?: string
): DdMissRow[] {
  const rows: DdMissRow[] = [];
  for (const agreement of withPaymentMatchContext(agreements)) {
    rows.push(
      ...missRowsFromGcPayments(
        agreement.id,
        paymentsForAgreement(gcRaw, agreement),
        fromInclusive
      )
    );
  }
  return rows;
}

async function applyMatches(
  supabase: AdminClient,
  agreement: AgreementToSync,
  gcPayments: GoCardlessPayment[]
): Promise<SyncResult> {
  const headerRes = await supabase
    .from("agreements")
    .select(
      "term_months, monthly_instalment, start_date, written_date, status, gocardless_mandate_id, documentation_fee, agreement_type"
    )
    .eq("id", agreement.id)
    .maybeSingle();
  if (headerRes.error) throw new Error(headerRes.error.message);
  const header = headerRes.data;

  if (isUnwoundAgreement(header?.status)) {
    return {
      agreementId: agreement.id,
      mandateId: agreement.gocardless_mandate_id || "",
      gcPayments: gcPayments.length,
      markedPaid: 0,
      markedFailed: 0,
    };
  }

  const paymentsRes = await supabase
    .from("payments")
    .select(
      "id, due_date, status, amount, gocardless_payment_id, instalment_number, paid_date, notes, source"
    )
    .eq("agreement_id", agreement.id)
    .order("due_date", { ascending: true });

  if (paymentsRes.error) {
    throw new Error(paymentsRes.error.message);
  }

  const term = Number(header?.term_months || 0);
  const monthly = Number(header?.monthly_instalment || 0);
  const written = String(header?.written_date || "").slice(0, 10);
  const isFl = String(header?.agreement_type || "").toUpperCase() === "FL";
  const storedStart = String(header?.start_date || "").slice(0, 10);
  const dueDay = dueDayFromRows(paymentsRes.data || [], storedStart);
  const firstDue = (paymentsRes.data || [])
    .map((row) => String(row.due_date || "").slice(0, 10))
    .filter((d) => d.length >= 10)
    .sort()[0];
  const firstGcDue = (paymentsRes.data || [])
    .filter(
      (row) =>
        String(row.status) === "paid" &&
        (row as { gocardless_payment_id?: string | null }).gocardless_payment_id
    )
    .map((row) => String(row.due_date || "").slice(0, 10))
    .filter((d) => d.length >= 10)
    .sort()[0];
  const keepFrom = !isFl
    ? hirePurchaseKeepFrom({
        writtenDate: written,
        dueDay,
        firstDue,
        firstGcDue,
      })
    : "";
  const hpNeedsRebuild =
    !isFl &&
    hirePurchaseScheduleNeedsRepair(paymentsRes.data || [], {
      termMonths: term,
      monthlyInstalment: monthly,
      startDate: storedStart,
      writtenDate: written,
      firstGcDue,
    });
  const start =
    hpNeedsRebuild && keepFrom.length >= 10
      ? addMonths(keepFrom, -1)
      : storedStart;

  let instalments = (paymentsRes.data || []) as Instalment[];
  const scheduleCollections = scheduleCollectionsOnly(
    gcPayments,
    header?.documentation_fee,
    header?.monthly_instalment
  );

  const needsRebuild = term > 0 && monthly > 0 && start.length >= 10 && (
    isFl
      ? financeLeaseScheduleNeedsRepair(instalments, {
          termMonths: term,
          monthlyInstalment: monthly,
          startDate: start,
        })
      : hirePurchaseScheduleNeedsRepair(instalments, {
          termMonths: term,
          monthlyInstalment: monthly,
          startDate: start,
          writtenDate: written,
          firstGcDue,
        })
  );

  if (needsRebuild) {
    const fromGc = scheduleCollections
      .filter((p) => p.charge_date && COLLECTED_STATUSES.has(p.status))
      .map((p) => ({
        chargeDate: String(p.charge_date).slice(0, 10),
        amount: Math.round(Number(p.amount)) / 100,
        gocardless_payment_id: p.id,
        notes: null,
        source: "gocardless",
        status: "paid" as const,
      }));
    const fromRows = instalments
      .filter((row) => {
        if (String(row.status) !== "paid") return false;
        const source = String((row as { source?: string | null }).source || "");
        if (source === "manual") return true;
        if (row.gocardless_payment_id) return true;
        if (fromGc.length) return false;
        const when = String(
          (row as { paid_date?: string | null }).paid_date || row.due_date || ""
        ).slice(0, 10);
        if (keepFrom.length >= 10 && when < keepFrom) return false;
        if (
          written.length >= 10 &&
          when < written
        ) {
          return false;
        }
        return true;
      })
      .map((row) => ({
        chargeDate: String(
          (row as { paid_date?: string | null }).paid_date || row.due_date
        ).slice(0, 10),
        amount: Number(row.amount),
        gocardless_payment_id: row.gocardless_payment_id,
        notes: (row as { notes?: string | null }).notes || null,
        source: (row as { source?: string | null }).source || null,
        status: "paid" as const,
      }));
    const rebuilt = rebuildFinanceLeaseSchedule(
      { termMonths: term, monthlyInstalment: monthly, startDate: start },
      [...fromGc, ...fromRows]
    );
    await supabase.from("payments").delete().eq("agreement_id", agreement.id);
    const { error: insertErr } = await supabase.from("payments").insert(
      rebuilt.map((row) => ({ ...row, agreement_id: agreement.id }))
    );
    if (!insertErr) {
      const reload = await supabase
        .from("payments")
        .select("id, due_date, status, amount, gocardless_payment_id, instalment_number")
        .eq("agreement_id", agreement.id)
        .order("due_date", { ascending: true });
      if (!reload.error) instalments = (reload.data || []) as Instalment[];
      if (start !== String(header?.start_date || "").slice(0, 10)) {
        await supabase
          .from("agreements")
          .update({ start_date: start })
          .eq("id", agreement.id);
      }
    }
  }

  const matches = matchGcPaymentsToInstalments(
    instalments,
    scheduleCollections,
    { looseDateDays: 40 }
  );
  await persistDirectDebitMisses(supabase, agreement.id, gcPayments);
  let markedPaid = 0;
  let markedFailed = 0;

  for (const match of matches) {
    const row = instalments.find((instalment) => instalment.id === match.instalmentId);
    const gc = scheduleCollections.find((p) => p.id === match.gcPaymentId);
    const amount =
      gc && match.status === "paid"
        ? collectedScheduleAmount(row?.amount || monthly, gc.amount, monthly)
        : undefined;
    const { error } = await supabase
      .from("payments")
      .update({
        status: match.status,
        paid_date: match.status === "paid" ? match.chargeDate : null,
        gocardless_payment_id: match.gcPaymentId,
        ...(amount != null ? { amount } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", match.instalmentId);

    if (error) continue;
    if (match.status === "paid") markedPaid += 1;
    else markedFailed += 1;
  }

  const finished =
    String(header?.status || "").trim().toLowerCase() === "settled";

  const { count } = await supabase
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("agreement_id", agreement.id);
  const have = count || 0;
  let nextNumber =
    Math.max(0, ...instalments.map((row) => Number(row.instalment_number || 0))) +
    1;
  if (!finished && term > have && monthly > 0 && start.length >= 10) {
    const extras = [];
    for (let n = nextNumber; extras.length + have < term; n += 1) {
      extras.push({
        agreement_id: agreement.id,
        instalment_number: n,
        due_date: addMonths(start, n),
        amount: monthly,
        status: "due",
        paid_date: null,
      });
    }
    if (extras.length) {
      await supabase.from("payments").insert(extras);
    }
  }

  const { data: allRows } = await supabase
    .from("payments")
    .select("id, amount, due_date, instalment_number, status")
    .eq("agreement_id", agreement.id);
  const sorted = (allRows || []).sort(
    (a, b) =>
      String(a.due_date).localeCompare(String(b.due_date)) ||
      Number(a.instalment_number) - Number(b.instalment_number)
  );
  let remaining = sorted.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  for (const row of sorted) {
    remaining = Math.round((remaining - Number(row.amount || 0)) * 100) / 100;
    await supabase
      .from("payments")
      .update({ balance_after: Math.max(0, remaining) })
      .eq("id", row.id);
  }

  const hasUnpaid = sorted.some((row) => String(row.status) !== "paid");
  const patch: Record<string, string> = {};
  if (hasUnpaid && String(header?.status || "") === "settled") {
    patch.status = "active";
  }
  const mandateFromGc = gcPayments.find((p) => p.mandateId)?.mandateId;
  if (mandateFromGc && !header?.gocardless_mandate_id) {
    patch.gocardless_mandate_id = mandateFromGc;
  }
  if (Object.keys(patch).length) {
    await supabase.from("agreements").update(patch).eq("id", agreement.id);
  }

  return {
    agreementId: agreement.id,
    mandateId: patch.gocardless_mandate_id || agreement.gocardless_mandate_id || "",
    gcPayments: gcPayments.length,
    markedPaid,
    markedFailed,
  };
}

export async function syncAgreementPayments(
  supabase: AdminClient,
  agreement: AgreementToSync,
  gcRaw?: any[]
): Promise<SyncResult> {
  const mandateId = agreement.gocardless_mandate_id;

  if (!process.env.GOCARDLESS_ACCESS_TOKEN) {
    return {
      agreementId: agreement.id,
      mandateId: mandateId || "",
      gcPayments: 0,
      markedPaid: 0,
      markedFailed: 0,
      error: "GOCARDLESS_ACCESS_TOKEN is not set",
    };
  }

  try {
    const raw =
      gcRaw ||
      (mandateId
        ? await fetchPaymentsForMandate(mandateId)
        : await fetchAllGoCardlessPayments());
    const gcPayments = paymentsForAgreement(
      raw,
      await enrichAgreementForMatch(supabase, agreement)
    );
    return await applyMatches(supabase, agreement, gcPayments);
  } catch (err: any) {
    return {
      agreementId: agreement.id,
      mandateId: mandateId || "",
      gcPayments: 0,
      markedPaid: 0,
      markedFailed: 0,
      error: err?.message || "sync failed",
    };
  }
}

async function enrichAgreementForMatch(
  supabase: AdminClient,
  agreement: AgreementToSync
): Promise<AgreementToSync> {
  if (
    agreement.monthly_instalment != null &&
    agreement.mandateShared != null &&
    agreement.agreement_number
  ) {
    return agreement;
  }
  const header = await supabase
    .from("agreements")
    .select("agreement_number, gocardless_mandate_id, monthly_instalment")
    .eq("id", agreement.id)
    .maybeSingle();
  const mandate =
    agreement.gocardless_mandate_id ||
    header.data?.gocardless_mandate_id ||
    null;
  let mandateShared = agreement.mandateShared;
  if (mandateShared == null && mandate) {
    const { count } = await supabase
      .from("agreements")
      .select("id", { count: "exact", head: true })
      .eq("gocardless_mandate_id", mandate);
    mandateShared = (count || 0) > 1;
  }
  return {
    ...agreement,
    agreement_number:
      agreement.agreement_number || header.data?.agreement_number,
    gocardless_mandate_id: mandate,
    monthly_instalment:
      agreement.monthly_instalment ?? header.data?.monthly_instalment,
    mandateShared: mandateShared ?? false,
  };
}

export async function applyGoCardlessCollections(
  supabase: AdminClient,
  agreements: AgreementToSync[],
  gcRaw: any[],
  concurrency = 4
) {
  const results: SyncResult[] = [];
  const withContext = withPaymentMatchContext(agreements);
  for (let i = 0; i < withContext.length; i += concurrency) {
    const batch = withContext.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (agreement) => {
        const gcPayments = paymentsForAgreement(gcRaw, agreement);
        if (!gcPayments.length) {
          return {
            agreementId: agreement.id,
            mandateId: agreement.gocardless_mandate_id || "",
            gcPayments: 0,
            markedPaid: 0,
            markedFailed: 0,
          } as SyncResult;
        }
        return applyMatches(supabase, agreement, gcPayments);
      })
    );
    results.push(...batchResults);
  }
  return results;
}

export async function syncAgreementsPayments(
  supabase: AdminClient,
  agreements: AgreementToSync[],
  concurrency = 4
): Promise<SyncResult[]> {
  if (!process.env.GOCARDLESS_ACCESS_TOKEN) {
    return agreements.map((a) => ({
      agreementId: a.id,
      mandateId: a.gocardless_mandate_id || "",
      gcPayments: 0,
      markedPaid: 0,
      markedFailed: 0,
      error: "GOCARDLESS_ACCESS_TOKEN is not set",
    }));
  }

  let allGc: any[] = [];
  try {
    allGc = await fetchAllGoCardlessPayments();
  } catch (err: any) {
    return agreements.map((a) => ({
      agreementId: a.id,
      mandateId: a.gocardless_mandate_id || "",
      gcPayments: 0,
      markedPaid: 0,
      markedFailed: 0,
      error: err?.message || "GoCardless list failed",
    }));
  }

  const results: SyncResult[] = [];
  const withContext = withPaymentMatchContext(agreements);
  for (let i = 0; i < withContext.length; i += concurrency) {
    const batch = withContext.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((agreement) =>
        syncAgreementPayments(supabase, agreement, allGc)
      )
    );
    results.push(...batchResults);
  }

  return results;
}
