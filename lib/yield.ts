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
  payments?: { amount?: number | string | null; due_date?: string | null }[];
};

/** Money out of the door on payout day: the lend plus the introducer's commission. */
export function advanceOf(deal: YieldDeal) {
  return roundMoney(
    Number(deal.total_lend || 0) + Number(deal.commission || 0)
  );
}

/**
 * The deal's cash flow, month by month from its first instalment.
 *
 * The stored schedule is used when there is one, because it is what the deal
 * actually runs on: a re-cut instalment, a part settlement or a lump all sit
 * in it, and several agreements carry a schedule their header no longer
 * matches. Rows are bucketed by how many months each falls after the first,
 * which is what makes them safe to use — two collections in one month (a
 * payment split to stay under the 5,000 Direct Debit cap) add together
 * instead of being read as two months, a month with nothing is a zero rather
 * than being closed up, and the order rows arrive in does not matter.
 *
 * The header is the fallback for a deal with no schedule yet.
 */
function monthsBetween(from: string, to: string) {
  const a = String(from).slice(0, 10);
  const b = String(to).slice(0, 10);
  return (
    (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 +
    (Number(b.slice(5, 7)) - Number(a.slice(5, 7)))
  );
}

/** A schedule reaching further out than this is a bad date, not a term. */
const MAX_SCHEDULE_MONTHS = 600;

export function instalmentsOf(deal: YieldDeal): number[] {
  const dated = (deal.payments || [])
    .filter((r) => /^\d{4}-\d{2}-\d{2}/.test(String(r.due_date || "")))
    .map((r) => ({
      due: String(r.due_date).slice(0, 10),
      amount: Number(r.amount || 0),
    }));
  if (dated.length) {
    const first = dated.reduce(
      (min, r) => (r.due < min ? r.due : min),
      dated[0].due
    );
    const months: number[] = [];
    for (const row of dated) {
      const offset = monthsBetween(first, row.due);
      if (offset < 0 || offset >= MAX_SCHEDULE_MONTHS) continue;
      while (months.length <= offset) months.push(0);
      months[offset] += row.amount;
    }
    if (months.length) return months;
  }
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
  /**
   * Deals whose schedule never repays what went out, so there is no rate to
   * find: early settlements where the remaining instalments were removed, and
   * agreements in arrears. They are a credit question, not a rounding one, so
   * they are counted out loud rather than averaged in at zero.
   */
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
