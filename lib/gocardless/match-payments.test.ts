import {
  matchGcPaymentsToInstalments,
  isDirectDebitUpToDate,
  daysBetween,
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

console.log("match-payments tests ok");
