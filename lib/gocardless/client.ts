export const GC_API_BASE = "https://api.gocardless.com";
export const GC_VERSION = "2015-07-06";

export function gcHeaders() {
  return {
    Authorization: `Bearer ${process.env.GOCARDLESS_ACCESS_TOKEN}`,
    "GoCardless-Version": GC_VERSION,
    Accept: "application/json",
  };
}

export async function fetchGoCardlessPages(path: string, key: string) {
  const items: any[] = [];
  let after: string | undefined;

  while (true) {
    const url = new URL(`${GC_API_BASE}${path}`);
    if (!url.searchParams.has("limit")) {
      url.searchParams.set("limit", "500");
    }
    if (after) url.searchParams.set("after", after);

    const res = await fetch(url.toString(), {
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
