import { withChargeDates } from "./charge-dates";
import { overdueSum, OVERDUE_GRACE_DAYS } from "../deal-status";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(OVERDUE_GRACE_DAYS === 3, "an instalment gets 3 days past its charge date");

const row = (due: string, extra: Record<string, unknown> = {}) => ({
  due_date: due,
  status: "due",
  amount: 500,
  ...extra,
});
const sum = (rows: any[], today: string) => overdueSum(rows, today);

// No Direct Debit information: the schedule date stands in, with the same grace.
assert(sum([row("2026-10-05")], "2026-10-07") === 0, "2 days past is not overdue");
assert(sum([row("2026-10-05")], "2026-10-08") === 500, "3 days past is overdue");
assert(sum([row("2026-10-08")], "2026-10-08") === 0, "due today is not overdue");

// GoCardless charges on the 9th for an instalment scheduled the 5th and it failed:
// overdue counts from the 9th, not the 5th.
const failed = [
  {
    id: "PM1",
    charge_date: "2026-10-09",
    status: "failed",
    amount: 50000,
    mandateId: "MD1",
  },
];
const failedRows = withChargeDates([row("2026-10-05")], failed);
assert(sum(failedRows, "2026-10-11") === 0, "2 days after the real charge date is not overdue");
assert(sum(failedRows, "2026-10-12") === 500, "3 days after the real charge date is overdue");
assert(
  sum([row("2026-10-05")], "2026-10-12") === 500,
  "without the charge date the same row would already have been overdue"
);

// A Direct Debit that is pending, submitted or collected is on its way.
for (const status of ["pending_submission", "submitted", "confirmed", "paid_out"]) {
  const rows = withChargeDates([row("2026-09-01")], [
    { id: "PM2", charge_date: "2026-09-03", status, amount: 50000, mandateId: "MD1" },
  ]);
  assert(sum(rows, "2026-10-07") === 0, `${status} is not overdue`);
}

// A charge is used once, and never for a row that already ticked it off.
const two = withChargeDates(
  [
    row("2026-09-05"),
    row("2026-10-05"),
    { due_date: "2026-08-05", status: "paid", amount: 500, gocardless_payment_id: "PM3" },
  ],
  [
    { id: "PM3", charge_date: "2026-08-05", status: "paid_out", amount: 50000, mandateId: "MD1" },
    { id: "PM4", charge_date: "2026-10-06", status: "failed", amount: 50000, mandateId: "MD1" },
  ]
);
const sept: any = two.find((r) => r.due_date === "2026-09-05");
const oct: any = two.find((r) => r.due_date === "2026-10-05");
assert(!sept.effective_due && !sept.collecting, "the September row has no charge of its own");
assert(oct.effective_due === "2026-10-06", "the failed charge attaches to the October row");

console.log("charge-dates tests ok");
