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

assert(MONTHLY_FIGURES.length === 13, "13 month rows including Sep 2026 MTD");
assert(LATEST_MONTH_KEY === "2026-09", "latest month is Sep 2026");
assert(monthlyFiguresAt("2026-07").amount_lent === 160820, "Jul 2026 lent");
assert(monthlyFiguresAt("2025-10").new_deals === 0, "Oct 2025 had no new deals");
assert(monthlyFiguresAt("2026-09").payments_received === 51503.12, "Sep MTD collections");
assert(monthLabel(monthlyFiguresAt("2026-09")) === "Sep 2026*", "MTD asterisk");
assert(monthLabel(monthlyFiguresAt("2026-08")) === "Aug 2026", "closed months have no asterisk");
assert(neighbouringMonth("2026-09", 1) === null, "cannot step past Sep 2026");
assert(neighbouringMonth("2025-09", -1) === null, "cannot step before Sep 2025");
assert(neighbouringMonth("2026-09", -1)?.key === "2026-08", "prev from Sep is Aug");

const yearPayments = MONTHLY_FIGURES.reduce((s, r) => s + r.payments_received, 0);
assert(Math.round(yearPayments * 100) / 100 === 1161995.06, "payments received across the series");

console.log("monthly-figures tests ok");
