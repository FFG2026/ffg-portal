import { fetchPaymentsForMandate } from "./client";
import {
  matchGcPaymentsToInstalments,
  type GoCardlessPayment,
  type Instalment,
} from "./match-payments";
import { createAdminClient } from "../supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type AgreementToSync = {
  id: string;
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

export async function syncAgreementPayments(
  supabase: AdminClient,
  agreement: AgreementToSync
): Promise<SyncResult> {
  const mandateId = agreement.gocardless_mandate_id;
  if (!mandateId) {
    return {
      agreementId: agreement.id,
      mandateId: "",
      gcPayments: 0,
      markedPaid: 0,
      markedFailed: 0,
      error: "no mandate",
    };
  }

  if (!process.env.GOCARDLESS_ACCESS_TOKEN) {
    return {
      agreementId: agreement.id,
      mandateId,
      gcPayments: 0,
      markedPaid: 0,
      markedFailed: 0,
      error: "GOCARDLESS_ACCESS_TOKEN is not set",
    };
  }

  try {
    const [gcRaw, paymentsRes] = await Promise.all([
      fetchPaymentsForMandate(mandateId),
      supabase
        .from("payments")
        .select("id, due_date, status, amount, gocardless_payment_id")
        .eq("agreement_id", agreement.id)
        .order("due_date", { ascending: true }),
    ]);

    if (paymentsRes.error) {
      throw new Error(paymentsRes.error.message);
    }

    const instalments = (paymentsRes.data || []) as Instalment[];
    const gcPayments: GoCardlessPayment[] = (gcRaw || []).map((p: any) => ({
      id: p.id,
      charge_date: p.charge_date || null,
      status: p.status,
      amount: Number(p.amount),
    }));

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
      mandateId,
      gcPayments: gcPayments.length,
      markedPaid,
      markedFailed,
    };
  } catch (err: any) {
    return {
      agreementId: agreement.id,
      mandateId,
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
  const withMandates = agreements.filter((a) => a.gocardless_mandate_id);
  const results: SyncResult[] = [];

  for (let i = 0; i < withMandates.length; i += concurrency) {
    const batch = withMandates.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((agreement) => syncAgreementPayments(supabase, agreement))
    );
    results.push(...batchResults);
  }

  return results;
}
