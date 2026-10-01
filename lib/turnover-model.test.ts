import {
  addMonthKey,
  runOffByMonth,
  writingShape,
  modelTurnover,
  agreementsLiveInMonth,
} from "./turnover-model";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(addMonthKey("2026-10", 0) === "2026-10", "month zero is itself");
assert(addMonthKey("2026-10", 3) === "2027-01", "rolls over the year");
assert(addMonthKey("2026-01", -1) === "2025-12", "rolls back over the year");

const schedule = [
  { due_date: "2026-10-16", amount: "5276.00", agreement_status: "active", agreement_id: "a" },
  { due_date: "2026-10-28", amount: 543.78, agreement_status: "active", agreement_id: "b" },
  { due_date: "2026-11-16", amount: "5276.00", agreement_status: "active", agreement_id: "a" },
  { due_date: "2026-09-16", amount: 9999, agreement_status: "active", agreement_id: "a" },
  { due_date: "2026-10-09", amount: 600.09, agreement_status: "cancelled", agreement_id: "c" },
];
const runOff = runOffByMonth(schedule, "2026-10", 3);
assert(runOff.length === 3, "one entry per month asked for");
assert(runOff[0].month === "2026-10" && runOff[0].amount === 5819.78, `October, got ${runOff[0].amount}`);
assert(runOff[1].amount === 5276, "November");
assert(runOff[2].amount === 0, "a month with nothing contracted is zero, not missing");
assert(
  agreementsLiveInMonth(schedule, "2026-10") === 2,
  "an unwound agreement is not still paying in"
);

// The book's own writing: £100,000 lent contracting £121,560 over 40 months.
const shape = writingShape([
  { total_lend: 100000, monthly_instalment: 3039, term_months: 40, status: "active" },
  { total_lend: 0, monthly_instalment: 0, term_months: 0, status: "active" },
  { total_lend: 50000, monthly_instalment: 900, term_months: 36, status: "cancelled" },
]);
assert(shape !== null, "a shape comes back");
assert(Math.abs(shape!.uplift - 1.2156) < 0.0005, `uplift from the book, got ${shape!.uplift}`);
assert(shape!.termMonths === 40, `lend-weighted term, got ${shape!.termMonths}`);
assert(writingShape([]) === null, "no writing means no shape to copy");

// Relending nothing leaves the run-off alone.
const flat = modelTurnover(
  [{ month: "2026-10", amount: 1000 }, { month: "2026-11", amount: 900 }],
  { uplift: 1.2, termMonths: 12, relendPct: 0 }
);
assert(flat[1].turnover === 900 && flat[1].written === 0, "nothing relent, nothing added");

// Relending everything: month one writes £1,000, which at 1.2 over 10 months
// pays £120 a month from month two.
const grown = modelTurnover(
  [{ month: "2026-10", amount: 1000 }, { month: "2026-11", amount: 1000 }],
  { uplift: 1.2, termMonths: 10, relendPct: 100 }
);
assert(grown[0].turnover === 1000 && grown[0].lent === 1000, "month one lends its whole turnover");
assert(grown[0].written === 0, "and collects nothing from itself in the same month");
assert(grown[1].written === 120, `month two collects £120 from it, got ${grown[1].written}`);
assert(grown[1].turnover === 1120, "which is on top of what the book was already paying");

// The horizon never runs past the run-off it was given.
assert(
  modelTurnover([{ month: "2026-10", amount: 500 }], { uplift: 1.2, termMonths: 48 }).length === 1,
  "one month in, one month out"
);

console.log("turnover-model tests ok");
