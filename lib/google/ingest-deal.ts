import type { SupabaseClient } from "@supabase/supabase-js";
import { addMonths, buildPaymentSchedule } from "../schedule";
import { findOrCreateCustomer } from "../admin-deal";
import { fetchAllRows } from "../supabase/fetch-all";
import { parseDealFolderTitle } from "./folder-match";
import {
  driveAccessToken,
  downloadDriveFile,
  listDriveChildren,
  type DriveFile,
} from "./drive";
import { parseAgreementPdfBuffer } from "./extract-pdf";
import {
  isPlaceholderAsset,
  type ParsedAgreementPdf,
} from "./parse-agreement-pdf";

function emptyDetails(companyName: string | null, startDate: string | null) {
  return {
    company_name: companyName,
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
    start_date: startDate,
  };
}

function scoreDealPdf(file: DriveFile) {
  const name = file.name.toLowerCase();
  let score = 0;
  if (name.includes("signed")) score += 6;
  if (/hire purchase|finance lease|loan agreement|lease agreement/.test(name))
    score += 5;
  if (name.includes("agreement")) score += 3;
  if (/equip(t)?ment sched|goods schedule/.test(name)) score += 4;
  if (name.includes("signed docs")) score += 2;
  if (name.includes("invoice") || name.startsWith("inv")) score -= 8;
  if (name.includes("guarantee") || name.includes("proposal")) score -= 5;
  return score;
}

async function listDealDocuments(accessToken: string, folderId: string) {
  const files = await listDriveChildren(accessToken, folderId, false);
  const nested: DriveFile[] = [];
  for (const sub of files.filter(
    (file) => file.mimeType === "application/vnd.google-apps.folder"
  ).slice(0, 4)) {
    nested.push(...(await listDriveChildren(accessToken, sub.id, false)));
  }
  return [...files, ...nested];
}

