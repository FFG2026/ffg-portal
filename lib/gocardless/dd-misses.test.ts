import {
  DD_MISS_FROM,
  isDdMissStatus,
  missMonthsFrom,
  missRowsFromGcPayments,
  summariseDdMisses,
  uniqueMonths,
} from "./dd-misses";
import { paymentsForAgreement } from "./sync-payments";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(DD_MISS_FROM === "2026-09-01", "tracking starts September 2026");
assert(isDdMissStatus("failed") === true, "failed is a miss");
assert(isDdMissStatus("charged_back") === true, "chargeback is a miss");
assert(isDdMissStatus("cancelled") === false, "cancelled is not a customer miss");
assert(isDdMissStatus("paid_out") === false, "paid out is not a miss");

const rows = missRowsFromGcPayments("agr-1", [
  { id: "PM_AUG", charge_date: "2026-08-20", status: "failed", amount: 64000 },
  { id: "PM_SEP_FAIL", charge_date: "2026-09-08", status: "failed", amount: 64000 },
  { id: "PM_SEP_RETRY", charge_date: "2026-09-12", status: "paid_out", amount: 64000 },
  { id: "PM_SEP_CB", charge_date: "2026-09-15", status: "charged_back", amount: 64000 },
  { id: "PM_CANCEL", charge_date: "2026-09-18", status: "cancelled", amount: 64000 },
]);
assert(rows.length === 2, `September failures only, got ${rows.length}`);
assert(
  rows.every((row) => row.charge_date >= "2026-09-01"),
  "drops pre-September failures even if a retry later paid"
);
assert(rows[0].amount === 640, "stores pounds not pence");
assert(rows[0].month === "2026-09-01", "month is first of the charge month");

assert(
  uniqueMonths(rows).join() === "2026-09",
  "one visual month even if they failed twice"
);

const months = missMonthsFrom("2026-09-01", "2026-11-12");
assert(months.join() === "2026-09,2026-10,2026-11", "visual months from September through now");

const matched = missRowsFromGcPayments(
  "id-hp21",
  paymentsForAgreement(
    [
      {
        id: "PM_HP21",
        description: "HP21/12",
        charge_date: "2026-09-06",
        status: "failed",
        amount: 145600,
        links: { mandate: "MD_OTHER" },
      },
      {
        id: "PM_OLD",
        description: "HP21/11",
        charge_date: "2026-08-06",
        status: "failed",
        amount: 145600,
        links: { mandate: "MD_OTHER" },
      },
    ],
    {
      id: "id-hp21",
      agreement_number: "HP21",
      gocardless_mandate_id: "MD_HP21",
      monthly_instalment: 1456,
    }
  )
);
assert(matched.length === 1 && matched[0].agreement_id === "id-hp21", "matches failed DD by HP ref");

const summarised = summariseDdMisses(
  [
    { agreement_id: "a", charge_date: "2026-09-08", amount: 640, month: "2026-09-01" },
    { agreement_id: "a", charge_date: "2026-10-08", amount: 640, month: "2026-10-01" },
    { agreement_id: "b", charge_date: "2026-09-10", amount: 900, month: "2026-09-01" },
  ],
  new Map([
    ["a", { agreement_number: "HP10", company_name: "Regular Miss Ltd" }],
    ["b", { agreement_number: "HP11", company_name: "Once Ltd" }],
  ])
);
assert(summarised[0].agreement_number === "HP10", "regular missers sort first");
assert(summarised[0].months.join() === "2026-09,2026-10", "keeps every missed month on the agreement");
assert(summarised[1].months.length === 1, "one-off miss stays a single month");

console.log("dd-misses tests ok");
