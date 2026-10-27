import { buildAmortisation, impliedMonthlyRate } from "./amortisation";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

function monthRows(n: number, amount: number, start = "2026-01-10") {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2026, i, 10)).toISOString().slice(0, 10);
    return { id: `r${i + 1}`, instalment_number: i + 1, due_date: d, amount, status: i < 3 ? "paid" : "due" };
  });
}

// A plain deal amortises to nothing and the interest is the rentals less the lend.
const lend = 13600;
const plain = buildAmortisation({
  agreementType: "HP",
  totalLend: lend,
  rows: monthRows(36, 449.78),
  vehicles: [],
})!;
assert(plain.rate_monthly > 0, "a rate is found");
assert(near(plain.closing_balance, 0), `plain closes at nil, got ${plain.closing_balance}`);
assert(near(plain.totals.interest, 449.78 * 36 - lend, 2), `interest ${plain.totals.interest}`);
assert(plain.lines.length === 36, "one line per rental");

// No interest when the rentals do not exceed the lend.
const flat = buildAmortisation({ agreementType: "HP", totalLend: 36000, rows: monthRows(36, 1000), vehicles: [] })!;
assert(flat.rate_monthly === 0 && flat.rate_note, "no rate, with a note");

// Finance lease: gross rentals are taken net of VAT.
const fl = buildAmortisation({ agreementType: "FL", totalLend: 28809.4, rows: monthRows(36, 1151.88), vehicles: [] })!;
assert(fl.vat_divisor === 1.2, "FL net of VAT");
assert(near(fl.closing_balance, 0, 2), `FL closes at nil, got ${fl.closing_balance}`);

// An early settlement: two equal vehicles, one settled after month 12 for its
// remaining rentals. The other carries on at half the rental.
const L = 20000;
const full = 36;
const half = 300;
const rows = monthRows(full, 2 * half).map((r, i) => (i >= 12 ? { ...r, amount: half, status: "due" } : r));
rows.push({ id: "s1", instalment_number: 0, due_date: "2026-12-12", amount: half * 24, status: "paid" });
const vehicles = [
  { registration: "AA1", capital_financed: L / 2, rental_share: half, status: "active", settled_date: null, settled_amount: null, settlement_payment_id: null },
  { registration: "BB2", capital_financed: L / 2, rental_share: half, status: "settled", settled_date: "2026-12-12", settled_amount: half * 24, settlement_payment_id: "s1" },
];
const settled = buildAmortisation({ agreementType: "HP", totalLend: L, rows, vehicles })!;
const ev = settled.lines.find((l) => l.kind === "settlement");
assert(ev, "settlement shows as its own line");
assert(ev!.label.includes("BB2"), "names the vehicle");
const before = settled.lines.filter((l) => l.kind === "rental")[11];
assert(near(ev!.capital, before.balance / 2, 0.02), "clears the vehicle's half of the balance");
assert(ev!.interest > 0, "premium above capital is shown as interest");
assert(near(settled.closing_balance, 0, 1), `settled deal still closes at nil, got ${settled.closing_balance}`);
const orig = buildAmortisation({ agreementType: "HP", totalLend: L, rows: monthRows(36, 2 * half), vehicles: [] })!;
assert(near(settled.rate_monthly, orig.rate_monthly, 1e-6), "the rate does not move with a settlement");
assert(settled.original[settled.original.length - 1].balance < 1, "original line runs to nil");

// A settlement payment sitting in the instalment sequence (GG01 style) is the
// event itself, not a rental.
const slotRows = monthRows(36, 2 * half).map((r, i) => (i >= 12 ? { ...r, amount: half } : r));
slotRows[12] = { ...slotRows[12], id: "s2", amount: half * 23 };
const slotVeh = vehicles.map((v) => (v.registration === "BB2" ? { ...v, settled_date: slotRows[12].due_date, settlement_payment_id: "s2" } : v));
const slot = buildAmortisation({ agreementType: "HP", totalLend: L, rows: slotRows, vehicles: slotVeh })!;
assert(slot.lines.filter((l) => l.kind === "settlement").length === 1, "one settlement line");
assert(slot.lines.filter((l) => l.kind === "rental").length === 35, "the slot row is not also a rental");
assert(impliedMonthlyRate([{ t: 1, a: 110 }], 100) > 0.09, "single flow rate");

console.log("amortisation tests ok");
