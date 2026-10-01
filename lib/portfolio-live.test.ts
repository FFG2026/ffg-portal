import {
  PORTFOLIO_BASE,
  isDealAddedAfterSnapshot,
  buildLivePortfolio,
  parseCashAtBank,
  snapshotCommissionByType,
  snapshotProfitExCommission,
} from "./portfolio-live";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(isDealAddedAfterSnapshot("HP138") === false, "HP138 stays in the August book");
assert(isDealAddedAfterSnapshot("HP139") === true, "HP139 is after the sheet");
assert(isDealAddedAfterSnapshot("HP141") === true, "HP141 is after the sheet");
assert(isDealAddedAfterSnapshot("HP5") === false, "older HP numbers stay in the base");
assert(isDealAddedAfterSnapshot("HP142") === true, "HP142 is after the snapshot");
assert(isDealAddedAfterSnapshot("FL16") === true, "next FL is after the snapshot");
assert(isDealAddedAfterSnapshot("L4") === false, "L4 is in the base");

const base = buildLivePortfolio([]);
assert(base.summary.total_deals === 160, "empty book keeps the snapshot deal count");
assert(base.summary.total_outstanding === 1981148.72, "owed in starts at the printed figure");
// 21% on the printed book; 17.1% once the commission inside it is taken out.
assert(
  base.summary.blended_yield === 17.1,
  `blended yield net of commission, got ${base.summary.blended_yield}`
);
assert(base.summary.net_position === 816148.72, "net position matches the printed sheet");
assert(base.shareholders[0].pct_owned === 16.3, "Ron owns 16.3%");
// "Total owed in" is the whole book's outstanding, not a per-shareholder
// figure — each holder's share of it is their value of shareholding.
assert(
  !("total_owed_in" in base.shareholders[0]),
  "no per-shareholder owed-in column"
);
assert(
  base.shareholders[0].value ===
    Math.round(base.summary.total_outstanding * (1955 / 11970) * 100) / 100,
  "Ron's shareholding value is his share of the outstanding book"
);

const withHp142 = buildLivePortfolio([
  {
    agreement_number: "HP142",
    total_lend: 15000,
    commission: 600,
    monthly_instalment: 410.81,
    term_months: 48,
    payments: [
      { status: "paid", amount: 410.81 },
      { status: "due", amount: 410.81 },
    ],
  },
  {
    agreement_number: "HP5",
    total_lend: 18950,
    commission: 947.5,
    payments: [{ status: "due", amount: 964.76 }],
  },
]);
assert(withHp142.summary.total_deals === 161, "only HP142 increments the deal count");
assert(withHp142.summary.total_lent === 5231544.63, "HP142 lend is added");
assert(withHp142.summary.total_commission === 203605.46, "HP142 commission is added");
assert(withHp142.summary.total_paid === 4199814.69, "paid HP142 instalment is added");
assert(
  withHp142.summary.total_outstanding === 1981559.53,
  "unpaid HP142 instalment is added to owed in"
);
assert(
  withHp142.by_type.find((t) => t.type === "HP")?.deals === 142,
  "HP deal count moves from 141 to 142"
);
assert(withHp142.added_deals.map((d) => d.agreement_number).join() === "HP142", "HP5 is not listed as added");
assert(PORTFOLIO_BASE.as_of === "2026-08-28", "snapshot date");

// The opening book is restated on the same basis as new deals: the 28 Aug
// printed profit less the commission inside it.
assert(
  snapshotProfitExCommission() === 892951.63,
  `opening profit less commission, got ${snapshotProfitExCommission()}`
);
assert(
  base.summary.total_profit === 892951.63,
  `empty book opens at the restated profit, got ${base.summary.total_profit}`
);
assert(
  PORTFOLIO_BASE.total_profit === 1095957.09,
  "the printed snapshot itself is left as the record of what the book said"
);

const openingSplit = snapshotCommissionByType();
assert(
  Math.round(
    (openingSplit.HP + openingSplit.FL + openingSplit.L) * 100
  ) / 100 === PORTFOLIO_BASE.total_commission,
  "the apportioned commission sums to the snapshot total"
);
assert(
  openingSplit.HP === 172281.51 &&
    openingSplit.FL === 24193.9 &&
    openingSplit.L === 6530.05,
  `commission apportioned by share of lend, got ${JSON.stringify(openingSplit)}`
);
// Each type's profit is restated too, so the column still sums to the headline.
assert(
  Math.round(
    base.by_type.reduce((sum, t) => sum + t.total_profit, 0) * 100
  ) / 100 === base.summary.total_profit,
  "deal-type profits sum to the headline profit"
);
// Commission is paid out to the introducer on payout day, so it is money FFG
// puts out, not money it earns. Profit deducts it alongside the lend.
const hp142Contracted = 410.81 * 2;
assert(
  withHp142.summary.total_profit ===
    Math.round(
      (snapshotProfitExCommission() + hp142Contracted - 15000 - 600) * 100
    ) / 100,
  `profit deducts commission as well as the lend, got ${withHp142.summary.total_profit}`
);

const sameDealNoCommission = buildLivePortfolio([
  {
    agreement_number: "HP142",
    total_lend: 15000,
    commission: 0,
    monthly_instalment: 410.81,
    term_months: 48,
    payments: [
      { status: "paid", amount: 410.81 },
      { status: "due", amount: 410.81 },
    ],
  },
]);
assert(
  Math.round(
    (sameDealNoCommission.summary.total_profit - withHp142.summary.total_profit) * 100
  ) / 100 === 600,
  "a 600 commission reduces profit by exactly 600"
);
// Commission is never part of what is still due in — that is the unpaid
// schedule alone, so the same deal with and without commission owes the same.
assert(
  sameDealNoCommission.summary.total_outstanding ===
    withHp142.summary.total_outstanding,
  "outstanding ignores commission"
);
assert(
  sameDealNoCommission.summary.total_lent === withHp142.summary.total_lent,
  "total lent out is the lend alone, unchanged by commission"
);

assert(parseCashAtBank("£67,000.00") === 67000, "cash parses from printed sterling");
assert(parseCashAtBank("77000") === 77000, "cash parses from a plain number");
const moreCash = buildLivePortfolio([], { cashAtBank: 77000 });
assert(moreCash.summary.cash_at_bank === 77000, "cash override is used");
assert(
  moreCash.summary.net_position === 826148.72,
  "net position moves with cash at bank"
);

console.log("portfolio-live tests ok");
