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

  const assetLine = after(
    /OF MANUFACTURE\s*([\s\S]*?)(?:Separate Goods Schedule|FINANCIAL DETAILS)/i,
    blob
  );
  let asset: string | null = null;
  if (assetLine) {
    asset = assetLine
      .replace(/\bUSED\b.*$/i, "")
      .replace(/\bNEW\b.*$/i, "")
      .replace(/\d{1,2}\/\d{1,2}\/\d{2,4}.*$/g, "")
      .replace(/[\d,]+\.\d{2}\s*$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

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
