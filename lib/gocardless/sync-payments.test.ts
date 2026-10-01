import {
  balanceWritesNeeded,
  BALANCE_WRITE_CHUNK,
  LOOSE_MATCH_DAYS,
} from "./sync-payments";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

// A schedule whose balances are already right costs nothing to refresh.
const settled = [
  { id: "a", amount: 100, balance_after: 200 },
  { id: "b", amount: 100, balance_after: 100 },
  { id: "c", amount: 100, balance_after: 0 },
];
assert(
  balanceWritesNeeded(settled).length === 0,
  "a schedule already in balance writes nothing"
);

// Only the rows that moved are written.
const oneWrong = [
  { id: "a", amount: 100, balance_after: 200 },
  { id: "b", amount: 100, balance_after: 999 },
  { id: "c", amount: 100, balance_after: 0 },
];
const writes = balanceWritesNeeded(oneWrong);
assert(writes.length === 1, "only the row that moved is written");
assert(writes[0].id === "b" && writes[0].balance_after === 100, "with the right figure");

// A row that has never been given a balance is always written.
assert(
  balanceWritesNeeded([{ id: "a", amount: 50, balance_after: null }]).length === 1,
  "a row with no balance yet is written"
);

// The balance runs down the schedule in order and never goes below zero.
const fresh = balanceWritesNeeded([
  { id: "1", amount: "1630.63" },
  { id: "2", amount: "1630.63" },
  { id: "3", amount: "1630.63" },
]);
assert(
  fresh.map((w) => w.balance_after).join() === "3261.26,1630.63,0",
  `balances run down in order, got ${fresh.map((w) => w.balance_after).join()}`
);

// Pennies must not force a rewrite of the whole book every refresh.
assert(
  balanceWritesNeeded([{ id: "a", amount: 10, balance_after: 0.001 }]).length === 0,
  "a sub-penny difference is not a change"
);

assert(BALANCE_WRITE_CHUNK > 1, "balance writes go out in batches, not one at a time");
assert(LOOSE_MATCH_DAYS < 28, "never wide enough to reach an adjacent monthly instalment");

console.log("sync-payments tests ok");
