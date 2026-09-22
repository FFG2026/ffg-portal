import {
  arrearsTotal,
  buildFiguresDashboard,
  buildForecast,
  monthCollection,
  nextReceipts,
  type DashboardDeal,
} from "./figures-dashboard";
import type { MonthlyFiguresRow } from "./monthly-figures";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const MONTHLY: MonthlyFiguresRow[] = [
  { key: "2026-07", label: "Jul 2026", mtd: false, payments_received: 100000, new_deals: 2, amount_lent: 40000 },
  { key: "2026-08", label: "Aug 2026", mtd: false, payments_received: 80000, new_deals: 1, amount_lent: 10000 },
  { key: "2026-09", label: "Sep 2026", mtd: true, payments_received: 90000, new_deals: 3, amount_lent: 30000 },
];

const DEALS: DashboardDeal[] = [
  {
    agreement_number: "HP140",
    company_name: "Brookside Motors",
    status: "live",
    term_months: 4,
    payments: [
      { amount: 500, status: "paid", due_date: "2026-09-05" },
      { amount: 500, status: "due", due_date: "2026-09-28" },
      { amount: 500, status: "due", due_date: "2026-10-05" },
      { amount: 500, status: "due", due_date: "2026-11-05" },
    ],
  },
  {
    agreement_number: "HP141",
    company_name: "JWL Developments",
    status: "live",
    term_months: 2,
    payments: [
      { amount: 250, status: "paid", due_date: "2026-09-10" },
      { amount: 250, status: "due", due_date: "2026-10-01" },
    ],
  },
];

// --- monthCollection -------------------------------------------------------
const sep = monthCollection(DEALS, "2026-09");
assert(sep.due === 1250, `Sep due, got ${sep.due}`);
assert(sep.collected === 750, `Sep collected, got ${sep.collected}`);
assert(sep.still_due === 500, `Sep still due, got ${sep.still_due}`);
assert(monthCollection(DEALS, "2026-12").due === 0, "empty month is zero");

// --- nextReceipts ----------------------------------------------------------
const receipts = nextReceipts(DEALS, "2026-09-22");
assert(receipts.length === 4, `four upcoming, got ${receipts.length}`);
assert(receipts[0].due_date === "2026-09-28", "soonest first");
assert(receipts[0].customer === "Brookside Motors", "carries the customer name");
assert(
  receipts.every((r) => r.due_date >= "2026-09-22"),
  "never lists a past due date"
);
assert(nextReceipts(DEALS, "2026-09-22", 2).length === 2, "honours the limit");
assert(
  nextReceipts(
    [{ agreement_number: "HP1", status: "settled", term_months: 2, payments: [] }],
    "2026-09-22"
  ).length === 0,
  "settled deals are not chased for receipts"
);

// --- arrearsTotal ----------------------------------------------------------
const lateDeal: DashboardDeal[] = [
  {
    agreement_number: "HP99",
    company_name: "Late Haulage Ltd",
    status: "live",
    term_months: 3,
    payments: [
      { amount: 400, status: "due", due_date: "2026-06-05" },
      { amount: 400, status: "due", due_date: "2026-07-05" },
      { amount: 400, status: "due", due_date: "2026-11-05" },
    ],
  },
];
assert(arrearsTotal(lateDeal, "2026-09-22") === 800, "two instalments a month late");
// The Vantage Vehicles arrangement keeps those agreements out of arrears.
const vantage = lateDeal.map((d) => ({ ...d, company_name: "Vantage Vehicles Ltd" }));
assert(arrearsTotal(vantage, "2026-09-22") === 0, "special arrangement is excluded");
assert(arrearsTotal(DEALS, "2026-09-22") === 0, "a deal paid this month is not in arrears");

// --- buildForecast ---------------------------------------------------------
const fc = buildForecast(1_000_000, 90_000, 20, 48, 36, "2026-09");
assert(fc.points.length === 49, `49 points including month zero, got ${fc.points.length}`);
assert(fc.points[0].value === 1_000_000, "starts at the opening book");
// 90,000 collected a month relent at 20% adds 18,000 of contracted value.
assert(fc.points[1].value === 1_018_000, `month one, got ${fc.points[1].value}`);
assert(fc.points[36].value === 1_648_000, `month 36, got ${fc.points[36].value}`);
assert(fc.growth_pct === 64.8, `growth at 36 months, got ${fc.growth_pct}`);
assert(fc.assumed_yield === 20, "reports the rate it assumed");
assert(fc.points[0].label === "Sep 26", `start label, got ${fc.points[0].label}`);
assert(buildForecast(0, 90_000, 20).growth_pct === 0, "no book, no growth claim");

// --- buildFiguresDashboard -------------------------------------------------
const dash = buildFiguresDashboard({
  deals: DEALS,
  monthly: MONTHLY,
  monthKey: "2026-09",
  today: "2026-09-22",
  totalBook: 2_000_000,
  totalLent: 5_000_000,
  cashAtBank: 200_000,
  blendedYield: 21,
  byType: [
    { type: "HP", label: "Hire Purchase (HP)", total_lent: 4_000_000 },
    { type: "FL", label: "Finance Lease (FL)", total_lent: 800_000 },
    { type: "L", label: "Loan (L)", total_lent: 200_000 },
  ],
});

