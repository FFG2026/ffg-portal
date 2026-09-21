export type ParsedAgreementPdf = {
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  asset_description: string | null;
  purchase_price: number | null;
  customer_deposit: number | null;
  total_lend: number | null;
  documentation_fee: number | null;
  monthly_instalment: number | null;
  term_months: number | null;
  start_date: string | null;
};

export function isPlaceholderAsset(value: string | null | undefined) {
  const s = String(value || "").trim();
  return !s || /^pending\b/i.test(s);
}

function money(raw: string | null | undefined) {
  if (!raw) return null;
  const n = Number(String(raw).replace(/[,£\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function after(label: RegExp, text: string) {
  const m = text.match(label);
  return m?.[1]?.replace(/\s+/g, " ").trim() || null;
}

function titleCaseName(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => {
      if (/^(ltd|plc|uk|llp)$/i.test(w)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

function stripConditionAndPrice(line: string) {
  return line
    .replace(/\b(NEW|USED)\b[\s\S]*$/i, "")
    .replace(/\d{1,2}\/\d{1,2}\/\d{2,4}[\s\S]*$/g, "")
    .replace(/[£]?\s*[\d,]+\.\d{2}\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeJunkAssetLine(line: string) {
  return /^(as above|✔|yes|no|goods location|cost of goods|unit \d|carried over)\b/i.test(
    line
  );
}

export function cleanAssetLines(block: string | null | undefined) {
  if (!block) return null;
  const lines = String(block)
    .split(/\n+/)
    .map((line) => stripConditionAndPrice(line.replace(/\s+/g, " ").trim()))
    .filter((line) => line.length >= 4)
    .filter((line) => !looksLikeJunkAssetLine(line));
  if (!lines.length) return null;
  return Array.from(new Set(lines)).join(" & ");
}

const UK_REG = /^[A-Z]{1,3}\d{1,3}\s?[A-Z]{3}$/i;

export function parseEquipmentScheduleAssets(text: string): string | null {
  const blob = String(text || "").replace(/\r/g, "");
  if (
    !/equipment schedule/i.test(blob) &&
    !/Description of Goods[\s\S]{0,80}Registration/i.test(blob)
  ) {
    return null;
  }
  const cut = blob.match(
    /Date of Registration\s*([\s\S]*?)(?:Confirmed By Hirer|Final Audit Report|YOUR SIGNATURE)/i
  );
  const body = cut?.[1] || blob;
  const lines = body
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const skip =
    /^(used|new|signature|email|position|date:|director|agreement no)/i;
  const isYear = /^(19|20)\d{2}$/;
  const isDate = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/;
  const isChassis = /^[A-HJ-NPR-Z0-9]{11,17}$/i;

  const assets: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1] || "";
    if (!/^(used|new)$/i.test(next)) continue;
    if (
      skip.test(line) ||
      UK_REG.test(line) ||
      isYear.test(line) ||
      isDate.test(line) ||
      isChassis.test(line)
    ) {
      continue;
    }
    const maybeReg = lines[i + 2] || "";
    const desc = UK_REG.test(maybeReg)
      ? `${line} ${maybeReg.replace(/\s+/g, " ").toUpperCase()}`
      : line;
    assets.push(desc);
  }
  if (!assets.length) return null;
  return Array.from(new Set(assets)).join(" & ");
}

export function parseCostOfGoodsAssets(text: string): string | null {
  const blob = String(text || "").replace(/\r/g, "");
  const cut = blob.match(
    /COST OF GOODS[^\n]*\n([\s\S]*?)(?:This agreement is an invoice|HIRE PAYMENTS|Goods Location)/i
  );
  if (!cut) return null;
  return cleanAssetLines(cut[1]);
}

export function parseLeaseAgreementAssets(text: string): string | null {
  const blob = String(text || "").replace(/\r/g, "");
  if (!/Lease Agreement/i.test(blob) || !/The Goods \(Make\/Model\)/i.test(blob)) {
    return null;
  }
  const cut = blob.match(
    /The Goods \(Make\/Model\)[\s\S]{0,240}?applicable\)\s*([\s\S]*?)Supplier Name/i
  );
  if (!cut) return null;
  const lines = cut[1]
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !/^(new\/used|\(if applicable\))$/i.test(line));
  const assets: string[] = [];
  for (const line of lines) {
    const cleaned = stripConditionAndPrice(line)
      .replace(/\s*-\s*[A-Z0-9]{11,17}\s*$/i, "")
      .replace(/\s*-\s*$/, "")
      .trim();
    if (cleaned.length < 6) continue;
    if (/^new\/used$/i.test(cleaned)) continue;
    assets.push(cleaned);
  }
  if (!assets.length) return null;
  return Array.from(new Set(assets)).join(" & ");
}

export function parseAgreementPdfText(text: string): ParsedAgreementPdf {
  const blob = String(text || "").replace(/\r/g, "");

  let company = after(
    /Full Name:\s*([\s\S]*?)(?:Company Registration Number|Email:)/i,
    blob
  );
  if (company) {
    company = company.replace(/Company Registration Number.*$/i, "");
    company = company.replace(/(LTD|LIMITED)(?=Company)/i, "$1 ");
    company = titleCaseName(company);
  }

  const email = after(/Email:\s*([^\s\n]+)/i, blob);
  const contact = after(
    /Main Contact Name:\s*([\s\S]*?)(?:Address:|Telephone)/i,
    blob
  );
  const phone = after(/Telephone Number:\s*([0-9\s]+)/i, blob);

  const manufactureBlock = blob.match(
    /OF MANUFACTURE\s*([\s\S]*?)(?:Separate Goods Schedule|FINANCIAL DETAILS|AMOUNT OF EACH|HIRE PAYMENTS)/i
  )?.[1];
  let asset =
    cleanAssetLines(manufactureBlock || null) ||
    parseCostOfGoodsAssets(blob) ||
    parseEquipmentScheduleAssets(blob) ||
    parseLeaseAgreementAssets(blob);

  const purchase = money(
    after(/a\)\s*Cash price[^\n]*\n+\s*([\d,]+(?:\.\d{2})?)/i, blob)
  );
  const deposit = money(
    after(/f\)\s*Total deposit[^\n]*\n+\s*([\d,]+(?:\.\d{2})?)/i, blob) ||
      after(/d\)\s*Less: cash deposit[^\n]*\n+\s*([\d,]+(?:\.\d{2})?)/i, blob)
  );
  const lend = money(
    after(/g\)\s*Balance financed[^\n]*\n+\s*([\d,]+(?:\.\d{2})?)/i, blob)
  );
  const docFee = money(
    after(
      /(?:h|i)\)\s*Documentation fee[^\n]*\n+\s*([\d,]+(?:\.\d{2})?)/i,
      blob
    )
  );

  const hire = blob.match(
    /AMOUNT OF EACH HIRER PAYMENT[^\d]*(\d+)\s+Monthly\s+([\d,]+(?:\.\d{2})?)/i
  );
  const period = blob.match(/Period of Hire means\s+(\d+)\s+months/i);

  const start =
    after(/Final Audit Report\s+(\d{4}-\d{2}-\d{2})/i, blob) ||
    after(/Agreement completed\.\s+(\d{4}-\d{2}-\d{2})/i, blob) ||
    after(/Created:\s+(\d{4}-\d{2}-\d{2})/i, blob);

  return {
    company_name: company || null,
    contact_name: contact ? titleCaseName(contact) : null,
    email: email && email.includes("@") ? email.toLowerCase() : null,
    phone: phone ? phone.replace(/\s+/g, "") : null,
    asset_description: asset || null,
    purchase_price: purchase,
    customer_deposit: deposit,
    total_lend: lend,
    documentation_fee: docFee,
    monthly_instalment: hire ? money(hire[2]) : null,
    term_months: hire ? Number(hire[1]) : period ? Number(period[1]) : null,
    start_date: start,
  };
}
