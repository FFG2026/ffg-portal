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

export function overdueSum(
  rows:
    | {
        status?: string | null;
        amount?: number | string | null;
        due_date?: string | null;
      }[]
    | null
    | undefined,
  today: string
) {
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
  rows: {
    status?: string | null;
    amount?: number | string | null;
    due_date?: string | null;
  }[] | null | undefined,
  today: string
) {
  if (!isLiveDeal(agreement, rows)) return 0;
  return overdueSum(rows, today);
}
