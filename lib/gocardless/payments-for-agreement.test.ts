import { paymentsForAgreement } from "./sync-payments";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const hp41 = {
  id: "a",
  agreement_number: "HP41",
  gocardless_mandate_id: "MD_HP41",
};

const gc = [
  {
    id: "PM1",
    description: "HP41/1",
    charge_date: "2023-06-27",
    status: "paid_out",
    amount: 630376,
    links: { mandate: "MD_OTHER" },
  },
  {
    id: "PM2",
    description: "HP42/1",
    charge_date: "2023-06-27",
    status: "paid_out",
    amount: 10000,
    links: { mandate: "MD_HP41" },
  },
  {
    id: "PM3",
    description: "Monthly collection",
    charge_date: "2023-07-27",
    status: "paid_out",
    amount: 630376,
    links: { mandate: "MD_HP41" },
  },
];

const forHp41 = paymentsForAgreement(gc, hp41);
assert(forHp41.some((p) => p.id === "PM1" && p.instalment_number === 1), "HP41/1 on another mandate still belongs to HP41");
assert(!forHp41.some((p) => p.id === "PM2"), "HP42/1 on the HP41 mandate does not tick HP41");
assert(forHp41.some((p) => p.id === "PM3"), "unlabelled payment on the HP41 mandate still matches by mandate");

const hp104 = {
  id: "b",
  agreement_number: "HP104",
  gocardless_mandate_id: null,
};
const cancelledDd = paymentsForAgreement(
  [
    {
      id: "PM104",
      description: "FFG HP104",
      charge_date: "2025-12-01",
      status: "paid_out",
      amount: 15000,
      links: { mandate: "MD_CANCELLED" },
    },
  ],
  hp104
);
assert(cancelledDd.some((p) => p.id === "PM104"), "cancelled mandate still matches by HP number in the description");

console.log("payments-for-agreement tests ok");
