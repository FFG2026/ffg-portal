import { roundMoney, settlementFigure, isPaidRow } from "./deal-status";
import { bookYield, marginOverTerm } from "./yield";

export const GLACIER_SHAREHOLDERS = ["Owen", "Ron", "Bob", "Len"] as const;

export const GLACIER_INVESTMENT_EACH = 100000;
export const GLACIER_HORIZON = "2030-12-31";
export const GLACIER_CASH_SETTING = "glacier_cash_at_bank";

export type GlacierDealInput = {
  agreement_number: string;
  total_lend?: number | string | null;
  commission?: number | string | null;
  monthly_instalment?: number | string | null;
  total_repayable?: number | string | null;
  term_months?: number | null;
  payments?: { status?: string | null; amount?: number | string | null }[];
};

export type GlacierShareholder = {
  name: string;
  investment: number;
  pct_owned: number;
  amount_repaid: number;
  value: number;
  projected_2030: number;
};

export type GlacierPortfolio = {
  generated_at: string;
  horizon: string;
  years_to_horizon: number;
  annual_yield: number;
  summary: {
    total_deals: number;
    total_lent: number;
    total_commission: number;
    total_repayments_contracted: number;
    total_paid: number;
    total_outstanding: number;
    total_profit: number;
    annual_yield: number;
    yield_deals: number;
    yield_lent: number;
    yield_excluded_deals: number;
    yield_excluded_lent: number;
    blended_yield: number;
    avg_term_months: number;
    capital_in: number;
    cash_at_bank: number;
    net_position: number;
  };
  shareholders: GlacierShareholder[];
};

function contractedOn(deal: GlacierDealInput) {
  const rows = deal.payments || [];
  if (rows.length) {
    return roundMoney(rows.reduce((sum, r) => sum + Number(r.amount || 0), 0));
  }
  return roundMoney(
    Number(deal.monthly_instalment || 0) * Number(deal.term_months || 0)
  );
}

function paidOn(deal: GlacierDealInput) {
  return roundMoney(
    (deal.payments || [])
      .filter((r) => isPaidRow(r.status))
      .reduce((sum, r) => sum + Number(r.amount || 0), 0)
  );
}

export function yearsUntil(isoDate: string, fromIso?: string) {
  const from = fromIso ? Date.parse(fromIso) : Date.now();
  const to = Date.parse(`${isoDate}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, (to - from) / (365.25 * 24 * 60 * 60 * 1000));
}

export function compoundForward(
  amount: number,
  annualRate: number,
  years: number
) {
  if (!Number.isFinite(amount) || !Number.isFinite(annualRate) || years <= 0) {
    return roundMoney(amount || 0);
  }
  return roundMoney(amount * Math.pow(1 + annualRate, years));
}

export function buildGlacierPortfolio(
  deals: GlacierDealInput[],
  opts?: { generatedAt?: string; cashAtBank?: number | null; from?: string }
): GlacierPortfolio {
  const generatedAt = opts?.generatedAt || new Date().toISOString();
  const cashAtBank =
    opts?.cashAtBank != null && Number.isFinite(opts.cashAtBank)
      ? roundMoney(opts.cashAtBank)
      : 0;

  let lent = 0;
  let commission = 0;
  let contracted = 0;
  let paid = 0;
  let outstanding = 0;
  let termWeight = 0;

  for (const deal of deals) {
    const lend = Number(deal.total_lend || 0);
    lent += lend;
    commission += Number(deal.commission || 0);
    contracted += contractedOn(deal);
    paid += paidOn(deal);
    outstanding += settlementFigure(deal, deal.payments);
    termWeight += Number(deal.term_months || 0) * lend;
  }

  lent = roundMoney(lent);
  commission = roundMoney(commission);
  contracted = roundMoney(contracted);
  paid = roundMoney(paid);
  outstanding = roundMoney(outstanding);
  // Commission is paid out on payout day, so it is outlay, never earnings.
  const profit = roundMoney(contracted - lent - commission);
  const avgTermMonths = lent > 0 ? termWeight / lent : 36;
  const marginPct = marginOverTerm(profit, lent);
  // The rate the money actually earns, solved against the instalments rather
  // than assumed to sit on the opening lend for the whole term.
  const yieldOnBook = bookYield(deals);
  const annualYield = yieldOnBook.annual_yield / 100;
  const years = yearsUntil(GLACIER_HORIZON, opts?.from || generatedAt);
  const capitalIn = GLACIER_INVESTMENT_EACH * GLACIER_SHAREHOLDERS.length;

  const shareholders = GLACIER_SHAREHOLDERS.map((name) => {
    const value = roundMoney(outstanding / GLACIER_SHAREHOLDERS.length);
    return {
      name,
      investment: GLACIER_INVESTMENT_EACH,
      pct_owned: 25,
      amount_repaid: 0,
      value,
      projected_2030: compoundForward(value, annualYield, years),
    };
  });

  return {
    generated_at: generatedAt,
    horizon: GLACIER_HORIZON,
    years_to_horizon: Math.round(years * 100) / 100,
    annual_yield: yieldOnBook.annual_yield,
    summary: {
      total_deals: deals.length,
      total_lent: lent,
      total_commission: commission,
      total_repayments_contracted: contracted,
      total_paid: paid,
      total_outstanding: outstanding,
      total_profit: profit,
      blended_yield: marginPct,
      annual_yield: yieldOnBook.annual_yield,
      yield_deals: yieldOnBook.deals,
      yield_lent: yieldOnBook.lent,
      yield_excluded_deals: yieldOnBook.excluded_deals,
      yield_excluded_lent: yieldOnBook.excluded_lent,
      avg_term_months: Math.round(avgTermMonths * 10) / 10,
      capital_in: capitalIn,
      cash_at_bank: cashAtBank,
      net_position: roundMoney(outstanding + cashAtBank),
    },
    shareholders,
  };
}
