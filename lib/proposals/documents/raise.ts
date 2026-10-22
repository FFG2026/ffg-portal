import type { SupabaseClient } from "@supabase/supabase-js";
import { driveAccessToken, findOrCreateDriveFolder, getAgreementsFolderId, uploadDriveFile } from "../../google/drive";
import { fillHirePurchaseAgreement } from "./fill-hp";
import { fillPersonalGuarantee } from "./fill-pg";
import { buildApprovalPdf } from "./approval-pdf";
import { lookupCompanyForDocs } from "./companies-house";
import { HAVE } from "./types";
import { winAnsi } from "./pdf-util";

type P = Record<string, any>;

const TYPE_BY_PRODUCT: Record<string, string> = { hp: "HP", fl: "FL", loan: "L" };
const PRODUCT_TITLE: Record<string, string> = { hp: "Hire purchase", fl: "Finance lease", loan: "Loan" };
const gbp = (v: any) =>
  v === null || v === undefined || v === ""
    ? "-"
    : `£${Number(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const n = (v: any) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export type GuarantorInput = { name: string; dob: string; address: string };
export type RaiseInput = {
  contact_name?: string;
  email?: string;
  phone?: string;
  address_line1?: string;
  address_line2?: string;
  postcode?: string;
  signatory_name?: string;
  signatory_position?: string;
  documentation_fee?: number | null;
  option_fee?: number | null;
  guarantors?: GuarantorInput[];
  /** Goods details: the agreement is not raised without these. */
  description?: string;
  chassis?: string;
  reg?: string;
  reg_date?: string;
  condition?: string;
  goods_location1?: string;
  goods_location_postcode?: string;
  supplier_address1?: string;
  supplier_address2?: string;
  supplier_postcode?: string;
  insurer_name?: string;
  insurer_address1?: string;
  insurer_address2?: string;
  insurer_address3?: string;
  insurer_postcode?: string;
  insurer_policy?: string;
  insurer_expiry?: string;
};

/** Next free number for this product, counting both booked agreements and numbers already reserved. */
export async function nextAgreementNumber(supabase: SupabaseClient, productType: string, exceptProposalId: string) {
  const type = TYPE_BY_PRODUCT[productType] || "HP";
  const { data: existing } = await supabase.from("agreements").select("agreement_number").ilike("agreement_number", `${type}%`);
  let max = 0;
  const bump = (value: unknown) => {
    const s = String(value || "");
    if (!new RegExp(`^${type}\\d`, "i").test(s)) return;
    const m = s.match(/(\d+)/);
    if (m) max = Math.max(max, Number(m[1]));
  };
  for (const row of existing || []) bump(row.agreement_number);
  const { data: reserved } = await supabase.from("ffg_proposals").select("id, extras, status");
  for (const row of reserved || []) {
    if (row.id === exceptProposalId || row.status === "declined") continue;
    bump((row.extras as any)?.reserved_agreement_number);
  }
  return `${type}${max + 1}`;
}

export async function reserveNumber(supabase: SupabaseClient, p: P): Promise<string> {
  const have = p.extras?.reserved_agreement_number;
  if (have) return String(have);
  return nextAgreementNumber(supabase, p.product_type || "hp", p.id);
}

export async function documentsPrefill(supabase: SupabaseClient, p: P) {
  const company = p.company_number ? await lookupCompanyForDocs(p.company_number) : null;
  return {
    agreement_number: p.extras?.reserved_agreement_number || (await nextAgreementNumber(supabase, p.product_type || "hp", p.id)),
    reserved: Boolean(p.extras?.reserved_agreement_number),
    product: p.product_type || "hp",
    hp_supported: (p.product_type || "hp") === "hp",
    company: company ? { name: company.name, registered_office: company.registeredOffice, registered_in: company.registeredIn } : null,
    hirer: {
      contact_name: company?.directors?.[0]?.name || "",
      email: p.customer_email || "",
      phone: p.extras?.customer_phone || "",
      address_line1: company?.registeredOfficeParts.line1 || "",
      address_line2: company?.registeredOfficeParts.line2 || "",
      postcode: company?.registeredOfficeParts.postcode || "",
    },
    directors: (company?.directors || []).map((d) => ({ name: d.name, birth: d.birth, address: d.address })),
    documentation_fee: HAVE.defaultDocFee,
    option_fee: HAVE.defaultOptionFee,
    folder: p.extras?.docs?.folder_link || null,
  };
}

export type RaiseResult = {
  agreement_number: string;
  folder_link: string;
  folder_name: string;
  files: Array<{ name: string; link: string }>;
  skipped: string[];
  version: number;
};

export async function raiseDocuments(supabase: SupabaseClient, p: P, actorName: string, input: RaiseInput): Promise<RaiseResult> {
  if (!p.company_name) throw new Error("The proposal has no company name.");
  const product = p.product_type || "hp";
  // Nothing is saved or reserved until the deal details are all in.
  if (product === "hp") {
    const missing = [
      !input.chassis?.trim() && "chassis / serial number",
      !input.reg?.trim() && "registration (type N/A if there isn't one)",
      !input.reg_date?.trim() && "date of registration / year of manufacture",
    ].filter(Boolean);
    if (missing.length) throw new Error(`Add the ${missing.join(", ")} first – the documents are only raised once the deal is complete.`);
  }
  const number = await reserveNumber(supabase, p);
  const agreed = p.agreed_monthly !== null && p.agreed_monthly !== undefined;

  const cash = n(p.cash_price);
  if (cash === null) throw new Error("The proposal has no cash price.");
  const vat = n(p.vat);
  const deposit = (agreed ? n(p.agreed_deposit) : null) ?? n(p.deposit) ?? 0;
  const term = (agreed ? n(p.agreed_term_months) : null) ?? n(p.term_months);
  const monthly = (agreed ? n(p.agreed_monthly) : null) ?? n(p.quoted_monthly);

  const company = p.company_number ? await lookupCompanyForDocs(p.company_number) : null;
  const companyName = company?.name || p.company_name;
  const registeredOffice = company?.registeredOffice || "";
  const folderName = winAnsi(`${number} - ${companyName}`).replace(/[\\/]/g, "-").slice(0, 150);

  const token = await driveAccessToken(supabase, { write: true });
  const parent = await getAgreementsFolderId(supabase, "ffg");
  const folder = await findOrCreateDriveFolder(token, parent, folderName);

  const prev = p.extras?.docs;
  const version = (Number(prev?.version) || 0) + 1;
  const tag = version > 1 ? ` (v${version})` : "";
  const files: Array<{ name: string; link: string }> = [];
  const skipped: string[] = [];
  const pdf = "application/pdf";
  const save = async (name: string, bytes: Uint8Array) => {
    const clean = winAnsi(name).replace(/[\\/]/g, "-");
    const up = await uploadDriveFile(token, folder.id, clean, pdf, bytes);
    files.push({ name: clean, link: up.link });
  };

  // 1. Approval record
  const checks = ((p.checks as any[]) || []).map((c) => ({ label: String(c.label), level: String(c.level), detail: String(c.detail) }));
  const approval = await buildApprovalPdf({
    agreementNumber: number,
    company: companyName,
    companyNumber: p.company_number || null,
    product: PRODUCT_TITLE[product] || "Proposal",
    asset: input.description?.trim() || p.asset_description || null,
    supplier: p.supplier_name || null,
    proposal: [
      ["Cash price", gbp(p.cash_price)],
      ["VAT", gbp(p.vat)],
      ["Deposit", gbp(p.deposit)],
      ["Commission", gbp(p.commission)],
      ["Amount financed", gbp(p.financed)],
      ["Term", p.term_months ? `${p.term_months} months` : "-"],
      ["Rate quoted", p.quoted_rate_pct !== null ? `${p.quoted_rate_pct}%` : "-"],
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
    decision: p.uw_decision === "approve" ? "Approved" : p.uw_decision === "refer" ? "Referred / on hold" : p.uw_decision || "Not yet recorded",
    decidedBy: p.uw_by || null,
    decidedAt: p.uw_at || null,
    notes: p.uw_notes || null,
    checks,
    raisedBy: actorName,
  });
  await save(`Approval - ${companyName} - ${number}${tag}.pdf`, approval);

  // 2. Hire purchase agreement
  if (product === "hp") {
    if (!term || !monthly) {
      skipped.push("Hire purchase agreement: the term or monthly payment is missing.");
    } else {
      const signatory = input.signatory_name || input.contact_name || input.guarantors?.[0]?.name || "";
      const hp = await fillHirePurchaseAgreement({
        agreementNumber: number,
        hirerName: companyName,
        companyNumber: p.company_number || "",
        email: input.email?.trim() || "",
        contactName: input.contact_name || signatory,
        phone: input.phone || p.extras?.customer_phone || "",
        addressLine1: input.address_line1 || company?.registeredOfficeParts.line1 || "",
        addressLine2: input.address_line2 || company?.registeredOfficeParts.line2 || "",
        postcode: input.postcode || company?.registeredOfficeParts.postcode || "",
        goods: [{ description: input.description?.trim() || p.asset_description || "", chassis: input.chassis, reg: input.reg, condition: input.condition || p.asset_condition || "", regDate: input.reg_date }],
        cashPrice: cash,
        vat,
        deposit,
        documentationFee: input.documentation_fee === undefined ? HAVE.defaultDocFee : input.documentation_fee,
        termMonths: term,
        monthly,
        optionFee: input.option_fee ?? HAVE.defaultOptionFee,
        supplierName: p.supplier_name || "",
        supplierAddress1: input.supplier_address1,
        supplierAddress2: input.supplier_address2,
        supplierPostcode: input.supplier_postcode,
        goodsLocation1: input.goods_location1,
        goodsLocationPostcode: input.goods_location_postcode,
        insurer: {
          name: input.insurer_name,
          address1: input.insurer_address1,
          address2: input.insurer_address2,
          address3: input.insurer_address3,
          postcode: input.insurer_postcode,
          policy: input.insurer_policy,
          expiry: input.insurer_expiry,
        },
        signatoryName: signatory,
        signatoryPosition: input.signatory_position || "Director",
      });
      await save(`HP Agreement - ${companyName} - ${number}${tag}.pdf`, hp);
    }
  } else {
    skipped.push(`There is no ${PRODUCT_TITLE[product] || product} agreement template yet, so only the approval and guarantees were raised.`);
  }

  // 3. A personal guarantee per director
  const guarantors = (input.guarantors || []).filter((g) => g.name?.trim());
  if (!guarantors.length) skipped.push("No directors were given, so no personal guarantees were raised.");
  for (const g of guarantors) {
    const bytes = await fillPersonalGuarantee({
      guarantorName: g.name.trim(),
      guarantorDob: g.dob || "",
      guarantorAddress: g.address || "",
      companyName,
      companyNumber: p.company_number || "",
      companyAddress: registeredOffice,
      registeredOffice,
      registeredIn: company?.registeredIn === "Scotland" ? "Scotland" : "England",
    });
    await save(`Personal Guarantee - ${g.name.trim()} - ${companyName} - ${number}${tag}.pdf`, bytes);
  }

  return { agreement_number: number, folder_link: folder.link, folder_name: folderName, files, skipped, version };
}
