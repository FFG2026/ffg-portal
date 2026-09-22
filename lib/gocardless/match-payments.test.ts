import {
  matchGcPaymentsToInstalments,
  isDirectDebitUpToDate,
  daysBetween,
  isDocumentationFeeCollection,
  scheduleCollectionsOnly,
  collectedPoundsFromGoCardlessPayments,
  paidOutPoundsFromGoCardlessPayments,
  collectedThisMonthPounds,
  collectedThisMonthFromLinkedRows,
  amountsClose,
  collectedScheduleAmount,
  leftoverPaymentsToRecord,
} from "./match-payments";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const instalments = [
  { id: "1", due_date: "2026-02-25", status: "paid", amount: "1271.99", gocardless_payment_id: null },
  { id: "5", due_date: "2026-06-25", status: "paid", amount: "1271.99", gocardless_payment_id: null },
  { id: "6", due_date: "2026-07-25", status: "due", amount: "1271.99", gocardless_payment_id: null },
  { id: "7", due_date: "2026-08-25", status: "due", amount: "1271.99", gocardless_payment_id: null },
  { id: "8", due_date: "2026-09-25", status: "due", amount: "1271.99", gocardless_payment_id: null },
];

const gcPayments = [
  { id: "PM_JUN", charge_date: "2026-06-25", status: "paid_out", amount: 127199 },
  { id: "PM_JUL", charge_date: "2026-07-27", status: "confirmed", amount: 127199 },
  { id: "PM_AUG", charge_date: "2026-08-25", status: "paid_out", amount: 127199 },
  { id: "PM_SEP", charge_date: "2026-09-25", status: "pending_submission", amount: 127199 },
];

const matches = matchGcPaymentsToInstalments(instalments, gcPayments);
assert(matches.length === 3, `expected 3 matches, got ${matches.length}`);
assert(matches.find((m) => m.instalmentId === "6")?.status === "paid", "July should be paid");
assert(matches.find((m) => m.instalmentId === "7")?.status === "paid", "August should be paid");
assert(!matches.find((m) => m.instalmentId === "8"), "September pending should not tick");
assert(daysBetween("2026-07-25", "2026-07-27") === -2, "date diff");

const afterSync = instalments.map((row) => {
  const match = matches.find((m) => m.instalmentId === row.id);
  return match ? { ...row, status: match.status } : row;
});
assert(isDirectDebitUpToDate(afterSync, "2026-09-16") === true, "up to date on 16 Sep");
assert(isDirectDebitUpToDate(instalments, "2026-09-16") === false, "unsynced July/Aug is behind");
assert(isDirectDebitUpToDate(afterSync, "2026-09-26") === false, "Sep 26 without Sept collection is behind");

const numbered = [
  { id: "a", due_date: "2023-06-27", status: "due", amount: "6303.76", gocardless_payment_id: null, instalment_number: 1 },
  { id: "b", due_date: "2023-07-27", status: "due", amount: "6303.76", gocardless_payment_id: null, instalment_number: 2 },
];
const byRef = matchGcPaymentsToInstalments(numbered, [
  { id: "PM_HP41_2", charge_date: "2025-01-10", status: "paid_out", amount: 630376, instalment_number: 2 },
]);
assert(byRef.length === 1 && byRef[0].instalmentId === "b", "HP41/2 attaches to instalment 2 even if the date is off");

const stub = [
  {
    id: "one",
    due_date: "2025-07-22",
    status: "due",
    amount: "784.20",
    gocardless_payment_id: null,
    instalment_number: 1,
  },
];
const weekly = matchGcPaymentsToInstalments(stub, [
  { id: "PM150", charge_date: "2025-07-24", status: "paid_out", amount: 15000 },
]);
assert(weekly.length === 0, "£150 collection must not tick a £784.20 instalment");