assert(dash.month_label === "Sep 2026", "selected month label");
assert(dash.months.length === 3, "offers every month for the picker");
assert(dash.kpis.total_book.value === 2_000_000, "book KPI");
// Book a month ago = 2,000,000 + 90,000 collected - 30,000 lent = 2,060,000.
assert(
  dash.kpis.total_book.delta_pct === -2.9,
  `book delta, got ${dash.kpis.total_book.delta_pct}`
);
assert(
  dash.kpis.monthly_inflow.delta_pct === 12.5,
  `inflow vs 80,000 last month, got ${dash.kpis.monthly_inflow.delta_pct}`
);
assert(dash.kpis.cash_available.delta_pct === null, "no cash history, no delta");
assert(dash.kpis.arrears.delta_pct === null, "no arrears history, no delta");

assert(dash.income.length === 3, "one point per month");
assert(dash.income[0].net_cash === 60000, "net cash is collections less lending");
assert(dash.income[2].label === "Sep", "chart labels drop the year");

assert(dash.this_month.collected === 750, "this month collected from the schedule");
assert(dash.this_month.still_due === 500, "this month still due");
assert(dash.this_month.collected_pct === 60, "percentage collected");
assert(dash.this_month.new_lending === 30000, "new lending from the book");
assert(dash.this_month.new_agreements === 3, "new agreement count");

assert(dash.deployment.total === 2_200_000, "capital is book plus cash");
assert(dash.deployment.pct === 90.9, `deployed share, got ${dash.deployment.pct}`);

assert(dash.mix.total === 5_000_000, "mix totals the lent columns");
assert(dash.mix.slices[0].pct === 80, "HP share");
assert(dash.mix.slices[2].pct === 4, "Loan share");
assert(
  new Set(dash.mix.slices.map((s) => s.colour)).size === 3,
  "each slice gets its own colour"
);

assert(dash.next_receipts.length === 4, "receipts land on the dashboard");
assert(dash.forecast.assumed_yield === 21, "forecast uses the blended yield");

console.log("figures-dashboard: all assertions passed");

// --- deriveMonthlyFigures --------------------------------------------------
import { deriveMonthlyFigures } from "./figures-dashboard";

const derived = deriveMonthlyFigures(
  [
    {
      agreement_number: "GG3",
      company_name: "Ice Ltd",
      start_date: "2026-08-14",
      total_lend: 25000,
      payments: [
        { amount: 900, status: "paid", due_date: "2026-08-20", paid_date: "2026-08-21" },
        { amount: 900, status: "paid", due_date: "2026-09-20" },
        { amount: 900, status: "due", due_date: "2026-10-20" },
      ],
    },
  ],
  "2026-09",
  3
);
assert(derived.length === 3, `three months, got ${derived.length}`);
assert(derived[0].key === "2026-07" && derived[2].key === "2026-09", "window ends on the key");
assert(derived[2].mtd === true, "the last month is month-to-date");
assert(derived[1].label === "Aug 2026", `label, got ${derived[1].label}`);
assert(derived[1].amount_lent === 25000, "new lending lands on the start month");
assert(derived[1].new_deals === 1, "counts the new agreement once");
// Counted on paid_date where there is one, otherwise the due date.
assert(derived[1].payments_received === 900, "August collection");
assert(derived[2].payments_received === 900, "September collection");
assert(derived[0].payments_received === 0, "nothing landed in July");
assert(
  deriveMonthlyFigures([], "2026-01", 2).map((r) => r.key).join(",") === "2025-12,2026-01",
  "window crosses the year boundary"
);

// --- the income window follows the selected month -------------------------
const LONG: MonthlyFiguresRow[] = Array.from({ length: 14 }, (_, i) => {
  const month = (i % 12) + 1;
  const year = 2025 + Math.floor(i / 12);
  return {
    key: `${year}-${String(month).padStart(2, "0")}`,
    label: `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][month - 1]} ${year}`,
    mtd: i === 13,
    payments_received: 1000 + i,
    new_deals: 1,
    amount_lent: 500,
  };
});

function windowFor(key: string) {
  return buildFiguresDashboard({
    deals: [],
    monthly: LONG,
    monthKey: key,
    today: "2026-02-10",
    totalBook: 1000,
    totalLent: 1000,
    cashAtBank: 100,
    blendedYield: 20,
    byType: [],
  }).income;
}

const latest = windowFor("2026-02");
assert(latest.length === 12, `twelve bars, got ${latest.length}`);
assert(latest[11].key === "2026-02", "window ends on the selected month");
assert(latest[0].key === "2025-03", `window starts 11 back, got ${latest[0].key}`);

const earlier = windowFor("2025-06");
assert(earlier[earlier.length - 1].key === "2025-06", "picking a month moves the window");
assert(earlier.length === 6, `only the months that exist, got ${earlier.length}`);

// January carries its year so the two ends of a 12-month window never collide.
assert(
  latest.find((p) => p.key === "2026-01")?.label === "Jan 26",
  "January is disambiguated"
);
assert(latest.find((p) => p.key === "2025-03")?.label === "Mar", "other months stay short");

// The donut key drops the bracketed abbreviation the tables use.
const mixDash = buildFiguresDashboard({
  deals: [], monthly: LONG, monthKey: "2026-02", today: "2026-02-10",
  totalBook: 1000, totalLent: 1000, cashAtBank: 100, blendedYield: 20,
  byType: [{ type: "HP", label: "Hire Purchase (HP)", total_lent: 900 }],
});
assert(mixDash.mix.slices[0].label === "Hire Purchase", "short donut label");

console.log("figures-dashboard: monthly deriver assertions passed");
console.log("figures-dashboard: window assertions passed");
