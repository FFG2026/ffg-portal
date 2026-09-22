import type { SupabaseClient } from "@supabase/supabase-js";
import { rewritePaymentSchedule } from "./schedule";

function n(v: unknown) {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

export type DealFields = {
  agreement_number?: string;
  agreement_type?: string;
  company_name?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  asset_description?: string | null;
  purchase_price?: unknown;
  customer_deposit?: unknown;
  total_lend?: unknown;
  commission?: unknown;
  documentation_fee?: unknown;
  monthly_instalment?: unknown;
  term_months?: unknown;
  start_date?: string;
  written_date?: string;
  gocardless_mandate_id?: string | null;
  google_folder_id?: string | null;
  google_folder_name?: string | null;
  rebuild_schedule?: boolean;
};

export async function findOrCreateCustomer(
  supabase: SupabaseClient,
  fields: DealFields
) {
  const companyName = String(fields.company_name || "").trim();
  if (!companyName) throw new Error("Company name is required.");
  const { data: existing } = await supabase
    .from("customers")
    .select("id")
    .ilike("company_name", companyName)
    .limit(1)
    .maybeSingle();

  const requestedEmail = fields.email ? String(fields.email).trim() : "";
  let email = requestedEmail || null;
  if (email) {
    const { data: emailOwner } = await supabase
      .from("customers")
      .select("id, company_name")
      .ilike("email", email)
      .maybeSingle();
    // A shared office inbox (e.g. HP141 Luke using Fuller's email) must
    // not attach this deal to a different customer, or copy the address
    // onto the hirer and collapse the two records later.
    if (
      emailOwner &&
      emailOwner.id !== existing?.id &&
      normalizeCustomerName(emailOwner.company_name) !==
        normalizeCustomerName(companyName)
    ) {
      email = null;
    }
  }

  const patch = {
    ...(email ? { email } : {}),
    ...(fields.phone ? { phone: String(fields.phone).trim() } : {}),
    ...(fields.contact_name
      ? { contact_name: String(fields.contact_name).trim() }
      : {}),
  };
  if (existing) {
    if (Object.keys(patch).length) {
      await supabase.from("customers").update(patch).eq("id", existing.id);
    }
    return existing.id as string;
  }
  const { data: created, error } = await supabase
    .from("customers")
    .insert({
      company_name: companyName,
      contact_name: fields.contact_name || null,
      email,
      phone: fields.phone || null,
    })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message || "Could not create customer");
  return created.id as string;
}

function normalizeCustomerName(name: string | null | undefined) {
  return String(name || "")
    .toLowerCase()
    .replace(/\bltd\b\.?/g, "")
    .replace(/\blimited\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

async function replaceSchedule(
  supabase: SupabaseClient,
  agreementId: string,
  termMonths: number,
  monthly: number,
  startDate: string
) {
  const { data: rows } = await supabase
    .from("payments")
    .select(
      "amount, status, paid_date, gocardless_payment_id, notes, source"
    )
    .eq("agreement_id", agreementId);
  const schedule = rewritePaymentSchedule(rows || [], {
    termMonths,
    monthlyInstalment: monthly,
    startDate,
  }).map((row) => ({ ...row, agreement_id: agreementId }));
  await supabase.from("payments").delete().eq("agreement_id", agreementId);
  const { error } = await supabase.from("payments").insert(schedule);
  if (error) throw new Error(error.message);
  return schedule.length;
}

export async function updateAgreementFromFields(
  supabase: SupabaseClient,
  agreementNumber: string,
  fields: DealFields
) {
  const { data: agreement, error } = await supabase
    .from("agreements")
    .select("*")
    .ilike("agreement_number", agreementNumber.trim())
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!agreement) throw new Error(`No agreement ${agreementNumber}`);

  let customerId = agreement.customer_id as string;
  if (fields.company_name) {
    customerId = await findOrCreateCustomer(supabase, fields);
  } else if (fields.email || fields.phone || fields.contact_name) {
    const patch: Record<string, string> = {};
    if (fields.email) patch.email = String(fields.email).trim();
    if (fields.phone) patch.phone = String(fields.phone).trim();
    if (fields.contact_name) patch.contact_name = String(fields.contact_name).trim();
    if (Object.keys(patch).length) {
      await supabase.from("customers").update(patch).eq("id", agreement.customer_id);
    }
  }

  const monthly = n(fields.monthly_instalment) ?? Number(agreement.monthly_instalment);
  const termMonths = n(fields.term_months) ?? Number(agreement.term_months);
  const startDate = String(fields.start_date || agreement.start_date).slice(0, 10);

  const { error: updErr } = await supabase
    .from("agreements")
    .update({
      customer_id: customerId,
      agreement_type: fields.agreement_type || agreement.agreement_type,
      asset_description:
        fields.asset_description !== undefined
          ? fields.asset_description
          : agreement.asset_description,
      purchase_price: n(fields.purchase_price) ?? agreement.purchase_price,
      customer_deposit: n(fields.customer_deposit) ?? agreement.customer_deposit,
      total_lend: n(fields.total_lend) ?? agreement.total_lend,
      commission: n(fields.commission) ?? agreement.commission,
      documentation_fee: n(fields.documentation_fee) ?? agreement.documentation_fee,
      monthly_instalment: monthly,
      term_months: termMonths,
      start_date: startDate,
      written_date: fields.written_date
        ? String(fields.written_date).slice(0, 10)
        : agreement.written_date,
      gocardless_mandate_id:
        fields.gocardless_mandate_id !== undefined
          ? fields.gocardless_mandate_id
          : agreement.gocardless_mandate_id,
      google_folder_id:
        fields.google_folder_id !== undefined
          ? fields.google_folder_id
          : agreement.google_folder_id,
      google_folder_name:
        fields.google_folder_name !== undefined
          ? fields.google_folder_name
          : agreement.google_folder_name,
    })
    .eq("id", agreement.id);
  if (updErr) throw new Error(updErr.message);

  const scheduleChanged =
    monthly !== Number(agreement.monthly_instalment) ||
    termMonths !== Number(agreement.term_months) ||
    startDate !== String(agreement.start_date).slice(0, 10);

  let instalments: number | null = null;
  let scheduleNote = "";
  if (fields.rebuild_schedule || scheduleChanged) {
    try {
      instalments = await replaceSchedule(
        supabase,
        agreement.id,
        termMonths,
        monthly,
        startDate
      );
    } catch (err: any) {
      scheduleNote = err.message || "";
    }
  }

  return {
    agreement_number: agreement.agreement_number,
    instalments,
    schedule_note: scheduleNote,
  };
}
