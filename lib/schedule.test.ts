import {
  addMonths,
  buildPaymentSchedule,
  rewritePaymentSchedule,
  startDateFromFirstPayment,
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
console.log("schedule tests ok");
