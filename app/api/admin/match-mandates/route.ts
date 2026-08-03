import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

export const dynamic = "force-dynamic";

const GC_API_BASE = "https://api.gocardless.com";
const GC_VERSION = "2015-07-06";

function gcHeaders() {
  return {
    Authorization: `Bearer ${process.env.GOCARDLESS_ACCESS_TOKEN}`,
    "GoCardless-Version": GC_VERSION,
    Accept: "application/json",
  };
}

// Pulls every page of a GoCardless list endpoint
async function fetchAllPages(path: string, key: string) {
  let items: any[] = [];
  let after: string | undefined = undefined;

  while (true) {
    const url = new URL(`${GC_API_BASE}${path}`);
    url.searchParams.set("limit", "500");
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
    items = items.concat(data[key]);

    if (data.meta?.cursors?.after) {
      after = data.meta.cursors.after;
    } else {
      break;
    }
  }

  return items;
}

function normalizeName(name: string) {
  return name
    .toLowerCase()
    .replace(/\bltd\b\.?/g, "")
    .replace(/\blimited\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const apply = searchParams.get("apply") === "true";

  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // 1. Pull GoCardless customers and active mandates
  const [gcCustomers, gcMandates] = await Promise.all([
    fetchAllPages("/customers", "customers"),
    fetchAllPages("/mandates", "mandates"),
  ]);

  // Map: GC customer id -> active mandate id (prefer 'active' status)
  const customerToMandate = new Map<string, string>();
  for (const mandate of gcMandates) {
    const customerId = mandate.links?.customer;
    if (!customerId) continue;
    const existing = customerToMandate.get(customerId);
    if (!existing || mandate.status === "active") {
      customerToMandate.set(customerId, mandate.id);
    }
  }

  // 2. Pull our Supabase customers
  const { data: ourCustomers, error } = await supabase
    .from("customers")
    .select("id, company_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ourByNormalized = new Map<string, { id: string; company_name: string }>();
  for (const c of ourCustomers || []) {
    ourByNormalized.set(normalizeName(c.company_name), c);
  }

  // 3. Match
  const matched: any[] = [];
  const unmatchedGc: any[] = [];

  for (const gcCustomer of gcCustomers) {
    const gcName =
      gcCustomer.company_name ||
      `${gcCustomer.given_name || ""} ${gcCustomer.family_name || ""}`.trim();
    if (!gcName) continue;

    const mandateId = customerToMandate.get(gcCustomer.id);
    if (!mandateId) continue; // no active mandate, nothing to link

    const normalized = normalizeName(gcName);
    const ourMatch = ourByNormalized.get(normalized);

    if (ourMatch) {
      matched.push({
        our_customer_id: ourMatch.id,
        our_company_name: ourMatch.company_name,
        gc_customer_name: gcName,
        gc_mandate_id: mandateId,
      });
    } else {
      unmatchedGc.push({ gc_customer_name: gcName, gc_mandate_id: mandateId });
    }
  }

  // 4. If applying, write the mandate id to every agreement for each matched customer
  let writeResults: any[] = [];
  if (apply) {
    for (const m of matched) {
      const { data: updated, error: updateErr } = await supabase
        .from("agreements")
        .update({ gocardless_mandate_id: m.gc_mandate_id })
        .eq("customer_id", m.our_customer_id)
        .select("agreement_number");

      writeResults.push({
        company: m.our_company_name,
        agreements_updated: updated?.map((a) => a.agreement_number) || [],
        error: updateErr?.message || null,
      });
    }
  }

  return NextResponse.json({
    mode: apply ? "APPLIED" : "DRY RUN — nothing written, add &apply=true to write",
    summary: {
      gocardless_customers_with_active_mandate: customerToMandate.size,
      our_customers_total: ourCustomers?.length || 0,
      matched: matched.length,
      unmatched_gocardless_customers: unmatchedGc.length,
    },
    matched,
    unmatched_gocardless_customers: unmatchedGc,
    write_results: apply ? writeResults : undefined,
  });
}
