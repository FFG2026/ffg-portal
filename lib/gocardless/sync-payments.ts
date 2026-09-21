import {
  fetchAllGoCardlessPayments,
  fetchPaymentsForMandate,
} from "./client";
import {
  matchGcPaymentsToInstalments,
  unmatchedCollectedPayments,
  scheduleCollectionsOnly,
  type GoCardlessPayment,
  type Instalment,
} from "./match-payments";
import { parseAgreementRefFromPayment } from "./parse-ref";
import { addMonths } from "../schedule";
import { planPartSettlement } from "../part-settlement";
import { createAdminClient } from "../supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type AgreementToSync = {
  id: string;
  agreement_number?: string;
  gocardless_mandate_id: string | null;
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
  const mapped = (gcRaw || []).map(asGcPayment);
  return mapped.filter((p) => {
    if (p.agreement_number) return p.agreement_number === number;
    return (
      !!agreement.gocardless_mandate_id &&
      p.mandateId === agreement.gocardless_mandate_id
    );
  });
}

async function applyMatches(
  supabase: AdminClient,
  agreement: AgreementToSync,
  gcPayments: GoCardlessPayment[],
  opts?: { leftover?: boolean }
): Promise<SyncResult> {
  const headerRes = await supabase
    .from("agreements")
    .select(
      "term_months, monthly_instalment, start_date, status, gocardless_mandate_id, documentation_fee"
    )
    .eq("id", agreement.id)
    .maybeSingle();
  if (headerRes.error) throw new Error(headerRes.error.message);
  const header = headerRes.data;

  const paymentsRes = await supabase
    .from("payments")
    .select("id, due_date, status, amount, gocardless_payment_id, instalment_number")
    .eq("agreement_id", agreement.id)
    .order("due_date", { ascending: true });

  if (paymentsRes.error) {
    throw new Error(paymentsRes.error.message);
  }

  const instalments = (paymentsRes.data || []) as Instalment[];
  const matches = matchGcPaymentsToInstalments(instalments, gcPayments);
  let markedPaid = 0;
  let markedFailed = 0;

  for (const match of matches) {
    const { error } = await supabase
      .from("payments")
      .update({
        status: match.status,
        paid_date: match.status === "paid" ? match.chargeDate : null,
        gocardless_payment_id: match.gcPaymentId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", match.instalmentId);

    if (error) continue;
    if (match.status === "paid") markedPaid += 1;
    else markedFailed += 1;
  }

  const leftover =
    opts?.leftover === false
      ? []
      : scheduleCollectionsOnly(
          unmatchedCollectedPayments(
            gcPayments,
            matches,
            instalments.map((row) => row.gocardless_payment_id)
          ),
          header?.documentation_fee,
          header?.monthly_instalment
        );
  let nextNumber =
    Math.max(0, ...instalments.map((row) => Number(row.instalment_number || 0))) +
    1;
  for (const payment of leftover) {
    const amount = Math.round(Number(payment.amount)) / 100;
    const due = String(payment.charge_date).slice(0, 10);
    const { error } = await supabase.from("payments").insert({
      agreement_id: agreement.id,
      instalment_number: nextNumber,
      due_date: due,
      amount,
      status: "paid",
      paid_date: due,
      gocardless_payment_id: payment.id,
      source: "gocardless",
      notes: "GoCardless collection",
    });
    if (!error) {
      nextNumber += 1;
      markedPaid += 1;
    }
  }

  const term = Number(header?.term_months || 0);
  const monthly = Number(header?.monthly_instalment || 0);
  const start = String(header?.start_date || "").slice(0, 10);
  const { count } = await supabase
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("agreement_id", agreement.id);
  const have = count || 0;
  if (term > have && monthly > 0 && start.length >= 10) {
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

  const leftoverPounds = leftover.reduce(
    (sum, payment) => sum + Math.round(Number(payment.amount)) / 100,
    0
  );
  if (leftoverPounds > 0.009) {
    const { data: dueRows } = await supabase
      .from("payments")
      .select("id, instalment_number, amount, due_date, status")
      .eq("agreement_id", agreement.id);
    const unpaid = (dueRows || [])
      .filter((row) => String(row.status) !== "paid")
      .map((row) => ({
        id: row.id,
        instalment_number: Number(row.instalment_number),
        amount: Number(row.amount),
        due_date: String(row.due_date),
      }));
    try {
      const plan = planPartSettlement(unpaid, leftoverPounds);
      if (plan.removeIds.length) {
        await supabase.from("payments").delete().in("id", plan.removeIds);
      }
      if (plan.reduce) {
        await supabase
          .from("payments")
          .update({ amount: plan.reduce.amount })
          .eq("id", plan.reduce.id);
      }
    } catch {
      // Extra collections beyond the contracted remaining stay as paid rows.
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
    const gcPayments = paymentsForAgreement(raw, agreement);
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

export async function applyGoCardlessCollections(
  supabase: AdminClient,
  agreements: AgreementToSync[],
  gcRaw: any[],
  concurrency = 4
) {
  const results: SyncResult[] = [];
  for (let i = 0; i < agreements.length; i += concurrency) {
    const batch = agreements.slice(i, i + concurrency);
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
        return applyMatches(supabase, agreement, gcPayments, {
          leftover: false,
        });
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
  for (let i = 0; i < agreements.length; i += concurrency) {
    const batch = agreements.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((agreement) =>
        syncAgreementPayments(supabase, agreement, allGc)
      )
    );
    results.push(...batchResults);
  }

  return results;
}
