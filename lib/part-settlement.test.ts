import { planPartSettlement } from "./part-settlement";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const unpaid = [
  { id: "21", instalment_number: 21, amount: 2094.95 },
  { id: "22", instalment_number: 22, amount: 2094.95 },
  { id: "36", instalment_number: 36, amount: 2094.95 },
  { id: "35", instalment_number: 35, amount: 2094.95 },
];

const four = planPartSettlement(unpaid, 8379.8);
assert(four.removeIds.length === 4, "clears four instalments from the end");
assert(four.reduce === null, "exact");

const partial = planPartSettlement(unpaid, 3000);
assert(partial.removeIds.length === 1, "drops the last instalment");
assert(partial.reduce?.id === "35", "shaves the next-from-last");
assert(partial.reduce?.amount === 1189.9, `got ${partial.reduce?.amount}`);

try {
  planPartSettlement(unpaid, 90000);
  throw new Error("should have rejected overpay");
} catch (err: any) {
  assert(/still owing/.test(err.message), err.message);
}

console.log("part-settlement tests ok");
