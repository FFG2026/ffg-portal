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

  const [gcCustomers, gcMandatesActive, gcMandatesCancelled, gcMandatesExpired] =
    await Promise.all([
      fetchAllPages("/customers", "customers"),
      fetchAllPages("/mandates", "mandates"),
      fetchAllPages("/mandates?status=cancelled", "mandates"),
      fetchAllPages("/mandates?status=expired", "mandates"),
    ]);
  const gcMandatesById = new Map<string, any>();
  for (const mandate of [
    ...gcMandatesActive,
    ...gcMandatesCancelled,
    ...gcMandatesExpired,
  ]) {
    gcMandatesById.set(mandate.id, mandate);
  }
  const gcMandates = Array.from(gcMandatesById.values());

  // Map: GC customer id -> mandate id. Prefer an active mandate, but keep
  // a cancelled/expired one so we can still pull the collections already made.
  // activeCount is what decides whether the choice is safe: a customer with
  // two live mandates must never be guessed between.
  const customerToMandate = new Map<
    string,
    { id: string; status: string; activeCount: number }
  >();
  for (const mandate of gcMandates) {
    const customerId = mandate.links?.customer;
    if (!customerId) continue;
    const existing = customerToMandate.get(customerId);
    const active = mandate.status === "active";
    const activeCount = (existing?.activeCount || 0) + (active ? 1 : 0);
    if (!existing || active) {
      customerToMandate.set(customerId, {
        id: mandate.id,
        status: mandate.status,
        activeCount,
      });
    } else {
      existing.activeCount = activeCount;
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

    const mandate = customerToMandate.get(gcCustomer.id);
    if (!mandate) continue;

    const normalized = normalizeName(gcName);
    const ourMatch = ourByNormalized.get(normalized);

    if (ourMatch) {
      matched.push({
        our_customer_id: ourMatch.id,
        our_company_name: ourMatch.company_name,
        gc_customer_name: gcName,
        gc_mandate_id: mandate.id,
        gc_mandate_status: mandate.status,
        gc_active_mandates: mandate.activeCount,
        gc_email: gcCustomer.email || null,
      });
    } else {
      unmatchedGc.push({
        gc_customer_name: gcName,
        gc_mandate_id: mandate.id,
        gc_mandate_status: mandate.status,
      });
    }
  }

  // 3.5 List each of our customers' agreements. A customer with several
  // agreements is not itself a problem — they collect them all on the one
  // mandate — so the agreements are here to report, not to veto the write.
  // Glacier Gem is collected by hand, so its agreements are left out of this
  // entirely: a GG deal must never acquire a mandate off its customer's FFG
  // ones and start pulling GoCardless collections onto its schedule.
  const { data: agreementRows, error: agreementsErr } = await supabase
    .from("agreements")
    .select("id, customer_id, agreement_number, gocardless_mandate_id, book")
    .neq("book", "gg");

  if (agreementsErr) {
    return NextResponse.json({ error: agreementsErr.message }, { status: 500 });
  }

  const agreementsByCustomer = new Map<string, any[]>();
  for (const a of agreementRows || []) {
    const list = agreementsByCustomer.get(a.customer_id) || [];
    list.push(a);
    agreementsByCustomer.set(a.customer_id, list);
  }

  // Split matches: safe to auto-apply vs needs a person. What makes a mandate
  // unsafe to assume is a choice between two of them — two GoCardless
  // customer records matching the same name, or one record holding two live
  // mandates. A customer with several agreements is not ambiguous: Rochester
  // runs HP125, HP128 and HP143 off a single mandate, and leaving the newest
  // blank is what stopped its collections ticking.
  const matchCountByCustomer = new Map<string, number>();
  for (const m of matched) {
    matchCountByCustomer.set(
      m.our_customer_id,
      (matchCountByCustomer.get(m.our_customer_id) || 0) + 1
    );
  }

  const safeMatches: any[] = [];
  const needsReview: any[] = [];

  for (const m of matched) {
    const agreementCount = (agreementsByCustomer.get(m.our_customer_id) || []).length;
    const mandateMatchCount = matchCountByCustomer.get(m.our_customer_id) || 0;

    const unset = (agreementsByCustomer.get(m.our_customer_id) || []).filter(
      (a) => !a.gocardless_mandate_id
    );

    if (mandateMatchCount === 1 && (m.gc_active_mandates || 0) <= 1) {
      safeMatches.push({
        ...m,
        agreement_count: agreementCount,
        agreements_without_a_mandate: unset.map((a) => a.agreement_number),
      });
    } else {
      needsReview.push({
        ...m,
        agreement_count: agreementCount,
        agreement_numbers: (agreementsByCustomer.get(m.our_customer_id) || []).map(
          (a) => a.agreement_number
        ),
        reason:
          mandateMatchCount > 1
            ? "multiple GoCardless customers matched this name — needs manual mapping"
            : "this GoCardless customer holds more than one active mandate — needs manual mapping",
      });
    }
  }

  // 4. If applying: write emails for every matched customer (email
  // isn't agreement-specific, so this is safe even for customers
  // with multiple agreements/mandates), then write mandate ids only
  // for the safe, unambiguous matches — and only onto agreements that
  // have none, so a mandate set by hand is never overwritten.
  let writeResults: any[] = [];
  let emailWriteResults: any[] = [];

  if (apply) {
    const emailByCustomer = new Map<string, string>();
    for (const m of matched) {
      if (m.gc_email && !emailByCustomer.has(m.our_customer_id)) {
        emailByCustomer.set(m.our_customer_id, m.gc_email);
      }
    }

    for (const [customerId, email] of Array.from(emailByCustomer.entries())) {
      const { error: emailErr } = await supabase
        .from("customers")
        .update({ email })
        .eq("id", customerId)
        .is("email", null); // never overwrite an email that's already set

      emailWriteResults.push({ customer_id: customerId, email, error: emailErr?.message || null });
    }

    for (const m of safeMatches) {
      const { data: updated, error: updateErr } = await supabase
        .from("agreements")
        .update({ gocardless_mandate_id: m.gc_mandate_id })
        .eq("customer_id", m.our_customer_id)
        .is("gocardless_mandate_id", null)
        .neq("book", "gg")
        .select("agreement_number");

      writeResults.push({
        company: m.our_company_name,
        agreements_updated: updated?.map((a) => a.agreement_number) || [],
        error: updateErr?.message || null,
      });
    }
  }

  return NextResponse.json({
    mode: apply ? "APPLIED (safe matches only)" : "DRY RUN — nothing written, add &apply=true to write",
    summary: {
      gocardless_customers_with_mandate: customerToMandate.size,
      our_customers_total: ourCustomers?.length || 0,
      matched_total: matched.length,
      safe_to_apply: safeMatches.length,
      needs_manual_review: needsReview.length,
      unmatched_gocardless_customers: unmatchedGc.length,
    },
    safe_matches: safeMatches,
    needs_manual_review: needsReview,
    unmatched_gocardless_customers: unmatchedGc,
    write_results: apply ? writeResults : undefined,
    email_write_results: apply ? emailWriteResults : undefined,
  });
}
