import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPaymentSchedule } from "../schedule";
import { findOrCreateCustomer } from "../admin-deal";
import { parseDealFolderTitle } from "./folder-match";
import {
  driveAccessToken,
  downloadDriveFile,
  listDriveChildren,
  type DriveFile,
} from "./drive";
import { parseAgreementPdfBuffer } from "./extract-pdf";

function pickAgreementPdf(files: DriveFile[]) {
  const pdfs = files.filter(
    (f) =>
      f.mimeType === "application/pdf" || /\.pdf$/i.test(f.name)
  );
  const scored = pdfs.map((file) => {
    const name = file.name.toLowerCase();
    let score = 0;
    if (name.includes("signed")) score += 6;
    if (/hire purchase|finance lease|loan agreement/.test(name)) score += 5;
    if (name.includes("agreement")) score += 3;
    if (name.includes("invoice") || name.startsWith("inv")) score -= 6;
    return { file, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.file || null;
}

export async function ingestDealFromFolder(
  supabase: SupabaseClient,
  folder: { id: string; name: string; createdTime?: string; modifiedTime?: string }
) {
  const parsedFolder = parseDealFolderTitle(folder.name);
  if (!parsedFolder) {
    return { skipped: true as const, reason: "Folder name is not an HP / FL / L deal" };
  }
  const agreementNumber = parsedFolder.agreement_number;
  const accessToken = await driveAccessToken(supabase);
  const files = await listDriveChildren(accessToken, folder.id, false);
  const pdf = pickAgreementPdf(files);

  let details = {
    company_name: parsedFolder.company,
    contact_name: null as string | null,
    email: null as string | null,
    phone: null as string | null,
    asset_description: null as string | null,
    purchase_price: null as number | null,
    customer_deposit: null as number | null,
    total_lend: null as number | null,
    documentation_fee: null as number | null,
    monthly_instalment: null as number | null,
    term_months: null as number | null,
    start_date: (folder.createdTime || folder.modifiedTime || "").slice(0, 10) || null,
  };

  if (pdf) {
    try {
      const buffer = await downloadDriveFile(accessToken, pdf.id);
      const fromPdf = await parseAgreementPdfBuffer(buffer);
      details = {
        company_name: fromPdf.company_name || details.company_name,
        contact_name: fromPdf.contact_name,
        email: fromPdf.email,
        phone: fromPdf.phone,
        asset_description: fromPdf.asset_description,
        purchase_price: fromPdf.purchase_price,
        customer_deposit: fromPdf.customer_deposit,
        total_lend: fromPdf.total_lend,
        documentation_fee: fromPdf.documentation_fee,
        monthly_instalment: fromPdf.monthly_instalment,
        term_months: fromPdf.term_months,
        start_date: fromPdf.start_date || details.start_date,
      };
    } catch {
      // Folder name still lets us create a stub deal to amend.
    }
  }

  const { data: existing } = await supabase
    .from("agreements")
    .select("id, monthly_instalment, term_months, start_date")
    .ilike("agreement_number", agreementNumber)
    .maybeSingle();

  const companyName = details.company_name || parsedFolder.company || agreementNumber;
  const customerId = await findOrCreateCustomer(supabase, {
    company_name: companyName,
    contact_name: details.contact_name || undefined,
    email: details.email || undefined,
    phone: details.phone || undefined,
  });

  const monthly = details.monthly_instalment;
  const termMonths = details.term_months;
  const startDate = details.start_date;

  if (existing) {
    await supabase
      .from("agreements")
      .update({
        customer_id: customerId,
        google_folder_id: folder.id,
        google_folder_name: folder.name,
        asset_description: details.asset_description,
        purchase_price: details.purchase_price,
        customer_deposit: details.customer_deposit,
        total_lend: details.total_lend,
        documentation_fee: details.documentation_fee,
        monthly_instalment: monthly ?? existing.monthly_instalment,
        term_months: termMonths ?? existing.term_months,
        start_date: startDate || existing.start_date,
      })
      .eq("id", existing.id);

    const { count } = await supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("agreement_id", existing.id);
    if (
      (count || 0) === 0 &&
      monthly &&
      termMonths &&
      (startDate || existing.start_date)
    ) {
      const schedule = buildPaymentSchedule({
        termMonths,
        monthlyInstalment: monthly,
        startDate: String(startDate || existing.start_date).slice(0, 10),
      }).map((row) => ({ ...row, agreement_id: existing.id }));
      await supabase.from("payments").insert(schedule);
    }
    return { skipped: false as const, created: false, agreement_number: agreementNumber };
  }

  if (!monthly || !termMonths || !startDate) {
    const { data: stub, error } = await supabase
      .from("agreements")
      .insert({
        agreement_number: agreementNumber,
        agreement_type: agreementNumber.replace(/\d+$/, ""),
        customer_id: customerId,
        asset_description: details.asset_description,
        purchase_price: details.purchase_price,
        customer_deposit: details.customer_deposit,
        total_lend: details.total_lend,
        documentation_fee: details.documentation_fee,
        monthly_instalment: monthly || 0,
        term_months: termMonths || 0,
        start_date: startDate || new Date().toISOString().slice(0, 10),
        status: "active",
        google_folder_id: folder.id,
        google_folder_name: folder.name,
      })
      .select("agreement_number")
      .single();
    if (error) throw new Error(error.message);
    return {
      skipped: false as const,
      created: true,
      incomplete: true,
      agreement_number: stub.agreement_number,
    };
  }

  const { data: created, error } = await supabase
    .from("agreements")
    .insert({
      agreement_number: agreementNumber,
      agreement_type: agreementNumber.replace(/\d+$/, ""),
      customer_id: customerId,
      asset_description: details.asset_description,
      purchase_price: details.purchase_price,
      customer_deposit: details.customer_deposit,
      total_lend: details.total_lend ?? monthly * termMonths,
      documentation_fee: details.documentation_fee,
      monthly_instalment: monthly,
      term_months: termMonths,
      start_date: startDate,
      status: "active",
      google_folder_id: folder.id,
      google_folder_name: folder.name,
    })
    .select("id, agreement_number")
    .single();
  if (error || !created) throw new Error(error?.message || "Could not create agreement");

  const schedule = buildPaymentSchedule({
    termMonths,
    monthlyInstalment: monthly,
    startDate,
  }).map((row) => ({ ...row, agreement_id: created.id }));
  const { error: payErr } = await supabase.from("payments").insert(schedule);
  if (payErr) throw new Error(payErr.message);

  return {
    skipped: false as const,
    created: true,
    incomplete: false,
    agreement_number: created.agreement_number,
  };
}
