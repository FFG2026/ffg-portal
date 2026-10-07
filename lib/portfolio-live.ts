import { parseAgreementRef } from "./gocardless/parse-ref";
import { bookYield, marginOverTerm, type YieldDeal } from "./yield";
import { roundMoney, settlementFigure, isPaidRow } from "./deal-status";
import { vatOnDeal } from "./income";

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
  /** Profit over lend across the term. Not a yearly rate. */
  margin_over_term: number;
  annual_yield: number;
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
  by_type: Record<DealType, Omit<PortfolioTypeRow, "label" | "type" | "margin_over_term" | "annual_yield">>;
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

export type OverRecovery = {
  agreement_number: string;
  type: DealType;
  amount: number;
  note: string;
};

/**
 * An agreement that collected more than it contracted to repay. The printed
 * book values profit as contracted repayments less the lend and the
 * commission, so anything taken above the contract never reaches it. These
 * are added to profit on top of the snapshot.
 *
 * Only closed agreements belong here. While a deal is still running, an
 * over-collection is as likely to be a timing difference as a real gain.
 */
export const OVER_RECOVERIES: OverRecovery[] = [
  {
    agreement_number: "HP41",
    type: "HP",
    amount: 1684.14,
    note:
      "Settled Aug 2026. 228,619.50 received against 226,935.36 contracted: " +
      "the RX14TLU part settlement was taken without re-cutting the Direct " +
      "Debit, net of the rebate given back on EK71GRU.",
  },
];

export function totalOverRecovery() {
  return roundMoney(
    OVER_RECOVERIES.reduce((sum, r) => sum + Number(r.amount || 0), 0)
  );
}

export function overRecoveryByType(): Record<DealType, number> {
  const split: Record<DealType, number> = { HP: 0, FL: 0, L: 0 };
  for (const r of OVER_RECOVERIES) {
    split[r.type] = roundMoney(split[r.type] + Number(r.amount || 0));
  }
  return split;
}

/**
 * The yearly rate the book is assumed to relend at when projecting forward.
 * Stated the way the business states it rather than derived, so the number
 * investors are shown rests on a declared assumption they can argue with.
 * The measured book yield is higher; this is deliberately the conservative
 * figure.
 */
export const PROJECTION_RELEND_RATE = 0.12;

/**
 * Fallback multiple, used only when no run-off schedule is supplied. It is the
 * ratio the printed August book carried, and it cannot move when the book
 * does — which is why the live projection is modelled instead.
 */
const FALLBACK_2030_RATIO =
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
  payments?: {
    status?: string | null;
    amount?: number | string | null;
    due_date?: string | null;
    notes?: string | null;
  }[];
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
    over_recovery: number;
    /** VAT inside the schedules (FL rentals, deferred VAT): collected, not earned. Already out of profit. */
    vat_excluded: number;
    /** Profit as a share of the lend over the whole term. Not a yearly rate. */
    margin_over_term: number;
    /** The rate the money earns, solved against the instalments. Yearly. */
    annual_yield: number;
    yield_deals: number;
    yield_lent: number;
    yield_excluded_deals: number;
    yield_excluded_lent: number;
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
  /** Multiple applied to today's value to reach the projection horizon. */
  projected_multiple: number;
  projection_relend_rate: number;
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

/**
 * Commission is paid out to the introducer on the day the deal pays out, so
 * it is money FFG puts out, not money it earns. Profit is therefore what the
 * customer contracts to repay less everything we advanced — the lend and the
 * commission both. It does not touch what is due in: that is the unpaid
 * schedule alone.
 */
function profitOn(deal: LiveDealInput) {
  return roundMoney(
    contractedOn(deal) -
      vatOnDeal(deal) -
      Number(deal.total_lend || 0) -
      Number(deal.commission || 0)
  );
}

export const CASH_AT_BANK_SETTING = "portfolio_cash_at_bank";

