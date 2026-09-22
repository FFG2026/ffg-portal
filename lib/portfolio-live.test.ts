import {
  PORTFOLIO_BASE,
  isDealAddedAfterSnapshot,
  buildLivePortfolio,
  parseCashAtBank,
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
assert(base.summary.blended_yield === 21, "21% blended yield on the snapshot");
assert(base.summary.net_position === 816148.72, "net position matches the printed sheet");
assert(base.shareholders[0].pct_owned === 16.3, "Ron owns 16.3%");
assert(base.shareholders[0].total_owed_in === 1981148.72, "owed in sits on Ron's row");

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

assert(parseCashAtBank("£67,000.00") === 67000, "cash parses from printed sterling");
assert(parseCashAtBank("77000") === 77000, "cash parses from a plain number");
const moreCash = buildLivePortfolio([], { cashAtBank: 77000 });
assert(moreCash.summary.cash_at_bank === 77000, "cash override is used");
assert(
  moreCash.summary.net_position === 826148.72,
  "net position moves with cash at bank"
);

console.log("portfolio-live tests ok");
