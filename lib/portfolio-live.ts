import { parseAgreementRef } from "./gocardless/parse-ref";
import { roundMoney, settlementFigure, isPaidRow } from "./deal-status";

export type DealType = "HP" | "FL" | "L";

export type PortfolioShareholder = {
  name: string;
  shares: number;
  amount_repaid: number;
};

export type PortfolioTypeRow = {
  type: DealType;
  label: string;
  deals: number;
  total_lent: number;
  total_profit: number;
  avg_yield: number;
};

export type PortfolioSnapshot = {
  as_of: string;
  total_deals: number;
  total_lent: number;
  total_commission: number;
  total_repayments_contracted: number;
  total_paid: number;
  total_outstanding: number;
  total_profit: number;
  cash_at_bank: number;
  facility: number;
  shares_issued: number;
  by_type: Record<DealType, Omit<PortfolioTypeRow, "label" | "type" | "avg_yield">>;
  shareholders: PortfolioShareholder[];
};

/**
 * Deal-book dashboard printed 28 Aug 2026. Live figures start from this
 * snapshot; deals from HP139, FL16 and L5 onwards are added on top.
 */
export const PORTFOLIO_BASE: PortfolioSnapshot = {
  as_of: "2026-08-28",
  total_deals: 160,
  total_lent: 5216544.63,
  total_commission: 203005.46,
  total_repayments_contracted: 6301751.5,
  total_paid: 4199403.88,
  total_outstanding: 1981148.72,
  total_profit: 1095957.09,
  cash_at_bank: 67000,
  facility: 1232000,
  shares_issued: 11970,
  by_type: {
    HP: { deals: 141, total_lent: 4427044.22, total_profit: 895009.57 },
    FL: { deals: 15, total_lent: 621700.41, total_profit: 144715.8 },
    L: { deals: 4, total_lent: 167800, total_profit: 56231.72 },
  },
  shareholders: [
    { name: "Ron", shares: 1955, amount_repaid: 11432.75 },
    { name: "Len", shares: 1710, amount_repaid: 10000 },
    { name: "Helen", shares: 1710, amount_repaid: 10000 },
    { name: "Bob", shares: 1710, amount_repaid: 10000 },
    { name: "Owen", shares: 1710, amount_repaid: 10000 },
    { name: "Danny", shares: 965, amount_repaid: 5643.27 },
    { name: "Craig", shares: 965, amount_repaid: 5643.27 },
    { name: "Nick", shares: 745, amount_repaid: 4356.73 },
    { name: "Graham", shares: 500, amount_repaid: 2923.98 },
  ],
};

const PROJECTED_2030_RATIO =
  2682087.33 / PORTFOLIO_BASE.total_outstanding;

const TYPE_LABEL: Record<DealType, string> = {
  HP: "Hire Purchase (HP)",
  FL: "Finance Lease (FL)",
  L: "Loan (L)",
};

export function dealTypeOf(agreementNumber: string): DealType | null {
  const ref = parseAgreementRef(agreementNumber);
  if (!ref) return null;
  const prefix = ref.agreement_number.replace(/\d+$/, "") as DealType;
  return prefix === "HP" || prefix === "FL" || prefix === "L" ? prefix : null;
}

export function dealNumberOf(agreementNumber: string): number | null {
  const ref = parseAgreementRef(agreementNumber);
  if (!ref) return null;
  const n = Number(ref.agreement_number.replace(/^(HP|FL|L)/i, ""));
  return Number.isFinite(n) ? n : null;
}

/** Deals the 28 Aug book does not cover (HP from 139, FL from 16, L from 5). */
export function isDealAddedAfterSnapshot(agreementNumber: string) {
  const type = dealTypeOf(agreementNumber);
  const n = dealNumberOf(agreementNumber);
  if (!type || n == null) return false;
  if (type === "HP") return n >= 139;
  if (type === "FL") return n >= 16;
  return n >= 5;
}

export type LiveDealInput = {
  agreement_number: string;
  agreement_type?: string | null;
  total_lend?: number | string | null;
  commission?: number | string | null;
  monthly_instalment?: number | string | null;
  total_repayable?: number | string | null;
  term_months?: number | null;
  payments?: { status?: string | null; amount?: number | string | null }[];
};

export type LivePortfolio = {
  as_of: string;
  generated_at: string;
  added_deals: { agreement_number: string; type: DealType }[];
  summary: {
    total_deals: number;
    total_lent: number;
    total_commission: number;
    total_repayments_contracted: number;
    total_paid: number;
    total_outstanding: number;
    total_profit: number;
    blended_yield: number;
    cash_at_bank: number;
    net_position: number;
  };
  by_type: PortfolioTypeRow[];
  shareholders: {
    name: string;
    shares: number;
    amount_repaid: number;
    pct_owned: number;
    value: number;
    projected_2030: number;
  }[];
  shares_issued: number;
  repayment_per_share: number;
};

function contractedOn(deal: LiveDealInput) {
  const rows = deal.payments || [];
  if (rows.length) {
    return roundMoney(rows.reduce((sum, r) => sum + Number(r.amount || 0), 0));
  }
  return roundMoney(
    Number(deal.monthly_instalment || 0) * Number(deal.term_months || 0)
  );
}

