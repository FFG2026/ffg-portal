import { webhookHealth, WEBHOOK_STALE_DAYS } from "./webhook-health";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const now = "2026-10-01T12:00:00.000Z";

// The state this book has been in: silent since forever.
const never = webhookHealth(null, now);
assert(never.state === "never", "no events ever");
assert(never.days_since === null, "no age to report");
assert(/has ever been received/i.test(never.message), "says plainly that none have arrived");
assert(webhookHealth("", now).state === "never", "empty string counts as never");
assert(webhookHealth("   ", now).state === "never", "blank counts as never");
assert(webhookHealth("not a date", now).state === "never", "unparseable counts as never");

const today = webhookHealth("2026-10-01T06:00:00.000Z", now);
assert(today.state === "ok", "an event this morning is healthy");
assert(today.days_since === 0, "zero days");
assert(/today/i.test(today.message), "says today");

const yesterday = webhookHealth("2026-09-30T06:00:00.000Z", now);
assert(yesterday.state === "ok" && yesterday.days_since === 1, "one day ago is fine");
assert(/1 day ago/.test(yesterday.message), "singular day");

const sixDays = webhookHealth("2026-09-25T12:00:00.000Z", now);
assert(sixDays.state === "ok" && sixDays.days_since === 6, "six days is still a quiet week");
assert(/6 days ago/.test(sixDays.message), "plural days");

// A monthly book can be quiet for days; a week of silence is a fault.
const sevenDays = webhookHealth("2026-09-24T12:00:00.000Z", now);
assert(sevenDays.state === "stale", `${WEBHOOK_STALE_DAYS} days is stale`);
assert(sevenDays.days_since === 7, "seven days");
assert(/7 days/.test(sevenDays.message), "names the gap");

const longGone = webhookHealth("2026-07-01T12:00:00.000Z", now);
assert(longGone.state === "stale" && longGone.days_since === 92, "months of silence is stale");

assert(
  webhookHealth("2026-10-01T06:00:00.000Z", now).last_event_at ===
    "2026-10-01T06:00:00.000Z",
  "carries the timestamp through for display"
);

console.log("webhook-health tests ok");
