export function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

export function isPaidRow(status: string | null | undefined) {
  return String(status || "").trim().toLowerCase() === "paid";
}

export function isSettledAgreement(status: string | null | undefined) {
  return String(status || "").trim().toLowerCase() === "settled";
}

export function paidCount(
  rows: { status?: string | null }[] | null | undefined
) {
  return (rows || []).filter((r) => isPaidRow(r.status)).length;
}

/** Sum of instalments not yet marked paid — this is the amount still owing. */
export function unpaidSum(
  rows: { status?: string | null; amount?: number | string | null }[] | null | undefined
) {
  return roundMoney(
    (rows || [])
      .filter((r) => !isPaidRow(r.status))
      .reduce((sum, r) => sum + Number(r.amount || 0), 0)
  );
}

/**
 * Live = still collecting. Finished only if marked settled, or every
 * schedule row is paid and we are not short of the contracted term.
 * A cancelled Direct Debit must not hide a deal that still has dues,
 * even if term_months was left at 1 from a stub import.
 */
export function isLiveDeal(
  agreement: { status?: string | null; term_months?: number | null },
  rows: { status?: string | null }[] | null | undefined
) {
  if (isSettledAgreement(agreement.status)) return false;
  const list = rows || [];
  if (list.some((r) => !isPaidRow(r.status))) return true;
  if (list.length === 0) return Number(agreement.term_months || 0) > 0;
  return paidCount(list) < Number(agreement.term_months || 0);
}

export type PaymentDateRow = {
  status?: string | null;
  amount?: number | string | null;
  due_date?: string | null;
  paid_date?: string | null;
};

export function addCalendarMonths(iso: string, months: number) {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}

/** First day of the calendar month before today. 21 Sep → 1 Aug. */
export function startOfLastCalendarMonth(today: string) {
  return addCalendarMonths(`${today.slice(0, 8)}01`, -1);
}

/** Latest collected date on paid rows (paid_date, else the instalment due date). */
export function lastReceivedPaymentDate(
  rows: PaymentDateRow[] | null | undefined
) {
  let latest: string | null = null;
  for (const r of rows || []) {
    if (!isPaidRow(r.status)) continue;
    const d = String(r.paid_date || r.due_date || "").slice(0, 10);
    if (d.length >= 10 && (!latest || d > latest)) latest = d;
  }
  return latest;
}

/** True if a collection landed in this calendar month or the previous one. */
export function receivedPaymentInLastMonth(
  rows: PaymentDateRow[] | null | undefined,
  today: string
) {
  const last = lastReceivedPaymentDate(rows);
  return !!last && last >= startOfLastCalendarMonth(today);
}

function lastPaidDueDate(rows: PaymentDateRow[] | null | undefined) {
  let latest: string | null = null;
  for (const r of rows || []) {
    if (!isPaidRow(r.status)) continue;
    const d = String(r.due_date || "").slice(0, 10);
    if (d.length >= 10 && (!latest || d > latest)) latest = d;
  }
  return latest;
}

/**
 * Chase list: no collection since the start of last month, and at least one
 * unpaid instalment a full month late. Unticked rows that sit before later
 * paid instalments are sheet holes, not arrears.
 */
export function overdueSum(
  rows: PaymentDateRow[] | null | undefined,
  today: string
) {
  if (receivedPaymentInLastMonth(rows, today)) return 0;
  const paidThrough = lastPaidDueDate(rows);
  const monthLateBy = addCalendarMonths(today, -1);
  return roundMoney(
    (rows || [])
      .filter((r) => {
        if (isPaidRow(r.status) || !r.due_date) return false;
        const due = String(r.due_date).slice(0, 10);
        if (due.length < 10 || due >= today || due > monthLateBy) return false;
        if (paidThrough && due <= paidThrough) return false;
        return true;
      })
      .reduce((sum, r) => sum + Number(r.amount || 0), 0)
  );
}

/**
 * Overdue on a finished deal is leftover sheet noise, not a collection to chase.
 */
export function liveOverdueSum(
  agreement: { status?: string | null; term_months?: number | null },
  rows: PaymentDateRow[] | null | undefined,
  today: string
) {
  if (!isLiveDeal(agreement, rows)) return 0;
  return overdueSum(rows, today);
}

/**
 * Vantage Vehicles is on a temporary special arrangement — keep those
 * agreements off the chase list and overdue totals until that changes.
 */
export function isSpecialOverdueArrangement(
  companyName: string | null | undefined
) {
  const name = String(companyName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return /\bvantage vehicles?\b/.test(name);
}

export function chaseOverdueSum(
  companyName: string | null | undefined,
  agreement: { status?: string | null; term_months?: number | null },
  rows: PaymentDateRow[] | null | undefined,
  today: string
) {
  if (isSpecialOverdueArrangement(companyName)) return 0;
  return liveOverdueSum(agreement, rows, today);
}
