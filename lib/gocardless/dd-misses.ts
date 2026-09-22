import { FAILED_STATUSES, type GoCardlessPayment } from "./match-payments";

/** Miss tracking starts September 2026 — older failures stay off the board. */
export const DD_MISS_FROM = "2026-09-01";

const MISS_STATUSES = new Set(["failed", "charged_back"]);

export type DdMissRow = {
  agreement_id: string;
  gc_payment_id: string;
  charge_date: string;
  month: string;
  amount: number;
  gc_status: string;
};

export function isDdMissStatus(status: string | null | undefined) {
  const value = String(status || "").toLowerCase();
  return MISS_STATUSES.has(value) && FAILED_STATUSES.has(value);
}

export function monthKeyFromDate(value: string) {
  return String(value || "").slice(0, 7);
}

export function monthStartFromKey(month: string) {
  return `${month}-01`;
}

export function monthLabelFromKey(month: string) {
  const date = new Date(`${month}-01T00:00:00Z`);
  return date.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function missMonthsFrom(fromInclusive = DD_MISS_FROM, through = new Date().toISOString().slice(0, 10)) {
  const months: string[] = [];
  const cursor = new Date(`${fromInclusive.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${through.slice(0, 7)}-01T00:00:00Z`);
  while (cursor <= end) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

export function missRowsFromGcPayments(
  agreementId: string,
  gcPayments: GoCardlessPayment[],
  fromInclusive = DD_MISS_FROM
): DdMissRow[] {
  const rows: DdMissRow[] = [];
  const seen = new Set<string>();
  for (const payment of gcPayments || []) {
    if (!isDdMissStatus(payment.status) || !payment.charge_date) continue;
    const charge = String(payment.charge_date).slice(0, 10);
    if (charge < fromInclusive) continue;
    if (seen.has(payment.id)) continue;
    seen.add(payment.id);
    rows.push({
      agreement_id: agreementId,
      gc_payment_id: payment.id,
      charge_date: charge,
      month: `${charge.slice(0, 7)}-01`,
      amount: Math.round(Number(payment.amount) || 0) / 100,
      gc_status: String(payment.status).toLowerCase(),
    });
  }
  return rows;
}

export function uniqueMonths(rows: { month?: string; charge_date?: string }[]) {
  const months = new Set<string>();
  for (const row of rows || []) {
    const key = monthKeyFromDate(String(row.month || row.charge_date || ""));
    if (key.length === 7) months.add(key);
  }
  return Array.from(months).sort();
}

export type DdMissSummary = {
  agreement_number: string;
  company_name: string;
  months: string[];
  latest_amount: number;
  latest_charge_date: string;
};

export function summariseDdMisses(
  rows: {
    agreement_id: string;
    charge_date: string;
    amount: number | string;
    month?: string;
  }[],
  metaByAgreement: Map<string, { agreement_number: string; company_name: string }>
): DdMissSummary[] {
  const grouped = new Map<
    string,
    { months: Set<string>; latest_amount: number; latest_charge_date: string }
  >();
  for (const row of rows || []) {
    const meta = metaByAgreement.get(row.agreement_id);
    if (!meta) continue;
    const month = monthKeyFromDate(String(row.month || row.charge_date));
    const charge = String(row.charge_date).slice(0, 10);
    const existing = grouped.get(row.agreement_id) || {
      months: new Set<string>(),
      latest_amount: 0,
      latest_charge_date: "",
    };
    if (month.length === 7) existing.months.add(month);
    if (charge >= existing.latest_charge_date) {
      existing.latest_charge_date = charge;
      existing.latest_amount = Number(row.amount || 0);
    }
    grouped.set(row.agreement_id, existing);
  }

  return Array.from(grouped.entries())
    .map(([agreementId, value]) => {
      const meta = metaByAgreement.get(agreementId)!;
      return {
        agreement_number: meta.agreement_number,
        company_name: meta.company_name,
        months: Array.from(value.months).sort(),
        latest_amount: Math.round(value.latest_amount * 100) / 100,
        latest_charge_date: value.latest_charge_date,
      };
    })
    .sort((a, b) => b.months.length - a.months.length || a.agreement_number.localeCompare(b.agreement_number));
}
