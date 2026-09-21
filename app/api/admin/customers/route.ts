import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { getAdminSecret, isAuthorizedAdmin } from "../../../../lib/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = getAdminSecret(request);
  if (!isAuthorizedAdmin(secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const { data: agreements } = await supabase
    .from("agreements")
    .select("id, customer_id, agreement_number, monthly_instalment, term_months");

  const { data: payments } = await supabase
    .from("payments")
    .select("agreement_id, status");

  const paidByAgreement = new Map<string, number>();
  for (const p of payments || []) {
    if (p.status === "paid") {
      paidByAgreement.set(
        p.agreement_id,
        (paidByAgreement.get(p.agreement_id) || 0) + 1
      );
    }
  }

  const list = (customers || []).map((c) => {
    const ags = (agreements || []).filter((a) => a.customer_id === c.id);
    const live = ags.filter(
      (a) => (paidByAgreement.get(a.id) || 0) < (a.term_months || 0)
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
  });

  return NextResponse.json({ customers: list });
}
