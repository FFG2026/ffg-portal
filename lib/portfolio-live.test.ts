import {
  PORTFOLIO_BASE,
  isDealAddedAfterSnapshot,
  buildLivePortfolio,
  parseCashAtBank,
  snapshotCommissionByType,
  snapshotProfitExCommission,
  totalOverRecovery,
  overRecoveryByType,
  OVER_RECOVERIES,
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
  base.summary.total_profit === Math.round((892951.63 + totalOverRecovery()) * 100) / 100,
  `empty book opens at the restated profit plus over-recovery, got ${base.summary.total_profit}`
);

// HP41 ran to August 2026 and took 1,684.14 more than it contracted to repay.
// The printed book values profit as contracted repayments less the lend and
// the commission, so money taken above the contract never reaches it.
assert(totalOverRecovery() === 1684.14, `over-recovery, got ${totalOverRecovery()}`);
assert(
  OVER_RECOVERIES.length === 1 && OVER_RECOVERIES[0].agreement_number === "HP41",
  "HP41 is the recorded over-recovery"
);
const recoveredSplit = overRecoveryByType();
assert(
  recoveredSplit.HP === 1684.14 && recoveredSplit.FL === 0 && recoveredSplit.L === 0,
  `over-recovery lands on the HP book, got ${JSON.stringify(recoveredSplit)}`
);
assert(
  Math.round((base.summary.total_profit - snapshotProfitExCommission()) * 100) / 100 ===
    totalOverRecovery(),
  "the live profit is the restated snapshot plus the over-recovery, nothing else"
);
// It is profit only. The lend, the contracted repayments and the cash the
// printed book recorded are left exactly as printed.
assert(
  base.summary.total_lent === PORTFOLIO_BASE.total_lent &&
    base.summary.total_paid === PORTFOLIO_BASE.total_paid &&
    base.summary.total_repayments_contracted ===
      PORTFOLIO_BASE.total_repayments_contracted,
  "an over-recovery moves profit alone"
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
      (snapshotProfitExCommission() +
        totalOverRecovery() +
        hp142Contracted -
        15000 -
        600) *
        100
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

// VAT is collected, not earned: FL rentals go in net and deferred VAT stays out.
{
  const fl16 = {
    agreement_number: "FL16",
    agreement_type: "FL",
    total_lend: 9750,
    commission: 292.5,
    monthly_instalment: 312.3,
    term_months: 4,
    payments: [{ status: "paid", amount: 1200, due_date: "2026-01-01" }],
  };
  const live = buildLivePortfolio([fl16]);
  // 1,200 gross rentals = 1,000 net + 200 VAT.
  assert(
    live.summary.total_paid - PORTFOLIO_BASE.total_paid === 1200,
    "cash collected stays on the gross basis"
  );
  assert(live.summary.vat_excluded === 200, `VAT excluded is 200, got ${live.summary.vat_excluded}`);
  const plain = buildLivePortfolio([{ ...fl16, agreement_type: "HP", agreement_number: "HP200" }]);
  assert(
    Math.round((plain.summary.total_profit - live.summary.total_profit) * 100) / 100 === 200,
    "the FL deal books 200 less profit than the same deal with no VAT in it"
  );
  const vatRow = buildLivePortfolio([
    {
      ...fl16,
      agreement_type: "HP",
      agreement_number: "HP201",
      payments: [
        { status: "paid", amount: 1200, due_date: "2026-01-01" },
        { status: "paid", amount: 5000, due_date: "2026-01-01", notes: "Deferred VAT — paid." },
      ],
    },
  ]);
  assert(
    vatRow.summary.total_profit === plain.summary.total_profit - 0 &&
      vatRow.summary.vat_excluded === 5000,
    "deferred VAT is excluded from profit and reported"
  );
}