assert(
  isDocumentationFeeCollection(19500, 195, 640) === true,
  "£195 is the documentation fee"
);
assert(
  isDocumentationFeeCollection(83500, 195, 640) === true,
  "first collection of monthly plus fee is not an extra instalment"
);
assert(
  isDocumentationFeeCollection(64000, 195, 640) === false,
  "the monthly instalment is not a documentation fee"
);
assert(
  scheduleCollectionsOnly(
    [
      { id: "fee", charge_date: "2024-05-01", status: "paid_out", amount: 19500 },
      { id: "combo", charge_date: "2022-10-03", status: "paid_out", amount: 83500 },
      { id: "rent", charge_date: "2024-05-03", status: "paid_out", amount: 64000 },
    ],
    195,
    640
  ).map((p) => p.id).join() === "rent",
  "only the monthly collection stays on the HP21 schedule"
);
assert(
  collectedPoundsFromGoCardlessPayments([
    { status: "paid_out", amount: 55326 },
    { status: "confirmed", amount: 85000 },
    { status: "paid_out", amount: 19500 },
    { status: "pending_submission", amount: 275866 },
  ]) === 1403.26,
  "collected this month is confirmed GoCardless cash without the doc fee"
);
assert(
  paidOutPoundsFromGoCardlessPayments([
    { status: "paid_out", amount: 3510414 },
    { status: "confirmed", amount: 1500000 },
    { status: "paid_out", amount: 19500 },
  ]) === 35104.14,
  "dashboard collected this month matches a paid-out GoCardless export"
);
assert(
  collectedThisMonthFromLinkedRows(
    [
      {
        status: "paid",
        amount: 430.64,
        paid_date: "2026-09-04",
        gocardless_payment_id: "PM1",
      },
      {
        status: "paid",
        amount: 430.64,
        paid_date: "2026-09-04",
        gocardless_payment_id: "PM1",
      },
      {
        status: "paid",
        amount: 1139.44,
        paid_date: "2026-09-27",
        gocardless_payment_id: null,
      },
      {
        status: "paid",
        amount: 4069.2,
        paid_date: "2026-09-21",
        source: "manual",
      },
    ],
    "2026-09-01",
    "2026-10-01"
  ) === 4499.84,
  "fallback ignores unticked-style rows with no GoCardless id"
);

const flNet = [
  {
    id: "n9",
    due_date: "2026-07-26",
    status: "due",
    amount: "955.04",
    gocardless_payment_id: null,
    instalment_number: 12,
  },
];
const flVat = matchGcPaymentsToInstalments(flNet, [
  {
    id: "PM_JUL_VAT",
    charge_date: "2026-07-27",
    status: "paid_out",
    amount: 114605,
  },
]);
assert(
  flVat.length === 1 && flVat[0].instalmentId === "n9",
  "GoCardless VAT-inclusive £1,146.05 ticks the net £955.04 FL rent"
);
assert(
  amountsClose(955.04, 114605) && collectedScheduleAmount(955.04, 114605, 1146.05) === 1146.05,
  "matched FL rent is stored at the VAT-inclusive monthly"
);

const l4Fifty = {
  id: "PM01E0YVR7K669",
  charge_date: "2025-05-12",
  status: "paid_out" as const,
  amount: 5000,
};
assert(
  leftoverPaymentsToRecord([l4Fifty], { startDate: "2025-12-06" }).length === 0,
  "L4 £50 before commencement is not a schedule row"
);
assert(
  leftoverPaymentsToRecord([l4Fifty], { startDate: "2025-12-06", settled: true }).length ===
    0,
  "finished deals do not grow leftover GC rows"
);
assert(
  leftoverPaymentsToRecord(
    [{ id: "PM_EXTRA", charge_date: "2026-05-06", status: "paid_out", amount: 800000 }],
    { startDate: "2025-12-06" }
  ).length === 0,
  "leftover lumps stay off the contracted schedule"
);
assert(
  leftoverPaymentsToRecord(
    [{ id: "PM_EXTRA", charge_date: "2026-05-06", status: "paid_out", amount: 800000 }],
    { startDate: "2025-12-06", enabled: true }
  ).length === 1,
  "leftover recording is opt-in only"
);
assert(
  leftoverPaymentsToRecord([l4Fifty], { enabled: false, startDate: "2024-01-01" }).length ===
    0,
  "batch sync can turn leftovers off"
);

console.log("match-payments tests ok");