function paidOn(deal: LiveDealInput) {
  return roundMoney(
    (deal.payments || [])
      .filter((r) => isPaidRow(r.status))
      .reduce((sum, r) => sum + Number(r.amount || 0), 0)
  );
}

function profitOn(deal: LiveDealInput) {
  return roundMoney(contractedOn(deal) - Number(deal.total_lend || 0));
}

export const CASH_AT_BANK_SETTING = "portfolio_cash_at_bank";

export function parseCashAtBank(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return roundMoney(raw);
  const s = String(raw ?? "").replace(/[£,\s]/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? roundMoney(n) : null;
}

export function buildLivePortfolio(
  deals: LiveDealInput[],
  opts?: { generatedAt?: string; cashAtBank?: number | null }
): LivePortfolio {
  const generatedAt = opts?.generatedAt || new Date().toISOString();
  const cashAtBank =
    opts?.cashAtBank != null && Number.isFinite(opts.cashAtBank)
      ? roundMoney(opts.cashAtBank)
      : PORTFOLIO_BASE.cash_at_bank;
  const added = deals.filter((d) => isDealAddedAfterSnapshot(d.agreement_number));
  const summary = {
    total_deals: PORTFOLIO_BASE.total_deals,
    total_lent: PORTFOLIO_BASE.total_lent,
    total_commission: PORTFOLIO_BASE.total_commission,
    total_repayments_contracted: PORTFOLIO_BASE.total_repayments_contracted,
    total_paid: PORTFOLIO_BASE.total_paid,
    total_outstanding: PORTFOLIO_BASE.total_outstanding,
    total_profit: PORTFOLIO_BASE.total_profit,
    blended_yield: 0,
    cash_at_bank: cashAtBank,
    net_position: 0,
  };
  const types: Record<DealType, { deals: number; total_lent: number; total_profit: number }> = {
    HP: { ...PORTFOLIO_BASE.by_type.HP },
    FL: { ...PORTFOLIO_BASE.by_type.FL },
    L: { ...PORTFOLIO_BASE.by_type.L },
  };

  const addedDeals: { agreement_number: string; type: DealType }[] = [];
  for (const deal of added) {
    const type = dealTypeOf(deal.agreement_number);
    if (!type) continue;
    addedDeals.push({ agreement_number: deal.agreement_number, type });
    const lend = Number(deal.total_lend || 0);
    const comm = Number(deal.commission || 0);
    const contracted = contractedOn(deal);
    const paid = paidOn(deal);
    const outstanding = settlementFigure(deal, deal.payments);
    const profit = profitOn(deal);
    summary.total_deals += 1;
    summary.total_lent = roundMoney(summary.total_lent + lend);
    summary.total_commission = roundMoney(summary.total_commission + comm);
    summary.total_repayments_contracted = roundMoney(
      summary.total_repayments_contracted + contracted
    );
    summary.total_paid = roundMoney(summary.total_paid + paid);
    summary.total_outstanding = roundMoney(summary.total_outstanding + outstanding);
    summary.total_profit = roundMoney(summary.total_profit + profit);
    types[type].deals += 1;
    types[type].total_lent = roundMoney(types[type].total_lent + lend);
    types[type].total_profit = roundMoney(types[type].total_profit + profit);
  }

  summary.blended_yield =
    summary.total_lent > 0
      ? Math.round((summary.total_profit / summary.total_lent) * 1000) / 10
      : 0;
  summary.net_position = roundMoney(
    summary.total_outstanding + summary.cash_at_bank - PORTFOLIO_BASE.facility
  );

  const by_type: PortfolioTypeRow[] = (["HP", "FL", "L"] as DealType[]).map(
    (type) => ({
      type,
      label: TYPE_LABEL[type],
      deals: types[type].deals,
      total_lent: types[type].total_lent,
      total_profit: types[type].total_profit,
      avg_yield:
        types[type].total_lent > 0
          ? Math.round(
              (types[type].total_profit / types[type].total_lent) * 1000
            ) / 10
          : 0,
    })
  );

  const repaidTotal = PORTFOLIO_BASE.shareholders.reduce(
    (sum, s) => sum + s.amount_repaid,
    0
  );
  const shareholders = PORTFOLIO_BASE.shareholders.map((s) => {
    const pct = s.shares / PORTFOLIO_BASE.shares_issued;
    const value = roundMoney(summary.total_outstanding * pct);
    return {
      name: s.name,
      shares: s.shares,
      amount_repaid: s.amount_repaid,
      pct_owned: Math.round(pct * 1000) / 10,
      value,
      projected_2030: roundMoney(value * PROJECTED_2030_RATIO),
    };
  });

  return {
    as_of: PORTFOLIO_BASE.as_of,
    generated_at: generatedAt,
    added_deals: addedDeals.sort((a, b) =>
      a.agreement_number.localeCompare(b.agreement_number, "en", { numeric: true })
    ),
    summary,
    by_type,
    shareholders,
    shares_issued: PORTFOLIO_BASE.shares_issued,
    repayment_per_share: roundMoney(repaidTotal / PORTFOLIO_BASE.shares_issued),
  };
}
