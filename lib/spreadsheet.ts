export type SheetPayment = {
  instalment_number: number;
  due_date: string;
  amount: number;
  paid: boolean;
};

export type SheetDeal = {
  agreement_number: string;
  agreement_type: "HP" | "FL" | "L";
  company_name: string;
  purchase_price: number | null;
  customer_deposit: number | null;
  total_lend: number | null;
  commission: number | null;
  documentation_fee: number | null;
  monthly_instalment: number;
  term_months: number;
  start_date: string;
  payments: SheetPayment[];
};

const SKIP_SHEETS = new Set([
  "Dashboard",
  "Totals",
  "Shareholder Value",
  "GoCardless Import",
  "GC Exceptions",
]);

const TICK = /^(✓|✔|yes|y)$/i;

function asNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 100) / 100;
  const n = Number(String(v).replace(/[,£]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function asIsoDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return new Date(
      Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())
    )
      .toISOString()
      .slice(0, 10);
  }
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const ms = excelEpoch + Math.round(v) * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const uk = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (uk) {
    const d = Number(uk[1]);
    const mo = Number(uk[2]);
    const y = Number(uk[3]);
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}

function label(v: unknown) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function agreementTypeFromTab(tab: string): "HP" | "FL" | "L" | null {
  const m = tab.trim().toUpperCase().match(/^(HP|FL|L)\d+$/);
  return m ? (m[1] as "HP" | "FL" | "L") : null;
}

function isPaidCell(v: unknown) {
  if (v === true) return true;
  const s = label(v);
  return TICK.test(s);
}

function isPaymentLabel(v: unknown) {
  return /payment/i.test(label(v));
}

export function parseAgreementRows(
  tab: string,
  rows: unknown[][]
): SheetDeal | null {
  const type = agreementTypeFromTab(tab);
  if (!type) return null;

  const company =
    label(rows[0]?.[1]) ||
    label(rows[0]?.[0]).replace(new RegExp(`^${tab}\\s*-\\s*`, "i"), "");
  if (!company || /^HP\d+\s*-\s*Customer Name$/i.test(company)) return null;

  let purchase_price: number | null = null;
  let customer_deposit: number | null = null;
  let total_lend: number | null = null;
  let commission: number | null = null;
  let documentation_fee: number | null = null;
  const payments: SheetPayment[] = [];

  for (const row of rows) {
    const b = label(row?.[1]);
    const c = asNumber(row?.[2]);
    if (/^Purchase Price/i.test(b)) purchase_price = c;
    else if (/^Customer Deposit/i.test(b)) customer_deposit = c;
    else if (/^Total Lend/i.test(b)) total_lend = c;
    else if (/^Commission/i.test(b)) commission = c;
    else if (/^Documentation Fee/i.test(b)) documentation_fee = c;

    if (!isPaymentLabel(row?.[1])) continue;
    const due = asIsoDate(row?.[0]);
    const amount = asNumber(row?.[2]);
    if (!due || amount == null || amount === 0) continue;
    // Ticks usually sit in E/F. Loan tabs put "Paid?" further right (I or L)
    // because D–H are the running-balance columns.
    const paid = (row || []).some(isPaidCell);
    payments.push({
      instalment_number: payments.length + 1,
      due_date: due,
      amount,
      paid,
    });
  }

  if (payments.length === 0) return null;

  return {
    agreement_number: tab.trim().toUpperCase(),
    agreement_type: type,
    company_name: company.replace(/\s+/g, " ").trim(),
    purchase_price,
    customer_deposit,
    total_lend,
    commission,
    documentation_fee,
    monthly_instalment: payments[0].amount,
    term_months: payments.length,
    start_date: payments[0].due_date,
    payments,
  };
}

export function parseWorkbookSheets(
  sheets: Record<string, unknown[][]>
): SheetDeal[] {
  const deals: SheetDeal[] = [];
  for (const [name, rows] of Object.entries(sheets)) {
    if (SKIP_SHEETS.has(name)) continue;
    const deal = parseAgreementRows(name, rows);
    if (deal) deals.push(deal);
  }
  deals.sort((a, b) => a.agreement_number.localeCompare(b.agreement_number));
  return deals;
}

export function normalizeCompany(name: string) {
  return name
    .toLowerCase()
    .replace(/\b(limited|ltd|llp|plc)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
