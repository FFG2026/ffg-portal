import { extraUnpaidOnSettledSheet } from "./import-book";
import type { SheetDeal } from "./spreadsheet";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const l4: SheetDeal = {
  agreement_number: "L4",
  agreement_type: "L",
  company_name: "Gary Chinn",
  purchase_price: 4000,
  customer_deposit: null,
  total_lend: 4000,
  commission: null,
  documentation_fee: null,
  monthly_instalment: 1000,
  term_months: 4,
  start_date: "2025-01-06",
  payments: [
    { instalment_number: 1, due_date: "2025-01-06", amount: 1000, paid: true },
    { instalment_number: 2, due_date: "2026-02-06", amount: 1000, paid: true },
    { instalment_number: 3, due_date: "2027-03-06", amount: 1000, paid: true },
    { instalment_number: 4, due_date: "2028-04-06", amount: 1000, paid: true },
  ],
};

const extras = extraUnpaidOnSettledSheet(l4, [
  { id: "1", instalment_number: 4, due_date: "2028-04-06", status: "paid" },
  { id: "2", instalment_number: 5, due_date: "2029-05-06", status: "due" },
  { id: "3", instalment_number: 6, due_date: "2030-06-06", status: "due" },
]);
assert(extras.map((p) => p.id).join() === "2,3", "drop phantom years after L4 settled");

const live = extraUnpaidOnSettledSheet(
  { ...l4, payments: l4.payments.map((p, i) => ({ ...p, paid: i < 3 })) },
  extras.concat([{ id: "1", instalment_number: 4, due_date: "2028-04-06", status: "due" }])
);
assert(live.length === 0, "do not trim a deal the sheet has not finished");

console.log("import-book tests ok");
