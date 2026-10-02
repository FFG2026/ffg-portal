import {
  MONTHLY_FIGURES,
  LATEST_MONTH_KEY,
  monthLabel,
  monthlyFiguresAt,
  neighbouringMonth,
} from "./monthly-figures";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(MONTHLY_FIGURES.length === 14, "14 month rows, Sep 2025 through Oct 2026 MTD");
assert(LATEST_MONTH_KEY === "2026-10", "latest month is Oct 2026");
assert(monthlyFiguresAt("2026-07").amount_lent === 160820, "Jul 2026 lent");
assert(monthlyFiguresAt("2025-10").new_deals === 0, "Oct 2025 had no new deals");
// September closed at the payout total GoCardless reconciled to; the 51,503.12
// that used to sit here was the month captured part-way through.
assert(
  monthlyFiguresAt("2026-09").payments_received === 79210.75,
  "Sep 2026 collections, closed"
);
assert(monthlyFiguresAt("2026-10").payments_received === 2990.68, "Oct 2026 so far");
assert(monthLabel(monthlyFiguresAt("2026-10")) === "Oct 2026*", "MTD asterisk");
assert(monthLabel(monthlyFiguresAt("2026-09")) === "Sep 2026", "closed months have no asterisk");
assert(neighbouringMonth("2026-10", 1) === null, "cannot step past Oct 2026");
assert(neighbouringMonth("2025-09", -1) === null, "cannot step before Sep 2025");
assert(neighbouringMonth("2026-10", -1)?.key === "2026-09", "prev from Oct is Sep");

const yearPayments = MONTHLY_FIGURES.reduce((s, r) => s + r.payments_received, 0);
assert(Math.round(yearPayments * 100) / 100 === 1192693.37, "payments received across the series");

console.log("monthly-figures tests ok");
