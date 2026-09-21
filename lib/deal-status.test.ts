import { isLiveDeal, unpaidSum, paidCount } from "./deal-status";

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

console.log("deal-status tests ok");
