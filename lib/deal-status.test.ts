import {
  liveArrearsBroughtForward,
  isLiveDeal,
  unpaidSum,
  paidSum,
  netBookValue,
  amountFinanced,
  openingOwing,
  settlementFigure,
  paidCount,
  liveOverdueSum,
  chaseOverdueSum,
  isSpecialOverdueArrangement,
  lastReceivedPaymentDate,
  isMonthlyBookAmount,
  currentMonthInstalmentTotals,
  isManualCashReceipt,
  collectionRateFromCashAndDue,
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
  amountFinanced({ total_lend: 31500, commission: 945 }) === 32445,
  "amount financed is net lend plus commission"
);
assert(
  openingOwing({ total_lend: 31500, commission: 945 }) === 32445,
  "day-one book includes commission when no repayable figure is set"
);
assert(
  netBookValue({ total_lend: 31500, commission: 945 }, [
    { status: "paid", amount: 850 },
    { status: "paid", amount: 850 },
    { status: "paid", amount: 850 },
    { status: "paid", amount: 850 },
    { status: "paid", amount: 850 },
  ]) === 28195,
  "HP133 net book value is lend plus commission minus the five GoCardless rents"
);
assert(
  settlementFigure(
    { monthly_instalment: 850, total_lend: 31500, commission: 945 },
    [
      { status: "due", amount: 850 },
      { status: "paid", amount: 4250 },
    ]
  ) === 850,
  "contracted settlement stays the unpaid rents"
);
assert(
  netBookValue({ total_lend: 24303.4 }, [
    { status: "paid", amount: 784.2 },
    { status: "paid", amount: 285 },
  ]) === 23234.2,
  "net book value is net lend minus collections"
);
assert(
  openingOwing({
    total_lend: 24303.4,
    total_repayable: 28231.2,
    commission: 945,
  }) === 28231.2,
  "including-interest repayable is not stacked with commission"
);
assert(
  netBookValue(
    { total_lend: 24303.4, total_repayable: 28231.2 },
    [{ status: "paid", amount: 6019.2 }]
  ) === 22212,
  "HP104 net book value starts from day-one owing including interest"
);
assert(
  settlementFigure(
    {
      monthly_instalment: 0,
      total_lend: 24303.4,
      total_repayable: 28231.2,
    },
    [{ status: "paid", amount: 6019.2 }]
  ) === 22212,
  "as-and-when settlement is what is still owing after receipts"
);
assert(
  settlementFigure({ monthly_instalment: 784.2 }, [
    { status: "paid", amount: 784.2 },
    { status: "due", amount: 784.2 },
  ]) === 784.2,
  "contracted HP settlement stays the unpaid instalments"
);
assert(
  isLiveDeal({ status: "active", monthly_instalment: 0, term_months: 20 }, [
    { status: "paid" },
    { status: "paid" },
  ]) === true,
  "as-and-when HP stays live until settled"
);
assert(
  isLiveDeal({ status: "settled", monthly_instalment: 0, term_months: 20 }, [
    { status: "paid" },
  ]) === false,
  "settled as-and-when HP is finished"
);

