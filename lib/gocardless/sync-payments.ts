import {
  fetchAllGoCardlessPayments,
  fetchPaymentsForMandate,
} from "./client";
import {
  matchGcPaymentsToInstalments,
  type GoCardlessPayment,
  type Instalment,
} from "./match-payments";
import { parseAgreementRefFromPayment } from "./parse-ref";
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
  gcPayments: GoCardlessPayment[]
): Promise<SyncResult> {
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

  return {
    agreementId: agreement.id,
    mandateId: agreement.gocardless_mandate_id || "",
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
      (mandateId ? await fetchPaymentsForMandate(mandateId) : []);
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
