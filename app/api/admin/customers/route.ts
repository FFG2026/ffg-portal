import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { fetchAllRows } from "../../../../lib/supabase/fetch-all";
import { bookFromRequest } from "../../../../lib/admin-book";
import { authorizeAdminRequest } from "../../../../lib/admin";
import { isLiveDeal } from "../../../../lib/deal-status";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const book = bookFromRequest(request);
  const q = new URL(request.url).searchParams.get("q")?.trim() || "";
  const supabase = createAdminClient();

  let customerQuery = supabase
    .from("customers")
    .select("id, company_name, contact_name, email, phone, auth_user_id, created_at")
    .order("company_name");

  if (q) {
    customerQuery = customerQuery.or(
      `company_name.ilike.%${q}%,email.ilike.%${q}%,contact_name.ilike.%${q}%`
    );
  }

  const { data: customers, error } = await customerQuery;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const [agreements, payments] = await Promise.all([
    fetchAllRows(() =>
      supabase
        .from("agreements")
        .select("id, customer_id, agreement_number, monthly_instalment, term_months, status")
        .eq("book", book)
    ),
    fetchAllRows(() =>
      supabase.from("payments").select("agreement_id, status")
    ),
  ]);

  const paidRowsByAgreement = new Map<string, { status: string }[]>();
  for (const p of payments || []) {
    const list = paidRowsByAgreement.get(p.agreement_id) || [];
    list.push(p);
    paidRowsByAgreement.set(p.agreement_id, list);
  }

  const list = (customers || [])
    .map((c) => {
    const ags = (agreements || []).filter((a) => a.customer_id === c.id);
    const live = ags.filter((a) =>
      isLiveDeal(a, paidRowsByAgreement.get(a.id) || [])
    ).length;
    return {
      id: c.id,
      company_name: c.company_name,
      contact_name: c.contact_name,
      email: c.email,
      phone: c.phone,
      has_portal_login: !!c.auth_user_id,
      agreement_count: ags.length,
      live_count: live,
      agreements: ags.map((a) => a.agreement_number).sort(),
    };
  })
    .filter((c) => c.agreement_count > 0);

  return NextResponse.json({ customers: list });
}
