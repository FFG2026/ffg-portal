import {
  addMonths,
  buildPaymentSchedule,
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
console.log("schedule tests ok");
