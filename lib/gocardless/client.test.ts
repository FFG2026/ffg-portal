import {
  gcListPaymentsPath,
  paymentsChargedInRange,
} from "./client";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const path = gcListPaymentsPath({
  "charge_date[gte]": "2026-09-01",
  "charge_date[lte]": "2026-09-30",
  status: "paid_out",
  limit: "500",
});
assert(path.includes("charge_date"), "keeps charge_date filter");
assert(path.includes("2026-09-01"), "keeps from date");
assert(path.includes("status=paid_out"), "asks for paid out only");

const rows = [
  { id: "aug", charge_date: "2026-08-31", status: "paid_out", amount: 100000 },
  { id: "csv", charge_date: "2026-09-17", status: "paid_out", amount: 36948 },
  { id: "conf", charge_date: "2026-09-20", status: "confirmed", amount: 50000 },
  { id: "oct", charge_date: "2026-10-01", status: "paid_out", amount: 80000 },
];
const sep = paymentsChargedInRange(rows, "2026-09-01", "2026-10-01", "paid_out");
assert(sep.map((p) => p.id).join() === "csv", "September paid-out only, not Aug/Oct or confirmed");

console.log("gocardless client tests ok");