export function parseCashAtBank(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return roundMoney(raw);
  const s = String(raw ?? "").replace(/[£,\s]/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? roundMoney(n) : null;
}

/**
 * The 28 Aug book counted commission inside its profit. Commission is paid out
 * on payout day, so the opening figures are restated the same way new deals
 * are: profit less commission. The printed snapshot above is left untouched as
 * the record of what the book said.
 *
 * The snapshot does not break commission down by deal type, so it is
 * apportioned by each type's share of the lend, with the rounding remainder
 * absorbed by the largest book. The parts always sum to total_commission.
 */
export function snapshotCommissionByType(): Record<DealType, number> {
  const types: DealType[] = ["HP", "FL", "L"];
  const totalLent = types.reduce(
    (sum, t) => sum + PORTFOLIO_BASE.by_type[t].total_lent,
    0
  );
  const split = {} as Record<DealType, number>;
  if (totalLent <= 0) {
    for (const t of types) split[t] = 0;
    return split;
  }
  for (const t of types) {
    split[t] = roundMoney(
      (PORTFOLIO_BASE.total_commission * PORTFOLIO_BASE.by_type[t].total_lent) /
        totalLent
    );
  }
  const biggest = types.reduce((a, b) =>
    PORTFOLIO_BASE.by_type[a].total_lent >= PORTFOLIO_BASE.by_type[b].total_lent
      ? a
      : b
  );
  split[biggest] = roundMoney(
    split[biggest] +
      (PORTFOLIO_BASE.total_commission -
        types.reduce((sum, t) => sum + split[t], 0))
  );
  return split;
}

/** Opening profit on the corrected basis: the printed figure less commission. */
export function snapshotProfitExCommission() {
  return roundMoney(
    PORTFOLIO_BASE.total_profit - PORTFOLIO_BASE.total_commission
  );
}

export function buildLivePortfolio(
  deals: LiveDealInput[],
  opts?: {
    generatedAt?: string;
    cashAtBank?: number | null;
    /**
     * Every agreement on the book, used for the yield alone. The totals stay
     * on the printed snapshot, but a rate cannot be recovered from totals —
     * it needs each deal's own instalments — so the whole book is passed in
     * separately. Left out, the rate falls back to the deals written since
     * the snapshot.
     */
     allDeals?: (LiveDealInput & YieldDeal)[];
    /**
     * The multiple on today's book at the projection horizon, modelled from the
     * live run-off with collections written away again. Left out, the frozen
     * ratio from the printed book is used.
     */
    projectedMultiple?: number | null;
  }
): LivePortfolio {
  const generatedAt = opts?.generatedAt || new Date().toISOString();
  const cashAtBank =
    opts?.cashAtBank != null && Number.isFinite(opts.cashAtBank)
      ? roundMoney(opts.cashAtBank)
      : PORTFOLIO_BASE.cash_at_bank;
  const added = deals.filter((d) => isDealAddedAfterSnapshot(d.agreement_number));
  // VAT inside the deals the snapshot covers, read off their live schedules.
  const snapshotVat: Record<DealType, number> = { HP: 0, FL: 0, L: 0 };
  const liveFlOpening: LiveDealInput[] = [];
  for (const deal of opts?.allDeals || []) {
    const type = dealTypeOf(deal.agreement_number);
    if (!type || isDealAddedAfterSnapshot(deal.agreement_number)) continue;
    snapshotVat[type] = roundMoney(snapshotVat[type] + vatOnDeal(deal));
    if (type === "FL") liveFlOpening.push(deal);
  }
  const snapshotVatTotal = roundMoney(
    snapshotVat.HP + snapshotVat.FL + snapshotVat.L
  );
  // The printed FL profit is not struck on the rentals the portal now holds,
  // so taking VAT off it is a guess that overshoots (it went negative against
  // a live book that sums to a profit). Where the live finance leases are
  // available, their own profit — net of VAT, less commission — replaces the
  // printed figure outright. HP and L keep the printed base less their VAT.
  const openingCommissionFl = snapshotCommissionByType().FL;
  const flOpeningProfit = liveFlOpening.length
    ? roundMoney(liveFlOpening.reduce((sum, d) => sum + profitOn(d), 0))
    : null;
  const flReplacesPrinted =
    flOpeningProfit == null
      ? 0
      : roundMoney(
          flOpeningProfit -
            (PORTFOLIO_BASE.by_type.FL.total_profit - openingCommissionFl)
        );
  const flVatAdjust = flOpeningProfit == null ? snapshotVat.FL : 0;
  const summary = {
    total_deals: PORTFOLIO_BASE.total_deals,
    total_lent: PORTFOLIO_BASE.total_lent,
    total_commission: PORTFOLIO_BASE.total_commission,
    total_repayments_contracted: PORTFOLIO_BASE.total_repayments_contracted,
    total_paid: PORTFOLIO_BASE.total_paid,
    total_outstanding: PORTFOLIO_BASE.total_outstanding,
    total_profit: roundMoney(
      snapshotProfitExCommission() +
        totalOverRecovery() -
        snapshotVat.HP -
        snapshotVat.L -
        flVatAdjust +
        flReplacesPrinted
    ),
    over_recovery: totalOverRecovery(),
    vat_excluded: snapshotVatTotal,
    margin_over_term: 0,
    annual_yield: 0,
    yield_deals: 0,
    yield_lent: 0,
    yield_excluded_deals: 0,
    yield_excluded_lent: 0,
    blended_yield: 0,
    cash_at_bank: cashAtBank,
    net_position: 0,
  };
  const openingCommission = snapshotCommissionByType();
  const recovered = overRecoveryByType();
  const types: Record<DealType, { deals: number; total_lent: number; total_profit: number }> = {
    HP: {
      ...PORTFOLIO_BASE.by_type.HP,
      total_profit: roundMoney(
        PORTFOLIO_BASE.by_type.HP.total_profit -
          openingCommission.HP +
          recovered.HP -
          snapshotVat.HP
      ),
    },
    FL: {
      ...PORTFOLIO_BASE.by_type.FL,
      total_profit:
        flOpeningProfit != null
          ? roundMoney(flOpeningProfit + recovered.FL)
          : roundMoney(
              PORTFOLIO_BASE.by_type.FL.total_profit -
                openingCommission.FL +
                recovered.FL -
                snapshotVat.FL
            ),
    },
    L: {
      ...PORTFOLIO_BASE.by_type.L,
      total_profit: roundMoney(
        PORTFOLIO_BASE.by_type.L.total_profit -
          openingCommission.L +
          recovered.L -
          snapshotVat.L
      ),
    },
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
    summary.vat_excluded = roundMoney(summary.vat_excluded + vatOnDeal(deal));
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

  summary.margin_over_term = marginOverTerm(
    summary.total_profit,
    summary.total_lent
  );
  summary.blended_yield = summary.margin_over_term;
  const yieldBook = bookYield(
    (opts?.allDeals && opts.allDeals.length ? opts.allDeals : deals) as YieldDeal[]
  );
  summary.annual_yield = yieldBook.annual_yield;
  summary.yield_deals = yieldBook.deals;
  summary.yield_lent = yieldBook.lent;
  summary.yield_excluded_deals = yieldBook.excluded_deals;
  summary.yield_excluded_lent = yieldBook.excluded_lent;
  summary.net_position = roundMoney(
    summary.total_outstanding + summary.cash_at_bank - PORTFOLIO_BASE.facility
  );

  const yieldPool = (opts?.allDeals && opts.allDeals.length
    ? opts.allDeals
    : deals) as (LiveDealInput & YieldDeal)[];
  const by_type: PortfolioTypeRow[] = (["HP", "FL", "L"] as DealType[]).map(
    (type) => ({
      type,
      label: TYPE_LABEL[type],
      deals: types[type].deals,
      total_lent: types[type].total_lent,
      total_profit: types[type].total_profit,
      margin_over_term: marginOverTerm(
        types[type].total_profit,
        types[type].total_lent
      ),
      annual_yield: bookYield(
        yieldPool.filter((d) => dealTypeOf(d.agreement_number) === type)
      ).annual_yield,
    })
  );

  const projectedMultiple =
    opts?.projectedMultiple != null && Number.isFinite(opts.projectedMultiple)
      ? opts.projectedMultiple
      : FALLBACK_2030_RATIO;
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
      projected_2030: roundMoney(value * projectedMultiple),
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
    projected_multiple: Math.round(projectedMultiple * 10000) / 10000,
    projection_relend_rate: PROJECTION_RELEND_RATE,
  };
}
