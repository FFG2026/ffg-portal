import {
  isLiveDeal,
  unpaidSum,
  paidCount,
  liveOverdueSum,
  chaseOverdueSum,
  isSpecialOverdueArrangement,
  receivedPaymentInLastMonth,
  lastReceivedPaymentDate,
} from "./deal-status";

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
  isLiveDeal(
    { status: "active", term_months: 1 },
    [{ status: "paid" }, { status: "due" }]
  ) === true,
  "cancelled DD with remaining dues stays live even if term_months is stale"
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

assert(
  liveOverdueSum(
    { status: "settled", term_months: 19 },
    [
      { status: "paid", amount: 884.16, due_date: "2024-04-05" },
      { status: "paid", amount: 15914.88, due_date: "2024-05-05" },
    ],
    "2026-09-21"
  ) === 0,
  "HP23 settlement lump is paid, not overdue"
);
assert(
  liveOverdueSum(
    { status: "settled", term_months: 16 },
    [
      { status: "paid", amount: 861.28, due_date: "2024-03-18" },
      { status: "paid", amount: 18086.88, due_date: "2024-04-18" },
    ],
    "2026-09-21"
  ) === 0,
  "HP33 settlement lump is paid, not overdue"
);

const payingThisMonth = [
  { status: "paid", amount: 500, due_date: "2026-08-21", paid_date: "2026-08-21" },
  { status: "due", amount: 500, due_date: "2026-07-21" },
  { status: "due", amount: 500, due_date: "2026-09-21" },
];
assert(
  lastReceivedPaymentDate(payingThisMonth) === "2026-08-21",
  "last payment uses paid_date"
);
assert(
  receivedPaymentInLastMonth(payingThisMonth, "2026-09-21") === true,
  "21 Aug is within one month of 21 Sep"
);
assert(
  liveOverdueSum({ status: "active", term_months: 36 }, payingThisMonth, "2026-09-21") ===
    0,
  "live account that paid in the last month is not overdue"
);

const paidEarlyLastMonth = [
  { status: "paid", amount: 844.84, due_date: "2026-08-11", paid_date: "2026-08-11" },
  { status: "due", amount: 844.84, due_date: "2026-09-11" },
];
assert(
  receivedPaymentInLastMonth(paidEarlyLastMonth, "2026-09-21") === true,
  "11 Aug still counts as a payment last month on 21 Sep"
);
assert(
  liveOverdueSum({ status: "active", term_months: 36 }, paidEarlyLastMonth, "2026-09-21") ===
    0,
  "FL9-style monthly payer is not overdue after an August collection"
);

const currentCycleUnpaid = [
  { status: "paid", amount: 868.41, due_date: "2026-07-30", paid_date: "2026-07-30" },
  { status: "due", amount: 868.41, due_date: "2026-08-30" },
];
assert(
  liveOverdueSum({ status: "active", term_months: 48 }, currentCycleUnpaid, "2026-09-21") ===
    0,
  "instalment less than a month late is not overdue"
);

const missedMonth = [
  { status: "paid", amount: 500, due_date: "2026-07-21", paid_date: "2026-07-21" },
  { status: "due", amount: 500, due_date: "2026-08-21" },
];
assert(
  receivedPaymentInLastMonth(missedMonth, "2026-09-21") === false,
  "21 Jul is before the start of last month"
);
assert(
  liveOverdueSum({ status: "active", term_months: 36 }, missedMonth, "2026-09-21") ===
    500,
  "no payment in the last month still flags overdue"
);

const sheetHole = [
  { status: "due", amount: 3765.7, due_date: "2022-01-10" },
  { status: "paid", amount: 3765.7, due_date: "2023-03-15", paid_date: "2023-03-15" },
];
assert(
  liveOverdueSum({ status: "active", term_months: 15 }, sheetHole, "2026-09-21") === 0,
  "unticked first row is not overdue after later instalments were paid"
);

assert(
  isSpecialOverdueArrangement("Vantage Vehicles") === true,
  "Vantage Vehicles is on a special overdue arrangement"
);
assert(
  isSpecialOverdueArrangement("JWL Developments Refinance 1") === false,
  "other customers stay on the overdue list"
);

const vantageArrears = [
  { status: "paid", amount: 1933.07, due_date: "2026-07-21", paid_date: "2026-07-21" },
  { status: "due", amount: 1933.07, due_date: "2026-08-21" },
];
assert(
  liveOverdueSum({ status: "active", term_months: 48 }, vantageArrears, "2026-09-21") ===
    1933.07,
  "raw arrears still calculate for Vantage"
);
assert(
  chaseOverdueSum(
    "Vantage Vehicles",
    { status: "active", term_months: 48 },
    vantageArrears,
    "2026-09-21"
  ) === 0,
  "Vantage Vehicles is not chased as overdue"
);
assert(
  chaseOverdueSum(
    "JWL Developments Refinance 1",
    { status: "active", term_months: 48 },
    vantageArrears,
    "2026-09-21"
  ) === 1933.07,
  "JWL still shows on the overdue list"
);

console.log("deal-status tests ok");
