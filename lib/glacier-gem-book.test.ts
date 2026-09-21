import { parseGlacierGemTotals, glacierAgreementNumber } from "./glacier-gem-book";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const yellow = { s: { fgColor: { rgb: "FFFF00" } } };
const totals = [
  [
    { v: "Agreement" },
    {},
    { v: "Term" },
    { v: "Total Lent" },
    {},
    {},
    {},
    {},
    {},
    { v: "Monthly payment" },
    { v: "1st" },
    { v: "2nd" },
    { v: "3rd" },
  ],
  [
    { v: "GG05" },
    {},
    { v: 36 },
    { v: 23212.84 },
    {},
    {},
    { v: 1542 },
    {},
    {},
    { v: 771 },
    { v: 771, ...yellow },
    { v: 771, ...yellow },
    { v: 771 },
  ],
];

const deals = parseGlacierGemTotals(totals, {}, {
  GG05: { company_name: "Test Ltd", first_due: "2025-07-04" },
});
assert(deals.length === 1, "one deal");
assert(deals[0].agreement_number === "GG05", "number");
assert(deals[0].agreement_type === "GG", "type");
assert(deals[0].book === "gg", "book");
assert(deals[0].payments.length === 3, `got ${deals[0].payments.length}`);
assert(deals[0].payments[0].paid === true, "yellow is paid");
assert(deals[0].payments[2].paid === false, "plain is unpaid");
assert(deals[0].payments[0].due_date === "2025-07-04", "first due");
assert(deals[0].payments[1].due_date === "2025-08-04", "monthly");
assert(deals[0].start_date === "2025-06-04", "start is first due minus one month");
assert(glacierAgreementNumber(1) === "GG01", "pad");
console.log("glacier gem book tests ok");
