import {
  planPartSettlement,
  nextInstalmentNumber,
  sortByDueDate,
  withRemainingBalance,
  pickBankPaymentInstalment,
} from "./part-settlement";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const unpaid = [
  { id: "21", instalment_number: 21, amount: 2094.95, due_date: "2024-04-29" },
  { id: "22", instalment_number: 22, amount: 2094.95, due_date: "2024-05-29" },
  { id: "36", instalment_number: 36, amount: 2094.95, due_date: "2025-07-29" },
  { id: "35", instalment_number: 35, amount: 2094.95, due_date: "2025-06-29" },
];

const four = planPartSettlement(unpaid, 8379.8, "2026-09-21", "2026-09-21");
assert(four.removeIds.length === 4, "clears four instalments from the end");
assert(four.reduce === null, "exact");

const partial = planPartSettlement(unpaid, 3000, "2026-09-21", "2026-09-21");
assert(partial.removeIds.length === 1, "drops the last instalment");
assert(partial.reduce?.id === "35", "shaves the next-from-last");
assert(partial.reduce?.amount === 1189.9, `got ${partial.reduce?.amount}`);

const retrospective = planPartSettlement(
  unpaid,
  23463.44,
  "2024-04-29",
  "2026-09-21"
);
assert(retrospective.removeIds.length === 4, "past-dated lump clears all dues from that day");
assert(retrospective.reduce === null, "no leftover dues after a retrospective settle");

const smallPast = planPartSettlement(unpaid, 500, "2024-04-29", "2026-09-21");
assert(smallPast.removeIds.length === 0, "£500 must not wipe the rest of the HP");
assert(smallPast.reduce?.id === "36", "shaves the last instalment instead");
assert(smallPast.reduce?.amount === 1594.95, `got ${smallPast.reduce?.amount}`);

assert(
  nextInstalmentNumber(
    [
      { instalment_number: 20, due_date: "2024-03-29" },
      { instalment_number: 36, due_date: "2025-07-29" },
    ],
    "2024-04-29"
  ) === 21,
  "sits after March as number 21"
);

const ordered = sortByDueDate([
  { instalment_number: 37, due_date: "2024-04-29" },
  { instalment_number: 20, due_date: "2024-03-29" },
]);
assert(ordered[0].instalment_number === 20, "March before April");
assert(ordered[1].instalment_number === 37, "April lump follows");

const balances = withRemainingBalance([
  { amount: 2513.94, status: "paid" },
  { amount: 23463.44, status: "paid" },
]);
assert(balances[0].balance_after === 23463.44, "first paid line leaves the rest of the book");
assert(balances[1].balance_after === 0, "settled book ends at zero");

const l2 = withRemainingBalance(
  Array.from({ length: 36 }, () => ({ amount: 2608.65, status: "paid" }))
);
assert(l2[0].balance_after === 91302.75, "L2 remaining after first collection");
assert(l2[35].balance_after === 0, "L2 paid in full ends at zero");

const hp21Unpaid = [
  { id: "failed-may", instalment_number: 32, amount: 640, due_date: "2025-05-05" },
  { id: "mar", instalment_number: 42, amount: 640, due_date: "2026-03-05" },
  { id: "apr", instalment_number: 43, amount: 640, due_date: "2026-04-05" },
  { id: "may", instalment_number: 44, amount: 640, due_date: "2026-05-05" },
  { id: "jun", instalment_number: 45, amount: 640, due_date: "2026-06-05" },
  { id: "jul", instalment_number: 46, amount: 640, due_date: "2026-07-05" },
  { id: "aug", instalment_number: 47, amount: 640, due_date: "2026-08-05" },
  { id: "sep", instalment_number: 48, amount: 640, due_date: "2026-09-05" },
];
const hp21 = planPartSettlement(hp21Unpaid, 5120, "2026-02-06", "2026-02-06");
assert(hp21.removeIds.length === 8, "full settlement clears the failed DD and remaining months");
assert(hp21.reduce === null, "HP21 does not leave a reduced instalment");

const bankTarget = pickBankPaymentInstalment(
  [
    { id: "aug", due_date: "2026-08-08", status: "paid", instalment_number: 11 },
    { id: "sep-fail", due_date: "2026-09-08", status: "failed", instalment_number: 12 },
    { id: "oct", due_date: "2026-10-08", status: "due", instalment_number: 13 },
  ].filter((row) => row.status !== "paid"),
  "2026-09-15"
);
assert(bankTarget?.id === "sep-fail", "bank receipt ticks the missed September Direct Debit");

const laterBank = pickBankPaymentInstalment(
  [
    { id: "sep-fail", due_date: "2026-09-08", status: "failed", instalment_number: 12 },
    { id: "oct", due_date: "2026-10-08", status: "due", instalment_number: 13 },
  ],
  "2026-10-20"
);
assert(laterBank?.id === "oct", "October bank receipt ticks October, not an older miss");

const noMonth = pickBankPaymentInstalment(
  [
    { id: "fail", due_date: "2026-09-08", status: "failed", instalment_number: 12 },
    { id: "due", due_date: "2026-10-08", status: "due", instalment_number: 13 },
  ],
  "2026-11-02"
);
assert(noMonth?.id === "fail", "with no matching month, still clear the failed Direct Debit first");

console.log("part-settlement tests ok");
