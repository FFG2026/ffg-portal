/**
 * Reads the "New Quote Proposal" email the DCF calculator sends. The body is a
 * two-column table (label, value) which arrives as plain text with a tab or a
 * colon between the label and the value.
 */

export type ProductType = "hp" | "fl" | "loan";

export type ParsedProposal = {
  repName: string | null;
  companyName: string | null;
  companyNumber: string | null;
  sentTo: string | null;
  productType: ProductType | null;
  productLabel: string | null;
  assetDescription: string | null;
  assetCondition: string | null;
  cashPrice: number | null;
  deposit: number | null;
  depositPct: number | null;
  vat: number | null;
  vatPct: number | null;
  financed: number | null;
  commission: number | null;
  commissionPct: number | null;
  termMonths: number | null;
  monthly: number | null;
  ratePct: number | null;
  supplierName: string | null;
  supplierNumber: string | null;
  /** Rows we did not recognise, kept so nothing in the email is lost. */
  extras: Record<string, string>;
  warnings: string[];
};

export function parseMoney(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = String(value).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function parenPct(value: string): number | null {
  const m = value.match(/\(([\d.]+)\s*%\)/);
  return m ? Number(m[1]) : null;
}

function nameAndNumber(value: string) {
  const m = value.trim().match(/^(.*?)\s*\(([A-Za-z0-9]{6,10})\)\s*$/);
  if (m) return { name: m[1].trim(), number: m[2].toUpperCase() };
  return { name: value.trim() || null, number: null as string | null };
}

export function productFromLabel(label: string | null): ProductType | null {
  const s = String(label || "").toLowerCase();
  if (!s) return null;
  if (s.includes("hire purchase") || /\bhp\b/.test(s)) return "hp";
  if (s.includes("lease")) return "fl";
  if (s.includes("loan")) return "loan";
  return null;
}

export function htmlToText(html: string) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(td|th)>/gi, "\t")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(tr|p|div|h[1-6]|li|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&pound;/g, "£")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/[  ]+/g, " ");
}

export function parseProposalText(rawText: string): ParsedProposal {
  const text = rawText.replace(/\r/g, "");
  const out: ParsedProposal = {
    repName: null,
    companyName: null,
    companyNumber: null,
    sentTo: null,
    productType: null,
    productLabel: null,
    assetDescription: null,
    assetCondition: null,
    cashPrice: null,
    deposit: null,
    depositPct: null,
    vat: null,
    vatPct: null,
    financed: null,
    commission: null,
    commissionPct: null,
    termMonths: null,
    monthly: null,
    ratePct: null,
    supplierName: null,
    supplierNumber: null,
    extras: {},
    warnings: [],
  };

  const rep =
    text.match(/(?:generated and sent by|Sent from the DCF calculator[^\n]*? by)\s+([^\n.]+?)\s*(?:\.|\n|$)/i);
  if (rep) out.repName = rep[1].trim();

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let label: string;
    let value: string;
    if (trimmed.includes("\t")) {
      const parts = trimmed.split("\t").map((p) => p.trim()).filter(Boolean);
      if (parts.length < 2) continue;
      label = parts[0];
      value = parts.slice(1).join(" ");
    } else {
      const m = trimmed.match(/^([A-Za-z][A-Za-z %()/&-]{1,40}?)\s*:\s*(.+)$/);
      if (!m) continue;
      label = m[1];
      value = m[2];
    }
    const key = label.toLowerCase().replace(/\s+/g, " ").trim();

    if (key === "customer") {
      const nn = nameAndNumber(value);
      out.companyName = nn.name;
      out.companyNumber = nn.number;
    } else if (key === "sent to") {
      out.sentTo = value.trim().toLowerCase();
    } else if (key === "product") {
      out.productLabel = value.trim();
      out.productType = productFromLabel(value);
    } else if (key === "asset details" || key === "asset") {
      const cond = value.match(/\((new|used|nearly new)\)\s*$/i);
      out.assetCondition = cond ? cond[1].toLowerCase() : null;
      out.assetDescription = value.replace(/\s*\((new|used|nearly new)\)\s*$/i, "").trim();
    } else if (key === "cash price") {
      out.cashPrice = parseMoney(value);
    } else if (key === "deposit") {
      out.deposit = parseMoney(value);
      out.depositPct = parenPct(value);
    } else if (key === "vat") {
      out.vat = parseMoney(value);
      out.vatPct = parenPct(value);
    } else if (key.startsWith("amount financed")) {
      out.financed = parseMoney(value);
    } else if (key.startsWith("commission")) {
      out.commission = parseMoney(value);
      const pctInLabel = key.match(/\(([\d.]+)\s*%\)/);
      out.commissionPct = pctInLabel ? Number(pctInLabel[1]) : parenPct(value);
    } else if (key === "term") {
      out.termMonths = parseMoney(value);
    } else if (key === "monthly payment") {
      out.monthly = parseMoney(value);
    } else if (key.startsWith("rate")) {
      out.ratePct = parseMoney(value);
    } else if (key === "supplier") {
      const nn = nameAndNumber(value);
      out.supplierName = nn.name;
      out.supplierNumber = nn.number;
    } else if (value.length < 200) {
      out.extras[label] = value;
    }
  }

  if (!out.companyName) out.warnings.push("Could not find the customer.");
  if (out.cashPrice === null) out.warnings.push("Could not find the cash price.");
  if (out.termMonths === null) out.warnings.push("Could not find the term.");
  if (out.monthly === null) out.warnings.push("Could not find the monthly payment.");
  if (out.ratePct === null) out.warnings.push("Could not find the rate.");
  if (!out.productType) out.warnings.push("Could not tell which product this is.");
  return out;
}