const hp126Refunded = [
  { status: "paid", amount: 600.09 },
  { status: "paid", amount: 600.09 },
  { status: "paid", amount: 600.09 },
  { status: "paid", amount: 600.09 },
  { status: "paid", amount: 600.09 },
  { status: "paid", amount: 600.09 },
];
assert(
  isLiveDeal(
    { status: "cancelled", term_months: 36, monthly_instalment: 600.09 },
    hp126Refunded
  ) === false,
  "unwound HP126 is off the live book"
);
assert(
  netBookValue(
    {
      status: "cancelled",
      total_lend: 17207,
      commission: 860.35,
    },
    hp126Refunded
  ) === 0,
  "unwound HP126 net book value is zero"
);
assert(
  settlementFigure(
    {
      status: "cancelled",
      monthly_instalment: 600.09,
      total_lend: 17207,
      commission: 860.35,
    },
    hp126Refunded
  ) === 0,
  "unwound HP126 settlement is zero"
);
assert(
  isLiveDeal(
    { status: "cancelled", term_months: 36, monthly_instalment: 600.09 },
    [...hp126Refunded, { status: "due", amount: 600.09 }]
  ) === false,
  "unwound stays finished even if leftover dues remain"
);
assert(
  liveOverdueSum(
    { status: "cancelled", term_months: 36 },
    [{ status: "due", amount: 600.09, due_date: "2026-03-09" }],
    "2026-09-21"
  ) === 0,
  "unwound HP is not overdue on the dashboard"
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
  ) === 0,
  "a row eighteen months old is an import hole, not this month's arrears"
);
assert(
  liveOverdueSum(
    { status: "active", term_months: 36 },
    [
      { status: "paid", amount: 1933.07, due_date: "2026-07-30" },
      { status: "due", amount: 1933.07, due_date: "2026-08-30" },
    ],
    "2026-09-21"
  ) === 1933.07,
  "last month's miss is overdue"
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

// Howe Rentals missed August and paid September. The money never arrived,
// so August is still owed — a later collection does not write it off.
const missedThenPaid = [
  { status: "paid", amount: 543.78, due_date: "2026-07-28", paid_date: "2026-07-28" },
  { status: "due", amount: 543.78, due_date: "2026-08-28" },
  { status: "paid", amount: 543.78, due_date: "2026-09-28", paid_date: "2026-09-28" },
];
assert(
  liveOverdueSum({ status: "active", term_months: 48 }, missedThenPaid, "2026-09-30") ===
    543.78,
  "a miss followed by a later collection is still a miss"
);

// L3: September's £1,000 Direct Debit failed and £500 came in by bank.
const failedCollection = [
  { status: "failed", amount: 1000, due_date: "2026-09-01" },
  { status: "paid", amount: 500, due_date: "2026-09-15", paid_date: "2026-09-15" },
];
assert(
  liveOverdueSum({ status: "active", term_months: 36 }, failedCollection, "2026-10-01") ===
    1000,
  "a failed Direct Debit is money still owed"
);

// On the 1st of the month, last month's misses are the arrears carried in.
const septemberMiss = [
  { status: "due", amount: 1604.25, due_date: "2026-09-23" },
  { status: "due", amount: 1604.25, due_date: "2026-10-23" },
];
assert(
  liveOverdueSum({ status: "active", term_months: 36 }, septemberMiss, "2026-10-01") ===
    1604.25,
  "September's miss is overdue on 1 October, not hidden until it is a month old"
);
assert(
  liveArrearsBroughtForward(
    { status: "active", term_months: 36 },
    septemberMiss,
    "2026-10-01"
  ) === 1604.25,
  "and it is the arrears brought into October"
);
assert(
  liveOverdueSum({ status: "active", term_months: 36 }, septemberMiss, "2026-10-24") ===
    1604.25,
  "October's own instalment is not overdue until it is 3 days past its date"
);
assert(
  liveOverdueSum({ status: "active", term_months: 36 }, septemberMiss, "2026-10-26") ===
    3208.5,
  "once October's own instalment is 3 days late unpaid it joins the arrears"
);
assert(
  liveArrearsBroughtForward(
    { status: "active", term_months: 36 },
    septemberMiss,
    "2026-10-24"
  ) === 1604.25,
  "but only September is brought forward — October's sits in October's instalments"
);

// FL1 carries an unticked row from January 2022 on an agreement that paid
// for a year afterwards. That is a hole in the imported book.
const sheetHole = [
  { status: "due", amount: 3765.7, due_date: "2022-01-10" },
  { status: "paid", amount: 3765.7, due_date: "2023-03-15", paid_date: "2023-03-15" },
];
assert(
  liveOverdueSum({ status: "active", term_months: 15 }, sheetHole, "2026-09-21") === 0,
  "a row from four years ago is not this month's arrears"
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

assert(isMonthlyBookAmount(573.42, 573.42), "plain monthly counts");
assert(isMonthlyBookAmount(1456, 1409), "mid-term rent change still counts");
assert(!isMonthlyBookAmount(9177.95, 1827.95), "HP140 third-payment lump is not the monthly");
assert(isMonthlyBookAmount(530.97, 1596.93), "a reduced instalment still counts as this month's rent");

const sept = currentMonthInstalmentTotals(
  [
    {
      live: true,
      monthly_instalment: 500,
      amount: 500,
      status: "paid",
      due_date: "2026-09-05",
    },
    {
      live: true,
      monthly_instalment: 500,
      amount: 500,
      status: "due",
      due_date: "2026-09-28",
    },
    {
      live: true,
      monthly_instalment: 1827.95,
      amount: 9177.95,
      status: "due",
      due_date: "2026-09-30",
    },
    {
      live: false,
      monthly_instalment: 21072.9,
      amount: 21072.9,
      status: "paid",
      due_date: "2026-09-22",
    },
    {
      live: true,
      monthly_instalment: 500,
      amount: 500,
      status: "paid",
      due_date: "2026-08-05",
    },
  ],
  "2026-09-01",
  "2026-10-01"
);
assert(sept.collected === 500, `schedule collected, got ${sept.collected}`);
assert(
  sept.still_due === 9677.95,
  `the deferred-VAT lump is money due this month too, got ${sept.still_due}`
);
assert(
  sept.lumps_still_due === 9177.95,
  `and is reported on its own, got ${sept.lumps_still_due}`
);
assert(sept.due === 10177.95, `this month due is paid plus unpaid, got ${sept.due}`);
// The refinanced agreement is not live, and August is not this month.
assert(
  currentMonthInstalmentTotals(
    [{ live: true, monthly_instalment: 500, amount: 500, status: "due", due_date: "2026-09-28" }],
    "2026-09-01",
    "2026-10-01"
  ).lumps_still_due === 0,
  "an ordinary month carries no lumps"
);

const ring = collectionRateFromCashAndDue(50935, 41446.47);
assert(ring.collected === 50935, "ring collected is GoCardless cash");
assert(ring.still_due === 41446.47, "ring still due is live unpaid rents");
assert(ring.due === 92381.47, `cash plus leftover due, got ${ring.due}`);
assert(ring.rate === 55, `50935/92381 is 55%, got ${ring.rate}`);
assert(collectionRateFromCashAndDue(0, 0).rate === 0, "empty month is 0%");

console.log("deal-status tests ok");

// Refinances are recorded as manual receipts — the old agreement is settled
// off and the balance moves to the new one — but no money arrives. Adding
// them to the collections chart put April £47k, June £37k and September £45k
// over what GoCardless actually took.
assert(
  isManualCashReceipt({
    source: "manual",
    amount: 23999.56,
    monthly_instalment: 600.09,
  }) === false,
  "a refinance lump is not cash in"
);
assert(
  isManualCashReceipt({ source: "manual", amount: 500, monthly_instalment: 1000 }) === true,
  "L3's £500 paid into the bank after a missed Direct Debit is cash in"
);
assert(
  isManualCashReceipt({ source: "manual", amount: 200, monthly_instalment: 0 }) === true,
  "an as-and-when receipt with no contracted monthly is cash in"
);
assert(
  isManualCashReceipt({ source: "bank", amount: 1456, monthly_instalment: 1409 }) === true,
  "a rent that changed mid-term is still cash in"
);
assert(
  isManualCashReceipt({ source: null, amount: 500, monthly_instalment: 1000 }) === false,
  "a book tick with no source is not cash in"
);
assert(
  isManualCashReceipt({ source: "manual", amount: 2001, monthly_instalment: 1000 }) === false,
  "more than twice the rent is a lump, not a monthly payment"
);

console.log("deal-status manual-receipt tests ok");
