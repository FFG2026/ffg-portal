import {
  GLACIER_INVESTMENT_EACH,
  annualizedYield,
  buildGlacierPortfolio,
  compoundForward,
  yearsUntil,
} from "./glacier-portfolio";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(Math.abs(yearsUntil("2028-09-21", "2026-09-21T00:00:00.000Z") - 2) < 0.01, "two years");
assert(Math.abs(annualizedYield(0.213, 1, 36) - (Math.pow(1.213, 1 / 3) - 1)) < 1e-9, "3yr annualise");
assert(compoundForward(100, 0.1, 2) === 121, "10% two years");

const empty = buildGlacierPortfolio([], {
  generatedAt: "2026-09-21T12:00:00.000Z",
  cashAtBank: 0,
});
assert(empty.summary.total_deals === 0, "no deals");
assert(empty.shareholders.length === 4, "four shareholders");
assert(empty.shareholders.map((s) => s.name).join() === "Owen,Ron,Bob,Len", "order");
assert(empty.shareholders.every((s) => s.investment === GLACIER_INVESTMENT_EACH), "100k each");
assert(empty.shareholders.every((s) => s.pct_owned === 25), "25% each");
assert(empty.summary.capital_in === 400000, "400k in");

const live = buildGlacierPortfolio(
  [
    {
      agreement_number: "GG01",
      total_lend: 200000,
      term_months: 36,
      monthly_instalment: 7000,
      payments: [
        { status: "paid", amount: 7000 },
        { status: "due", amount: 7000 },
        { status: "due", amount: 238000 },
      ],
    },
    {
      agreement_number: "GG02",
      total_lend: 100000,
      term_months: 36,
      payments: [{ status: "due", amount: 121000 }],
    },
  ],
  { generatedAt: "2026-09-21T12:00:00.000Z", cashAtBank: 5000 }
);
assert(live.summary.total_deals === 2, "two deals");
assert(live.summary.total_lent === 300000, "lent");
assert(live.summary.total_paid === 7000, "paid");
assert(live.summary.total_outstanding === 366000, "outstanding");
assert(live.summary.cash_at_bank === 5000, "cash");
assert(live.summary.net_position === 371000, "nav");
assert(live.shareholders[0].value === 91500, "equal split of outstanding");
assert(live.shareholders[0].projected_2030 > live.shareholders[0].value, "compounds up");
assert(
  live.shareholders[3].projected_2030 === live.shareholders[0].projected_2030,
  "equal projections"
);

console.log("glacier-portfolio tests ok");
