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

/**
 * Balloons and settlement lumps sitting on this month's schedule are not
 * the monthly Direct Debit. A row more than 2× the contracted rent is a lump.
 */
export function isMonthlyBookAmount(
  amount: number | string | null | undefined,
  monthlyInstalment?: number | string | null
) {
  const a = Number(amount || 0);
  if (!(a > 0)) return false;
  const monthly = Number(monthlyInstalment || 0);
  if (!(monthly > 0)) return true;
  return a <= monthly * 2 + 0.009;
}

export type MonthInstalmentRow = {
  live?: boolean;
  monthly_instalment?: number | string | null;
  due_date?: string | null;
  amount?: number | string | null;
  status?: string | null;
};

/**
 * Unpaid monthly rents this month on live deals. Used with GoCardless
 * cash-in for the collection-rate ring.
 */
export function currentMonthInstalmentTotals(
  rows: MonthInstalmentRow[] | null | undefined,
  monthStart: string,
  nextMonth: string
) {
  let paid = 0;
  let unpaid = 0;
  for (const row of rows || []) {
    if (row.live === false) continue;
    const due = String(row.due_date || "").slice(0, 10);
    if (due.length < 10 || due < monthStart || due >= nextMonth) continue;
    if (!isMonthlyBookAmount(row.amount, row.monthly_instalment)) continue;
    const amount = Number(row.amount || 0);
    if (isPaidRow(row.status)) paid += amount;
    else unpaid += amount;
  }
  const collected = roundMoney(paid);
  const stillDue = roundMoney(unpaid);
  return {
    collected,
    still_due: stillDue,
    due: roundMoney(collected + stillDue),
  };
}

/** Ring: GoCardless cash in this month vs unpaid live rents still due. */
export function collectionRateFromCashAndDue(
  collectedThisMonth: number,
  stillDueThisMonth: number
) {
  const collected = roundMoney(Number(collectedThisMonth || 0));
  const stillDue = roundMoney(Number(stillDueThisMonth || 0));
  const due = roundMoney(collected + stillDue);
  const rate = due > 0 ? Math.round((collected / due) * 100) : 0;
  return { collected, still_due: stillDue, due, rate };
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

export function paidSum(
  rows: { status?: string | null; amount?: number | string | null }[] | null | undefined
) {
  return roundMoney(
    (rows || [])
      .filter((r) => isPaidRow(r.status))
      .reduce((sum, r) => sum + Number(r.amount || 0), 0)
  );
}

/** Amount we actually put on the book: net lend plus our commission. */
export function amountFinanced(agreement: {
  total_lend?: number | string | null;
  commission?: number | string | null;
}) {
  return roundMoney(
    Number(agreement.total_lend || 0) + Number(agreement.commission || 0)
  );
}

/** Day-one owing for net book value: including-interest figure when set. */
export function openingOwing(agreement: {
  total_lend?: number | string | null;
  total_repayable?: number | string | null;
  commission?: number | string | null;
}) {
  const repayable = Number(agreement.total_repayable || 0);
  if (repayable > 0) return roundMoney(repayable);
  return amountFinanced(agreement);
}

/** Still on the book: day-one owing minus collections received. */
export function netBookValue(
  agreement: {
    total_lend?: number | string | null;
    total_repayable?: number | string | null;
    commission?: number | string | null;
  },
  rows: { status?: string | null; amount?: number | string | null }[] | null | undefined
) {
  return Math.max(0, roundMoney(openingOwing(agreement) - paidSum(rows)));
}

export function isAsAndWhenDeal(agreement: {
  monthly_instalment?: number | string | null;
}) {
  return (
    agreement.monthly_instalment != null &&
    Number(agreement.monthly_instalment) <= 0
  );
}

/**
 * What is still owing. Contracted monthly deals use unpaid instalments.
 * As-and-when books use day-one owing minus receipts.
 */
export function settlementFigure(
  agreement: {
    monthly_instalment?: number | string | null;
    total_lend?: number | string | null;
    total_repayable?: number | string | null;
    commission?: number | string | null;
  },
  rows: { status?: string | null; amount?: number | string | null }[] | null | undefined
) {
  if (isAsAndWhenDeal(agreement)) return netBookValue(agreement, rows);
  return unpaidSum(rows);
}

/**
 * Live = still collecting. Finished only if marked settled, or every
 * schedule row is paid and we are not short of the contracted term.
 * A cancelled Direct Debit must not hide a deal that still has dues,
 * even if term_months was left at 1 from a stub import.
 * As-and-when books (no monthly Direct Debit) stay live until settled.
 */
export function isLiveDeal(
  agreement: {
    status?: string | null;
    term_months?: number | null;
    monthly_instalment?: number | string | null;
  },
  rows: { status?: string | null }[] | null | undefined
) {
  if (isSettledAgreement(agreement.status)) return false;
  if (
    agreement.monthly_instalment != null &&
    Number(agreement.monthly_instalment) <= 0
  ) {
    return String(agreement.status || "active").trim().toLowerCase() === "active";
  }
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
