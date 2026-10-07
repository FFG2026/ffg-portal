import { roundMoney } from "./deal-status";

/**
 * Yield on money lent.
 *
 * A hire purchase balance amortises: the customer pays it down every month, so
 * the money actually employed over the term averages roughly half the opening
 * advance. Dividing total profit by the opening lend, or compounding that
 * ratio over the term, assumes the whole advance stays out for the whole term
 * and so reports about half the rate the book really earns.
 *
 * This solves the rate properly — the discount rate at which the contracted
 * instalments are worth the money advanced, which is what a lender means by
 * yield and what a bank would quote back.
 */

export type YieldDeal = {
  agreement_number?: string;
  total_lend?: number | string | null;
  commission?: number | string | null;
  monthly_instalment?: number | string | null;
  term_months?: number | null;
};

/** Money out of the door on payout day: the lend plus the introducer's commission. */
export function advanceOf(deal: YieldDeal) {
  return roundMoney(
    Number(deal.total_lend || 0) + Number(deal.commission || 0)
  );
}

/**
 * The contracted instalments: the monthly payment repeated over the term.
 *
 * This deliberately uses the agreement header rather than the stored schedule.
 * Yield here means the rate the deal was written at, so the contracted price
 * is the right input — a part settlement or a re-cut instalment changes what
 * was collected, not what was agreed. The stored rows are also a poor source
 * for a cash flow: they carry settlement lumps and split collections that put
 * two rows in one month, and they are not guaranteed to arrive in date order,
 * so reading them as one payment per month in sequence would misplace money
 * in time and quietly bend the rate.
 */
export function instalmentsOf(deal: YieldDeal): number[] {
  const monthly = Number(deal.monthly_instalment || 0);
  const term = Number(deal.term_months || 0);
  if (!(monthly > 0) || !(term > 0)) return [];
  return Array.from({ length: term }, () => monthly);
}

function presentValue(instalments: number[], monthlyRate: number) {
  let pv = 0;
  for (let i = 0; i < instalments.length; i++) {
    pv += instalments[i] / Math.pow(1 + monthlyRate, i + 1);
  }
  return pv;
}

/**
 * The monthly rate at which the instalments discount back to the advance,
 * found by bisection. Null when the schedule never repays what went out —
 * a legacy record with a part-imported schedule, which has no rate to find
 * and must not be averaged into one.
 */
export function monthlyRate(advance: number, instalments: number[]): number | null {
  if (!(advance > 0) || !instalments.length) return null;
  const total = instalments.reduce((sum, n) => sum + n, 0);
  if (!(total > advance)) return null;
  let lo = 0;
  let hi = 1;
  // A monthly rate above 100% is not a lending rate; treat it as unsolvable
  // rather than returning the bound.
  if (presentValue(instalments, hi) > advance) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (presentValue(instalments, mid) > advance) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The same rate expressed as a yearly percentage, to one decimal place. */
export function annualYield(advance: number, instalments: number[]): number | null {
  const r = monthlyRate(advance, instalments);
  if (r == null) return null;
  return Math.round((Math.pow(1 + r, 12) - 1) * 1000) / 10;
}

export function dealYield(deal: YieldDeal): number | null {
  return annualYield(advanceOf(deal), instalmentsOf(deal));
}

export type BookYield = {
  /** Yearly percentage, or 0 when nothing in the book can carry a rate. */
  annual_yield: number;
  /** Deals the rate is based on, and what they lent. */
  deals: number;
  lent: number;
  /** Deals left out because their schedule never repays the advance. */
  excluded_deals: number;
  excluded_lent: number;
};

/**
 * One rate for a set of deals: their cash flows are pooled by month offset and
 * solved together, so a deal weighs by how much it lent and for how long,
 * exactly as it would in the book's own cash flow. Averaging each deal's
 * percentage instead would let a 4,000 deal pull as hard as a 140,000 one.
 */
export function bookYield(deals: YieldDeal[]): BookYield {
  let advance = 0;
  let lent = 0;
  let excludedDeals = 0;
  let excludedLent = 0;
  const pooled: number[] = [];
  for (const deal of deals || []) {
    const a = advanceOf(deal);
    const rows = instalmentsOf(deal);
    if (monthlyRate(a, rows) == null) {
      excludedDeals += 1;
      excludedLent = roundMoney(excludedLent + Number(deal.total_lend || 0));
      continue;
    }
    advance += a;
    lent = roundMoney(lent + Number(deal.total_lend || 0));
    for (let i = 0; i < rows.length; i++) {
      pooled[i] = (pooled[i] || 0) + rows[i];
    }
  }
  const counted = (deals || []).length - excludedDeals;
  return {
    annual_yield: annualYield(advance, pooled) ?? 0,
    deals: counted,
    lent,
    excluded_deals: excludedDeals,
    excluded_lent: excludedLent,
  };
}

/** Profit as a share of the lend, over the whole term — not a yearly rate. */
export function marginOverTerm(profit: number, lent: number) {
  if (!(lent > 0)) return 0;
  return Math.round((profit / lent) * 1000) / 10;
}
