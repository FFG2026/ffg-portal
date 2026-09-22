import { paymentsForAgreement, withPaymentMatchContext } from "./sync-payments";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const hp41 = {
  id: "a",
  agreement_number: "HP41",
  gocardless_mandate_id: "MD_HP41",
  monthly_instalment: 6303.76,
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

const hp135 = {
  id: "c",
  agreement_number: "HP135",
  gocardless_mandate_id: "MD00232BVVCYEF",
  monthly_instalment: 360.77,
};
const hp135Gc = [
  {
    id: "PM_SEP",
    description: "Monthly collection",
    charge_date: "2026-09-09",
    status: "paid_out",
    amount: 36077,
    links: { mandate: "MD00232BVVCYEF" },
  },
  {
    id: "PM_LUMP_MAY",
    description: "Collection",
    charge_date: "2026-05-19",
    status: "paid_out",
    amount: 169780,
    links: { mandate: "MD00232BVVCYEF" },
  },
  {
    id: "PM_LUMP_JUL",
    description: "Collection",
    charge_date: "2026-07-06",
    status: "paid_out",
    amount: 150280,
    links: { mandate: "MD00232BVVCYEF" },
  },
  {
    id: "PM_OTHER_HP",
    description: "HP99/1",
    charge_date: "2026-05-19",
    status: "paid_out",
    amount: 169780,
    links: { mandate: "MD00232BVVCYEF" },
  },
];
const forHp135 = paymentsForAgreement(hp135Gc, hp135);
assert(forHp135.some((p) => p.id === "PM_SEP"), "HP135 monthly on its own mandate still ticks");
assert(!forHp135.some((p) => p.id === "PM_LUMP_MAY"), "£1,697.80 is not an HP135 monthly");
assert(!forHp135.some((p) => p.id === "PM_LUMP_JUL"), "deposit-sized £1,502.80 is not an HP135 monthly");
assert(!forHp135.some((p) => p.id === "PM_OTHER_HP"), "HP99/1 on this mandate does not tick HP135");

const shared = withPaymentMatchContext([
  { id: "1", agreement_number: "HP21", gocardless_mandate_id: "MD_SHARE", monthly_instalment: 500 },
  { id: "2", agreement_number: "HP32", gocardless_mandate_id: "MD_SHARE", monthly_instalment: 358.69 },
]);
assert(shared.every((a) => a.mandateShared), "two deals on one mandate are marked shared");
const unlabelledShared = paymentsForAgreement(
  [
    {
      id: "PM_SHARE",
      description: "Monthly collection",
      charge_date: "2026-06-12",
      status: "paid_out",
      amount: 50000,
      links: { mandate: "MD_SHARE" },
    },
    {
      id: "PM_HP21",
      description: "HP21/4",
      charge_date: "2026-06-12",
      status: "paid_out",
      amount: 50000,
      links: { mandate: "MD_SHARE" },
    },
  ],
  shared[0]
);
assert(!unlabelledShared.some((p) => p.id === "PM_SHARE"), "unlabelled cash on a shared mandate is not guessed");
assert(unlabelledShared.some((p) => p.id === "PM_HP21"), "HP21/4 on a shared mandate still ticks HP21");

console.log("payments-for-agreement tests ok");
