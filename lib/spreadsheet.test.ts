import { parseAgreementRows, parseWorkbookSheets } from "./spreadsheet";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const hp119 = parseAgreementRows("HP119", [
  [null, "Direct Commercial Finance Ltd"],
  [],
  [null, "Purchase Price", 60350],
  [null, "Customer Deposit", 20000],
  [null, "Total Lend", 40350],
  [null, "Commission", null],
  [null, "Documentation Fee", null],
  [],
  [new Date(2026, 1, 25), "1st Payment", 1271.99, "✓"],
  [new Date(2026, 2, 25), "2nd Payment", 1271.99, "✓"],
  [new Date(2026, 8, 25), "8th Payment", 1271.99, ""],
]);

assert(hp119?.company_name === "Direct Commercial Finance Ltd", "company");
assert(hp119?.term_months === 3, "term from payment rows");
assert(hp119?.payments[0].due_date === "2026-02-25", "excel date");
assert(hp119?.payments[0].paid === true, "tick");
assert(hp119?.payments[2].paid === false, "unticked");
assert(hp119?.start_date === "2026-02-25", "first due is start");

const empty = parseAgreementRows("HP140", [
  [null, "HP00140 - Customer Name"],
  [],
  [null, "Purchase Price", null],
  [null, "1st Payment", null],
]);
assert(empty === null, "blank placeholder tab skipped");

const deals = parseWorkbookSheets({
  Dashboard: [[null, "FFG Deal Book"]],
  HP142: [
    [null, "Kenhire Ltd"],
    [],
    [null, "Purchase Price", 18000],
    [null, "Customer Deposit", 3000],
    [null, "Total Lend", 15000],
    [null, "Commission", 600],
    [null, "Documentation Fee", 195],
    [new Date(2026, 8, 10), "1st Payment", 410.81, "✓"],
    [new Date(2026, 9, 10), "2nd Payment", 410.81],
  ],
  L3: [
    ["Mark Sanderson", "Mark Sanderson"],
    [],
    [null, "Purchase Price", 29000],
    [null, "Total Lend", 29000],
    [new Date(2025, 3, 7), "1st Payment", 1000, "DD", "✓"],
  ],
});
assert(deals.length === 2, "skips dashboard");
assert(deals.some((d) => d.agreement_number === "HP142"), "hp142");
assert(deals.find((d) => d.agreement_number === "L3")?.agreement_type === "L", "loan type");
assert(deals.find((d) => d.agreement_number === "L3")?.payments[0].paid === true, "tick in col F");

console.log("spreadsheet tests ok");
