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
 * Live = still collecting. A deal that is marked settled, or that has a
 * schedule with nothing left unpaid, is finished even if term_months is stale.
 */
export function isLiveDeal(
  agreement: { status?: string | null; term_months?: number | null },
  rows: { status?: string | null }[] | null | undefined
) {
  if (isSettledAgreement(agreement.status)) return false;
  const list = rows || [];
  if (list.length > 0 && list.every((r) => isPaidRow(r.status))) return false;
  return paidCount(list) < Number(agreement.term_months || 0) || list.length === 0;
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

/** True if a collection landed on or after one calendar month before today. */
export function receivedPaymentInLastMonth(
  rows: PaymentDateRow[] | null | undefined,
  today: string
) {
  const last = lastReceivedPaymentDate(rows);
  return !!last && last >= addCalendarMonths(today, -1);
}

/**
 * Past-due unpaid instalments, but only if we have not received a payment
 * in the last calendar month. Regular monthly collections should not sit
 * on the chase list just because an older row is still marked due.
 */
export function overdueSum(
  rows: PaymentDateRow[] | null | undefined,
  today: string
) {
  if (receivedPaymentInLastMonth(rows, today)) return 0;
  return roundMoney(
    (rows || [])
      .filter(
        (r) =>
          !isPaidRow(r.status) &&
          r.due_date &&
          String(r.due_date).slice(0, 10) < today
      )
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