export function pickAgreementPdfs(files: DriveFile[]) {
  const pdfs = files.filter(
    (f) => f.mimeType === "application/pdf" || /\.pdf$/i.test(f.name)
  );
  return pdfs
    .map((file) => ({ file, score: scoreDealPdf(file) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.file);
}

function mergeParsed(
  base: ReturnType<typeof emptyDetails>,
  extra: ParsedAgreementPdf
) {
  return {
    company_name: base.company_name || extra.company_name,
    contact_name: base.contact_name || extra.contact_name,
    email: base.email || extra.email,
    phone: base.phone || extra.phone,
    asset_description: base.asset_description || extra.asset_description,
    purchase_price: base.purchase_price ?? extra.purchase_price,
    customer_deposit: base.customer_deposit ?? extra.customer_deposit,
    total_lend: base.total_lend ?? extra.total_lend,
    documentation_fee: base.documentation_fee ?? extra.documentation_fee,
    monthly_instalment: base.monthly_instalment ?? extra.monthly_instalment,
    term_months: base.term_months ?? extra.term_months,
    start_date: extra.start_date || base.start_date,
  };
}

async function detailsFromFolderFiles(
  accessToken: string,
  files: DriveFile[],
  fallback: ReturnType<typeof emptyDetails>
) {
  let details = fallback;
  for (const pdf of pickAgreementPdfs(files).slice(0, 5)) {
    try {
      const buffer = await downloadDriveFile(accessToken, pdf.id);
      const fromPdf = await parseAgreementPdfBuffer(buffer);
      details = mergeParsed(details, fromPdf);
      if (details.asset_description && details.monthly_instalment) break;
    } catch {
      // Try the next signed agreement / goods schedule in the folder.
    }
  }
  return details;
}

export async function ingestDealFromFolder(
  supabase: SupabaseClient,
  folder: { id: string; name: string; createdTime?: string; modifiedTime?: string }
) {
  const parsedFolder = parseDealFolderTitle(folder.name);
  if (!parsedFolder) {
    return { skipped: true as const, reason: "Folder name is not an HP / FL / L / GG deal" };
  }
  const agreementNumber = parsedFolder.agreement_number;
  const accessToken = await driveAccessToken(supabase);
  const files = await listDealDocuments(accessToken, folder.id);

  const details = await detailsFromFolderFiles(
    accessToken,
    files,
    emptyDetails(
      parsedFolder.company,
      (folder.createdTime || folder.modifiedTime || "").slice(0, 10) || null
    )
  );

  const { data: existing } = await supabase
    .from("agreements")
    .select(
      "id, customer_id, monthly_instalment, term_months, start_date, asset_description, purchase_price, customer_deposit, total_lend, documentation_fee"
    )
    .ilike("agreement_number", agreementNumber)
    .maybeSingle();

  const companyName = details.company_name || parsedFolder.company || agreementNumber;
  let customerId = existing?.customer_id as string | undefined;
  if (!customerId) {
    customerId = await findOrCreateCustomer(supabase, {
      company_name: companyName,
      contact_name: details.contact_name || undefined,
      email: details.email || undefined,
      phone: details.phone || undefined,
    });
  }

  const monthly = details.monthly_instalment;
  const termMonths = details.term_months;
  const startDate = details.start_date;

  if (existing) {
    const { data: firstPay } = await supabase
      .from("payments")
      .select("due_date")
      .eq("agreement_id", existing.id)
      .order("due_date", { ascending: true })
      .limit(1)
      .maybeSingle();
    const alignedStart = firstPay?.due_date
      ? addMonths(String(firstPay.due_date).slice(0, 10), -1)
      : existing.start_date || startDate;

    const patch: Record<string, unknown> = {
      google_folder_id: folder.id,
      google_folder_name: folder.name,
      start_date: alignedStart,
    };
    if (isPlaceholderAsset(existing.asset_description) && details.asset_description) {
      patch.asset_description = details.asset_description;
    }
    if (existing.purchase_price == null && details.purchase_price != null) {
      patch.purchase_price = details.purchase_price;
    }
    if (existing.customer_deposit == null && details.customer_deposit != null) {
      patch.customer_deposit = details.customer_deposit;
    }
    if (existing.total_lend == null && details.total_lend != null) {
      patch.total_lend = details.total_lend;
    }
    if (existing.documentation_fee == null && details.documentation_fee != null) {
      patch.documentation_fee = details.documentation_fee;
    }
    if (!existing.monthly_instalment && monthly) {
      patch.monthly_instalment = monthly;
    }
    if (!existing.term_months && termMonths) {
      patch.term_months = termMonths;
    }

    await supabase.from("agreements").update(patch).eq("id", existing.id);

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
    return {
      skipped: false as const,
      created: false,
      filled_asset: Boolean(patch.asset_description),
      agreement_number: agreementNumber,
    };
  }

  const agreementType = agreementNumber.replace(/\d+$/, "");
  const book = agreementType === "GG" ? "gg" : "ffg";

  if (!monthly || !termMonths || !startDate) {
    const { data: stub, error } = await supabase
      .from("agreements")
      .insert({
        agreement_number: agreementNumber,
        agreement_type: agreementType,
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
        book,
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
      agreement_type: agreementType,
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
      book,
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

export async function fillPendingAssetsFromDrive(
  supabase: SupabaseClient,
  limit = 25
) {
  const agreements = await fetchAllRows(() =>
    supabase
      .from("agreements")
      .select(
        "id, agreement_number, asset_description, google_folder_id, google_folder_name"
      )
  );

  const pending = agreements.filter(
    (row) => row.google_folder_id && isPlaceholderAsset(row.asset_description)
  );

  const filled: string[] = [];
  const errors: { name: string; error: string }[] = [];

  for (const row of pending.slice(0, limit)) {
    try {
      const added = await ingestDealFromFolder(supabase, {
        id: row.google_folder_id as string,
        name: row.google_folder_name || row.agreement_number,
      });
      if (!added.skipped && added.filled_asset) {
        filled.push(added.agreement_number);
      }
    } catch (err: any) {
      errors.push({
        name: row.agreement_number,
        error: err.message || "Could not read deal folder",
      });
    }
  }

  return {
    pending: pending.length,
    filled,
    errors,
  };
}
