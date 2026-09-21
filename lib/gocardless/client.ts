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

export async function fetchPaymentsForMandate(mandateId: string) {
  return fetchGoCardlessPages(
    `/payments?mandate=${encodeURIComponent(mandateId)}`,
    "payments"
  );
}

export async function fetchAllGoCardlessPayments() {
  return fetchGoCardlessPages("/payments", "payments");
}

/** Payments with a charge date in [fromInclusive, toExclusive). */
export async function fetchGoCardlessPaymentsChargedBetween(
  fromInclusive: string,
  toExclusive: string
) {
  const path = gcListPaymentsPath({
    "created_at[gte]": `${fromInclusive}T00:00:00.000Z`,
    "created_at[lt]": `${toExclusive}T00:00:00.000Z`,
    status: "paid_out",
    limit: "500",
  });
  const items = await fetchGoCardlessPages(path, "payments");
  return paymentsChargedInRange(items, fromInclusive, toExclusive, "paid_out");
}
