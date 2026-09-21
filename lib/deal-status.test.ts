import { isLiveDeal, unpaidSum, paidCount, liveOverdueSum } from "./deal-status";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const l2Paid = Array.from({ length: 36 }, () => ({
  status: "paid",
  amount: 2608.65,
}));

assert(paidCount(l2Paid) === 36, "36 paid");
assert(unpaidSum(l2Paid) === 0, "L2 owing is zero once every instalment is paid");
assert(
  isLiveDeal({ status: "settled", term_months: 36 }, l2Paid) === false,
  "settled L2 is not live"
);
assert(
  isLiveDeal({ status: "active", term_months: 36 }, l2Paid) === false,
  "fully paid schedule is finished even if status was left active"
);

const stillDue = [
  { status: "paid", amount: 2608.65 },
  { status: "due", amount: 2608.65 },
];
assert(unpaidSum(stillDue) === 2608.65, "only unpaid rows count as owing");
assert(
  isLiveDeal({ status: "active", term_months: 36 }, stillDue) === true,
  "open term with dues is live"
);

assert(
  liveOverdueSum(
    { status: "settled", term_months: 36 },
    [{ status: "due", amount: 2608.65, due_date: "2023-08-21" }],
    "2026-09-21"
  ) === 0,
  "settled L2 is not overdue on the dashboard"
);
assert(
  liveOverdueSum(
    { status: "active", term_months: 36 },
    [
      { status: "paid", amount: 1933.07, due_date: "2023-12-21" },
      { status: "due", amount: 1933.07, due_date: "2025-03-30" },
    ],
    "2026-09-21"
  ) === 1933.07,
  "live HP with a past due still flags"
);

console.log("deal-status tests ok");
