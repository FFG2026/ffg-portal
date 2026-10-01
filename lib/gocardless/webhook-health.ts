/**
 * Whether GoCardless webhooks are actually arriving.
 *
 * A webhook that stops being delivered is silent by nature: payments simply
 * stop ticking and agreements drift into looking overdue. This turns that
 * silence into something the dashboard can say out loud.
 */
export type WebhookHealth = {
  state: "never" | "stale" | "ok";
  last_event_at: string | null;
  days_since: number | null;
  message: string;
};

/** Beyond this, a quiet webhook is a broken webhook rather than a quiet week. */
export const WEBHOOK_STALE_DAYS = 7;

export function webhookHealth(
  lastEventAt: string | null | undefined,
  now: string = new Date().toISOString()
): WebhookHealth {
  const last = String(lastEventAt || "").trim();
  if (!last) {
    return {
      state: "never",
      last_event_at: null,
      days_since: null,
      message:
        "No GoCardless webhook has ever been received. Payments only update " +
        "when someone opens a page, so agreements can look overdue after they " +
        "have paid. Check the endpoint and secret in GoCardless.",
    };
  }

  const then = Date.parse(last);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(then) || !Number.isFinite(nowMs)) {
    return {
      state: "never",
      last_event_at: null,
      days_since: null,
      message: "Could not read when the last GoCardless webhook arrived.",
    };
  }

  const days = Math.floor((nowMs - then) / 86_400_000);
  if (days >= WEBHOOK_STALE_DAYS) {
    return {
      state: "stale",
      last_event_at: last,
      days_since: days,
      message:
        `No GoCardless webhook for ${days} days. Payments may not be ticking ` +
        `on their own — check the endpoint and secret in GoCardless.`,
    };
  }

  return {
    state: "ok",
    last_event_at: last,
    days_since: days,
    message:
      days === 0
        ? "GoCardless webhooks arriving today."
        : `Last GoCardless webhook ${days} day${days === 1 ? "" : "s"} ago.`,
  };
}
