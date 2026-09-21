import {
  addMonths,
  buildPaymentSchedule,
  financeLeaseScheduleNeedsRepair,
  instalmentDueFromStart,
  rebuildFinanceLeaseSchedule,
  rewritePaymentSchedule,
  startDateFromDriveFolder,
  startDateFromFirstPayment,
  visibleScheduleNote,
} from "./schedule";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(addMonths("2026-01-31", 1) === "2026-02-28", "jan 31 + 1 month");
assert(addMonths("2026-01-25", 1) === "2026-02-25", "jan 25 + 1 month");

const rows = buildPaymentSchedule({
  termMonths: 3,
  monthlyInstalment: 100,
  startDate: "2026-01-25",
});
assert(rows.length === 3, "3 instalments");
assert(rows[0].due_date === "2026-02-25", "first due a month after start");
assert(rows[2].balance_after === 0, "final balance");
assert(
  startDateFromFirstPayment(rows) === "2026-01-25",
  "start is first payment minus one month"
);
assert(addMonths("2023-01-12", -1) === "2022-12-12", "HP32 first due back one month");
assert(addMonths("2026-09-10", -1) === "2026-08-10", "HP142 first due back one month");
assert(
  startDateFromDriveFolder("2025-04-10T08:16:45.573Z") === "2025-04-10",
  "drive folder day"
);
assert(
  instalmentDueFromStart("2025-04-10", 1) === "2025-05-10",
  "first payment a month after the Drive folder"
);

const rewritten = rewritePaymentSchedule(
  [
    {
      amount: 1109.1,
      status: "paid",
      paid_date: "2026-01-26",
      gocardless_payment_id: "OLD1",
    },
    {
      amount: 595.39,
      status: "paid",
      paid_date: "2026-09-02",
      gocardless_payment_id: "PM01XS7QCP84254J5NG78Y75JYQT",
      notes: "GoCardless collection",
      source: "gocardless",
    },
    {
      amount: 595.39,
      status: "paid",
      paid_date: "2026-09-03",
      gocardless_payment_id: "PM01XSCHEN8Q9P5E1PNTCRZZ6D21",
      notes: "GoCardless collection",
      source: "gocardless",
    },
    {
      amount: 595.39,
      status: "paid",
      paid_date: "2026-09-03",
      notes: "Refund of double payment",
      source: "manual",
    },
  ],
  {
    termMonths: 35,
    monthlyInstalment: 595.39,
    startDate: "2026-09-01",
  }
);
assert(rewritten.length === 35, "rewrite is 35 instalments");
assert(rewritten[0].due_date === "2026-10-01", "first due a month after 1 Sep");
assert(rewritten[0].status === "paid", "keeps the genuine new collection");
assert(
  rewritten[0].gocardless_payment_id === "PM01XS7QCP84254J5NG78Y75JYQT",
  "keeps the first matching GoCardless id"
);
assert(rewritten[1].status === "due", "double collection is netted with the refund");
assert(rewritten[34].amount === 595.39, "last instalment is a full 595.39");

const fl14 = rebuildFinanceLeaseSchedule(
  {
    termMonths: 36,
    monthlyInstalment: 1146.05,
    startDate: "2025-07-26",
  },
  [
    { chargeDate: "2025-08-26", amount: 1146.05, gocardless_payment_id: "PM1" },
    { chargeDate: "2025-09-25", amount: 1146.05, gocardless_payment_id: "PM2" },
    { chargeDate: "2025-10-27", amount: 1146.05, gocardless_payment_id: "PM3" },
    { chargeDate: "2025-11-25", amount: 1146.05, gocardless_payment_id: "PM4" },
    { chargeDate: "2025-12-29", amount: 1146.05, gocardless_payment_id: "PM5" },
    { chargeDate: "2026-01-26", amount: 1146.05, gocardless_payment_id: "PM37", notes: "GoCardless collection" },
    { chargeDate: "2026-04-27", amount: 1146.05, gocardless_payment_id: "PM6" },
    { chargeDate: "2026-05-26", amount: 1146.05, gocardless_payment_id: "PM7" },
    { chargeDate: "2026-06-25", amount: 1146.05, gocardless_payment_id: "PM8" },
    { chargeDate: "2026-07-27", amount: 1146.05, gocardless_payment_id: "PM38" },
    { chargeDate: "2026-08-25", amount: 1146.05, gocardless_payment_id: "PM39" },
  ]
);
assert(fl14.length === 36, "FL14 is 36 monthly rents");
assert(fl14[0].due_date === "2025-08-26", "first due from start");
assert(fl14[5].due_date === "2026-01-26", "January sits in instalment order");
assert(fl14[5].status === "paid" && fl14[5].gocardless_payment_id === "PM37", "Jan leftover becomes instalment 6");
assert(fl14[5].notes == null, "monthly GoCardless tick has no extra label");
assert(fl14[6].due_date === "2026-02-26" && fl14[6].status === "due", "Feb hole is restored as due");
assert(fl14[7].due_date === "2026-03-26" && fl14[7].status === "due", "Mar hole is restored as due");
assert(fl14[11].status === "paid" && fl14[11].amount === 1146.05, "July collection is VAT-inclusive");
assert(fl14[12].status === "paid", "August collection ticks instalment 13");
assert(fl14[13].status === "due" && fl14[13].amount === 1146.05, "remaining dues are gross not net");
assert(fl14.every((row) => row.instalment_number === fl14.indexOf(row) + 1), "numbers stay in date order");
assert(
  financeLeaseScheduleNeedsRepair(
    [
      { instalment_number: 9, due_date: "2026-07-27", amount: 955.04, status: "due" },
      { instalment_number: 37, due_date: "2026-01-26", amount: 1146.05, status: "paid" },
    ],
    { termMonths: 36, monthlyInstalment: 1146.05, startDate: "2025-07-26" }
  ),
  "net dues and leftover numbers need an FL rebuild"
);

assert(visibleScheduleNote("GoCardless collection") == null, "hide internal GC label");
assert(visibleScheduleNote("Refund of double payment") === "Refund of double payment", "keep real notes");
