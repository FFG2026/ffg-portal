import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { fetchAllRows } from "../../../../lib/supabase/fetch-all";
import { authorizeAdminRequest } from "../../../../lib/admin";
import { isLiveDeal, paidCount, unpaidSum, overdueSum } from "../../../../lib/deal-status";
import { compareAgreementNumber } from "../../../../lib/gocardless/parse-ref";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "live";
  const q = searchParams.get("q")?.trim().toLowerCase() || "";

  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  let agreements;
  let customers;
  let payments;
  try {
    [agreements, customers, payments] = await Promise.all([
      fetchAllRows(() =>
        supabase
          .from("agreements")
          .select(
            "id, agreement_number, agreement_type, customer_id, asset_description, monthly_instalment, term_months, start_date, gocardless_mandate_id, total_lend, status"
          )
          .order("agreement_number")
      ),
      fetchAllRows(() =>
        supabase.from("customers").select("id, company_name, email")
      ),
      fetchAllRows(() =>
        supabase
          .from("payments")
          .select("agreement_id, amount, status, due_date, paid_date")
      ),
    ]);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Could not load agreements" },
      { status: 500 }
    );
  }

  const nameById = new Map(
    (customers || []).map((c) => [
      c.id,
      { company_name: c.company_name, email: c.email },
    ])
  );

  const rowsByAgreement = new Map<string, typeof payments>();
  for (const p of payments || []) {
    const list = rowsByAgreement.get(p.agreement_id) || [];
    list.push(p);
    rowsByAgreement.set(p.agreement_id, list);
  }

  const list = (agreements || []).map((a) => {
    const rows = rowsByAgreement.get(a.id) || [];
    const live = isLiveDeal(a, rows);
    const outstanding = live ? unpaidSum(rows) : 0;
    const overdue = live ? overdueSum(rows, today) : 0;
    const customer = nameById.get(a.customer_id);
    return {
      id: a.id,
      agreement_number: a.agreement_number,
      agreement_type: a.agreement_type,
      company_name: customer?.company_name || "(unknown)",
      email: customer?.email || null,
      asset_description: a.asset_description,
      monthly_instalment: Number(a.monthly_instalment || 0),
      total_lend: Number(a.total_lend || 0),
      start_date: a.start_date,
      term_months: a.term_months,
      paid_count: paidCount(rows),
      live,
      outstanding: Math.round(outstanding * 100) / 100,
      overdue: Math.round(overdue * 100) / 100,
      has_mandate: !!a.gocardless_mandate_id,
      has_schedule: rows.length > 0,
    };
  });

  const filtered = list.filter((a) => {
    if (status === "live" && !a.live) return false;
    if (status === "past" && a.live) return false;
    if (!q) return true;
    return (
      a.agreement_number.toLowerCase().includes(q) ||
      a.company_name.toLowerCase().includes(q) ||
      (a.asset_description || "").toLowerCase().includes(q)
    );
  });

  filtered.sort((a, b) =>
    compareAgreementNumber(a.agreement_number, b.agreement_number)
  );

  return NextResponse.json(
    {
    counts: {
      live: list.filter((a) => a.live).length,
      past: list.filter((a) => !a.live).length,
      all: list.length,
    },
    agreements: filtered,
    },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
  );
}
