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
