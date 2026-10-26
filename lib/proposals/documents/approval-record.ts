import type { SupabaseClient } from "@supabase/supabase-js";
import { driveAccessToken, findOrCreateDriveFolder, getAgreementsFolderId, uploadDriveFile } from "../../google/drive";
import { buildApprovalPdf } from "./approval-pdf";
import { reserveNumber } from "./raise";
import { winAnsi } from "./pdf-util";

type P = Record<string, any>;

const PRODUCT_TITLE: Record<string, string> = { hp: "Hire purchase", fl: "Finance lease", loan: "Loan" };
const gbp = (v: any) =>
  v === null || v === undefined || v === ""
    ? "-"
    : `£${Number(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Saves an approval record PDF (decision, notes, figures and the checks as they stood) into the
 * deal's folder in the FFG agreements folder. The agreement number is reserved now so the same
 * folder is used when the finance documents are raised later.
 */
export async function saveApprovalRecord(
  supabase: SupabaseClient,
  p: P,
  actorName: string
): Promise<{ agreement_number: string; folder_link: string; file_name: string; file_link: string }> {
  const product = p.product_type || "hp";
  const number = await reserveNumber(supabase, p);
  const companyName = String(p.company_name || "Unknown company");
  const folderName = winAnsi(`${number} - ${companyName}`).replace(/[\\/]/g, "-").slice(0, 150);

  const token = await driveAccessToken(supabase, { write: true });
  const parent = await getAgreementsFolderId(supabase, "ffg");
  const folder = await findOrCreateDriveFolder(token, parent, folderName);

  const agreed = p.agreed_monthly !== null && p.agreed_monthly !== undefined;
  const checks = ((p.checks as any[]) || []).map((c) => ({
    label: String(c.label),
    level: String(c.level),
    detail: String(c.detail),
  }));
  const pdf = await buildApprovalPdf({
    agreementNumber: number,
    company: companyName,
    companyNumber: p.company_number || null,
    product: PRODUCT_TITLE[product] || "Proposal",
    asset: p.asset_description || null,
    supplier: p.supplier_name || null,
    proposal: [
      ["Cash price", gbp(p.cash_price)],
      ["VAT", gbp(p.vat)],
      ["Deposit", gbp(p.deposit)],
      ["Commission", gbp(p.commission)],
      ["Amount financed", gbp(p.financed)],
      ["Term", p.term_months ? `${p.term_months} months` : "-"],
      ["Rate quoted", p.quoted_rate_pct !== null && p.quoted_rate_pct !== undefined ? `${p.quoted_rate_pct}%` : "-"],
      ["Monthly payment quoted", gbp(p.quoted_monthly)],
    ],
    agreed: agreed
      ? [
          ["Rate", `${p.agreed_rate_pct}%`],
          ["Term", `${p.agreed_term_months} months`],
          ["Deposit", gbp(p.agreed_deposit)],
          ["Commission", gbp(p.agreed_commission)],
          ["Amount financed", gbp(p.agreed_financed)],
          ["Monthly payment", gbp(p.agreed_monthly)],
          ["Total repayable", gbp(p.agreed_total_repayable)],
        ]
      : [],
    decision: p.uw_decision === "approve" ? "Approved" : p.uw_decision || "Not yet recorded",
    decidedBy: p.uw_by || null,
    decidedAt: p.uw_at || null,
    notes: p.uw_notes || null,
    checks,
    checksRunAt: p.checks_at || null,
    raisedBy: actorName,
  });

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ").replace(":", "-");
  const fileName = winAnsi(`Approval record - ${companyName} - ${number} - ${stamp}.pdf`).replace(/[\\/]/g, "-");
  const up = await uploadDriveFile(token, folder.id, fileName, "application/pdf", pdf);

  // Remember the reserved number so the documents step reuses this folder.
  await supabase
    .from("ffg_proposals")
    .update({ extras: { ...(p.extras || {}), reserved_agreement_number: number } })
    .eq("id", p.id);

  return { agreement_number: number, folder_link: folder.link, file_name: fileName, file_link: up.link };
}
