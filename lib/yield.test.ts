import {
  advanceOf,
  instalmentsOf,
  monthlyRate,
  annualYield,
  dealYield,
  bookYield,
  marginOverTerm,
} from "./yield";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

// HP145: 25,228.65 advanced, 48 x 664.37, no commission. Priced at 12%.
const hp145 = {
  agreement_number: "HP145",
  total_lend: 25228.65,
  commission: 0,
  monthly_instalment: 664.37,
  term_months: 48,
};
assert(advanceOf(hp145) === 25228.65, "advance is the lend when no commission");
assert(instalmentsOf(hp145).length === 48, "48 instalments from the header");
assert(
  dealYield(hp145) === 12.7,
  `HP145 yields about 12.7%, got ${dealYield(hp145)}`
);

// The old formula — profit over lend, compounded across the term — assumes the
// whole advance stays out the whole term and reports roughly half the rate.
const oldWay =
  Math.round((Math.pow(1 + (664.37 * 48 - 25228.65) / 25228.65, 12 / 48) - 1) * 1000) / 10;
assert(oldWay === 6, `the old formula reports 6.0%, got ${oldWay}`);
assert(
  (dealYield(hp145) as number) > oldWay * 1.9,
  "the real rate is roughly double what the old formula reported"
);

// Commission is money out of the door, so it lowers the yield FFG keeps.
// HP144 is written at a higher rate but nets to the same place as HP145.
const hp144Gross = { total_lend: 30000, commission: 0, monthly_instalment: 1036.29, term_months: 36 };
const hp144Net = { total_lend: 30000, commission: 1200, monthly_instalment: 1036.29, term_months: 36 };
assert(dealYield(hp144Gross) === 15.8, `HP144 to the customer, got ${dealYield(hp144Gross)}`);
assert(dealYield(hp144Net) === 12.7, `HP144 net of commission, got ${dealYield(hp144Net)}`);

// A flat 12% a year on a non-amortising balance: one payment of the lend plus
// a year's interest, twelve months out, must solve to exactly 12%.
assert(
  annualYield(1000, [...Array(11).fill(0), 1120]) === 12,
  `a single bullet repayment solves to its own rate, got ${annualYield(1000, [...Array(11).fill(0), 1120])}`
);

// The contracted header is the input, not the collected rows. A part
// settlement changes what was collected, not the rate the deal was written at,
// and the rows carry split collections and settlement lumps that would misplace
// money in time.
const recut = {
  total_lend: 1000,
  monthly_instalment: 500,
  term_months: 3,
  payments: [{ amount: 400 }, { amount: 400 }, { amount: 400 }],
} as never;
assert(
  instalmentsOf(recut).reduce((s, n) => s + n, 0) === 1500,
  "the contracted header is used, not the collected rows"
);

// A schedule that never repays the advance has no rate to find. HP18 is a real
// legacy record: 60,000 lent, ten rows of 750 imported.
const broken = { total_lend: 60000, commission: 500, monthly_instalment: 750, term_months: 10 };
assert(monthlyRate(advanceOf(broken), instalmentsOf(broken)) === null, "no rate without a margin");
assert(dealYield(broken) === null, "a part-imported schedule yields null, not zero");
assert(annualYield(0, [100]) === null, "no advance, no rate");
assert(annualYield(100, []) === null, "no instalments, no rate");

// Those records must be excluded from the book rate, and declared.
const book = bookYield([hp145, hp144Net, broken]);
assert(book.excluded_deals === 1, `one deal excluded, got ${book.excluded_deals}`);
assert(book.excluded_lent === 60000, `excluded lend reported, got ${book.excluded_lent}`);
assert(book.deals === 2, `two deals counted, got ${book.deals}`);
assert(book.lent === 55228.65, `counted lend, got ${book.lent}`);
// Both counted deals net to 12.7%, so the pooled book does too.
assert(book.annual_yield === 12.7, `pooled book yield, got ${book.annual_yield}`);

// Pooling weighs by money and time, not by deal count: a tiny cheap deal
// cannot drag the book the way averaging percentages would.
const big = { total_lend: 100000, monthly_instalment: 2634.13, term_months: 48 };
const tiny = { total_lend: 1000, monthly_instalment: 86.07, term_months: 12 };
const pooled = bookYield([big, tiny]).annual_yield;
const meanOfRates =
  ((dealYield(big) as number) + (dealYield(tiny) as number)) / 2;
assert(
  Math.abs(pooled - (dealYield(big) as number)) <
    Math.abs(meanOfRates - (dealYield(big) as number)),
  "the pooled rate tracks the large deal, unlike a mean of percentages"
);

// An empty book has no rate and says so rather than inventing one.
const none = bookYield([]);
assert(none.annual_yield === 0 && none.deals === 0, "an empty book yields nothing");

assert(marginOverTerm(6661.11, 25228.65) === 26.4, "margin over term is profit over lend");
assert(marginOverTerm(100, 0) === 0, "no lend, no margin");

console.log("yield tests ok");
