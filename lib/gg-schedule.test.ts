import {
  ggPaymentPatch,
  nextGgAgreementStatus,
} from "./gg-schedule";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const paid = {
  due_date: "2026-09-19",
  amount: 2722.35,
  status: "paid",
  paid_date: "2026-09-19",
  notes: "Standing order",
};

const updated = ggPaymentPatch(paid, {
  amount: "2700.00",
  paid_date: "2026-09-21",
  notes: "Banked two days late",
});
assert(updated.amount === 2700, "amount can be corrected after it was added");
assert(updated.paid_date === "2026-09-21", "paid date can move");
assert(updated.due_date === "2026-09-19", "due date stays unless changed");
assert(updated.status === "paid", "stays paid");
assert(updated.notes === "Banked two days late", "note can be rewritten");

const unpaid = ggPaymentPatch(paid, { status: "due", notes: "" });
assert(unpaid.status === "due", "a standing-order tick can be unmarked");
assert(unpaid.paid_date === null, "unmarking clears the paid date");
assert(unpaid.notes === null, "empty note is stored as null");

const marked = ggPaymentPatch(
  {
    due_date: "2026-10-19",
    amount: 2722.35,
    status: "due",
    paid_date: null,
    notes: null,
  },
  { status: "paid" }
);
assert(marked.status === "paid", "a future rent can be marked received");
assert(marked.paid_date === "2026-10-19", "paid date defaults to the due date");

let threw = false;
try {
  ggPaymentPatch(paid, { amount: 0 });
} catch {
  threw = true;
}
assert(threw, "zero is not a payment");

assert(
  nextGgAgreementStatus({ status: "active", monthly_instalment: 2722.35 }, [
    { status: "paid" },
    { status: "due" },
  ]) === "active",
  "still collecting"
);
assert(
  nextGgAgreementStatus({ status: "active", monthly_instalment: 2722.35 }, [
    { status: "paid" },
    { status: "paid" },
  ]) === "settled",
  "last standing order settles the GG"
);
assert(
  nextGgAgreementStatus({ status: "cancelled", monthly_instalment: 2722.35 }, [
    { status: "due" },
  ]) === "cancelled",
  "an unwind is left cancelled"
);

console.log("gg-schedule tests ok");
