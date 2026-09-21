import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCompany, type SheetDeal } from "./spreadsheet";

export type ImportSummary = {
  created: string[];
  updated: string[];
  skipped: string[];
  marked_paid: number;
  errors: { agreement_number: string; error: string }[];
};

async function findCustomerId(
  supabase: SupabaseClient,
  companyName: string,
  cache: Map<string, string>
) {
  const key = normalizeCompany(companyName);
  if (cache.has(key)) return cache.get(key)!;

  const { data: exact } = await supabase
    .from("customers")
    .select("id, company_name")
    .ilike("company_name", companyName)
    .limit(1)
    .maybeSingle();
  if (exact) {
    cache.set(key, exact.id);
    return exact.id;
  }

  const { data: all } = await supabase.from("customers").select("id, company_name");
  const match = (all || []).find(
    (c) => normalizeCompany(c.company_name || "") === key
  );
  if (match) {
    cache.set(key, match.id);
    return match.id;
  }

  const { data: created, error } = await supabase
    .from("customers")
    .insert({ company_name: companyName })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message || "Could not create customer");
  cache.set(key, created.id);
  return created.id;
}

export async function importDealBook(
  supabase: SupabaseClient,
  deals: SheetDeal[],
  opts: { apply: boolean }
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    created: [],
    updated: [],
    skipped: [],
    marked_paid: 0,
    errors: [],
  };

  const { data: existing } = await supabase
    .from("agreements")
    .select("id, agreement_number, customer_id");
  const byNumber = new Map(
    (existing || []).map((a) => [String(a.agreement_number).toUpperCase(), a])
  );
  const customerCache = new Map<string, string>();

  for (const deal of deals) {
    try {
      const current = byNumber.get(deal.agreement_number);
      if (!opts.apply) {
        if (current) summary.updated.push(deal.agreement_number);
        else summary.created.push(deal.agreement_number);
        continue;
      }

      if (!current) {
        const customerId = await findCustomerId(
          supabase,
          deal.company_name,
          customerCache
        );
        const paidCount = deal.payments.filter((p) => p.paid).length;
        const { data: agreement, error: agrErr } = await supabase
          .from("agreements")
          .insert({
            agreement_number: deal.agreement_number,
            agreement_type: deal.agreement_type,
            customer_id: customerId,
            asset_description: deal.company_name,
            purchase_price: deal.purchase_price,
            customer_deposit: deal.customer_deposit,
            total_lend: deal.total_lend,
            commission: deal.commission,
            documentation_fee: deal.documentation_fee,
            monthly_instalment: deal.monthly_instalment,
            term_months: deal.term_months,
            start_date: deal.start_date,
            status: paidCount >= deal.term_months ? "settled" : "active",
          })
          .select("id")
          .single();
        if (agrErr || !agreement) throw new Error(agrErr?.message || "insert failed");

        const rows = deal.payments.map((p) => ({
          agreement_id: agreement.id,
          instalment_number: p.instalment_number,
          due_date: p.due_date,
          amount: p.amount,
          status: p.paid ? "paid" : "due",
          paid_date: p.paid ? p.due_date : null,
          balance_after: null,
        }));
        const { error: payErr } = await supabase.from("payments").insert(rows);
        if (payErr) throw new Error(payErr.message);
        summary.created.push(deal.agreement_number);
        summary.marked_paid += paidCount;
        byNumber.set(deal.agreement_number, {
          id: agreement.id,
          agreement_number: deal.agreement_number,
          customer_id: customerId,
        });
        continue;
      }

      const { data: payments, error: payReadErr } = await supabase
        .from("payments")
        .select("id, instalment_number, due_date, status")
        .eq("agreement_id", current.id);
      if (payReadErr) throw new Error(payReadErr.message);

      const byInstalment = new Map(
        (payments || []).map((p) => [p.instalment_number, p])
      );
      const byDate = new Map(
        (payments || []).map((p) => [String(p.due_date).slice(0, 10), p])
      );

      let marked = 0;
      for (const p of deal.payments) {
        if (!p.paid) continue;
        const row =
          byInstalment.get(p.instalment_number) || byDate.get(p.due_date);
        if (!row || row.status === "paid") continue;
        const { error } = await supabase
          .from("payments")
          .update({
            status: "paid",
            paid_date: p.due_date,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        if (error) throw new Error(error.message);
        marked += 1;
      }
      summary.marked_paid += marked;
      if (marked > 0) summary.updated.push(deal.agreement_number);
      else summary.skipped.push(deal.agreement_number);
    } catch (err: any) {
      summary.errors.push({
        agreement_number: deal.agreement_number,
        error: err?.message || "import failed",
      });
    }
  }

  return summary;
}
