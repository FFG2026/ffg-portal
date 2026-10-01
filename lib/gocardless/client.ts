export const GC_API_BASE = "https://api.gocardless.com";
export const GC_VERSION = "2015-07-06";

export function gcHeaders() {
  return {
    Authorization: `Bearer ${process.env.GOCARDLESS_ACCESS_TOKEN}`,
    "GoCardless-Version": GC_VERSION,
    Accept: "application/json",
  };
}

export function gcListPaymentsPath(params: Record<string, string>) {
  const qs = Object.entries(params)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    )
    .join("&");
  return `/payments?${qs}`;
}

export function paymentsChargedInRange<
  T extends { charge_date?: string | null; status?: string | null }
>(
  payments: T[],
  fromInclusive: string,
  toExclusive: string,
  status?: string
) {
  return (payments || []).filter((p) => {
    const charge = String(p.charge_date || "").slice(0, 10);
    if (charge < fromInclusive || charge >= toExclusive) return false;
    if (status && String(p.status || "") !== status) return false;
    return true;
  });
}

export async function fetchGoCardlessPages(path: string, key: string) {
  const items: any[] = [];
  let after: string | undefined;
  const join = path.includes("?") ? "&" : "?";

  while (true) {
    const page = after
      ? `${path}${join}after=${encodeURIComponent(after)}`
      : path;
    const res = await fetch(`${GC_API_BASE}${page}`, {
      headers: gcHeaders(),
      cache: "no-store",
    });
    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(
        `GoCardless ${path} fetch failed: ${res.status} — ${errorBody}`
      );
    }
    const data = await res.json();
    items.push(...(data[key] || []));

    if (data.meta?.cursors?.after) {
      after = data.meta.cursors.after;
    } else {
      break;
    }
  }

  return items;
}

export async function fetchGoCardlessPayment(paymentId: string) {
  const res = await fetch(`${GC_API_BASE}/payments/${paymentId}`, {
    headers: gcHeaders(),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.payments;
}

/** GoCardless pages at 50 by default; 500 is its maximum. */
export const GC_PAGE_LIMIT = 500;

export async function fetchPaymentsForMandate(mandateId: string) {
  return fetchGoCardlessPages(
    `/payments?mandate=${encodeURIComponent(mandateId)}&limit=${GC_PAGE_LIMIT}`,
    "payments"
  );
}

export async function fetchAllGoCardlessPayments() {
  return fetchGoCardlessPages(`/payments?limit=${GC_PAGE_LIMIT}`, "payments");
}

function shiftDate(isoDate: string, days: number) {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function fetchGoCardlessPaymentsByStatusChargedBetween(
  fromInclusive: string,
  toExclusive: string,
  status: string
) {
  const createdFrom = shiftDate(fromInclusive, -14);
  const path = gcListPaymentsPath({
    "created_at[gte]": `${createdFrom}T00:00:00.000Z`,
    "created_at[lt]": `${toExclusive}T00:00:00.000Z`,
    status,
    limit: "500",
  });
  const items = await fetchGoCardlessPages(path, "payments");
  return paymentsChargedInRange(items, fromInclusive, toExclusive, status);
}

/**
 * Collections with a charge date in [fromInclusive, toExclusive).
 *
 * Both confirmed and paid_out. A Direct Debit taken today is confirmed and
 * does not become paid_out until the payout lands a few working days later,
 * so counting only paid_out meant the current month always read short and
 * anything collected in the last days of a month missed that month entirely.
 */
export async function fetchGoCardlessPaymentsChargedBetween(
  fromInclusive: string,
  toExclusive: string
) {
  const [paidOut, confirmed] = await Promise.all([
    fetchGoCardlessPaymentsByStatusChargedBetween(
      fromInclusive,
      toExclusive,
      "paid_out"
    ),
    fetchGoCardlessPaymentsByStatusChargedBetween(
      fromInclusive,
      toExclusive,
      "confirmed"
    ),
  ]);
  return [...paidOut, ...confirmed];
}

/** Instructed but not yet collected, in [fromInclusive, toExclusive). */
export async function fetchGoCardlessInFlightPaymentsChargedBetween(
  fromInclusive: string,
  toExclusive: string
) {
  const [pending, submitted] = await Promise.all([
    fetchGoCardlessPaymentsByStatusChargedBetween(
      fromInclusive,
      toExclusive,
      "pending_submission"
    ),
    fetchGoCardlessPaymentsByStatusChargedBetween(
      fromInclusive,
      toExclusive,
      "submitted"
    ),
  ]);
  return [...pending, ...submitted];
}

/** Failed / charged-back Direct Debits in [fromInclusive, toExclusive). */
export async function fetchGoCardlessFailedPaymentsChargedBetween(
  fromInclusive: string,
  toExclusive: string
) {
  const [failed, chargedBack] = await Promise.all([
    fetchGoCardlessPaymentsByStatusChargedBetween(
      fromInclusive,
      toExclusive,
      "failed"
    ),
    fetchGoCardlessPaymentsByStatusChargedBetween(
      fromInclusive,
      toExclusive,
      "charged_back"
    ),
  ]);
  return [...failed, ...chargedBack];
}
