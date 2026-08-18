import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const agreementNumber = searchParams.get("agreement");

  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!agreementNumber) {
    return NextResponse.json(
      { error: "Missing ?agreement= parameter" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { data: agreement, error: agrErr } = await supabase
    .from("agreements")
    .select("*")
    .ilike("agreement_number", agreementNumber.trim())
    .maybeSingle();

  if (agrErr) {
    return NextResponse.json({ error: agrErr.message }, { status: 500 });
  }
  if (!agreement) {
    return NextResponse.json(
      { error: `No agreement found matching "${agreementNumber}"` },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", agreement.customer_id)
    .maybeSingle();

  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .eq("agreement_id", agreement.id)
    .order("instalment_number", { ascending: true });

  const schedule = payments || [];
  const paidPayments = schedule.filter((p) => p.status === "paid");
  const paidCount = paidPayments.length;
  const lastPaid = paidPayments[paidPayments.length - 1];

  const settlementFigure = lastPaid
    ? Number(lastPaid.balance_after)
    : Number(agreement.total_lend);

  return NextResponse.json(
    {
      agreement: {
        agreement_number: agreement.agreement_number,
        agreement_type: agreement.agreement_type,
        asset_description: agreement.asset_description,
        monthly_instalment: agreement.monthly_instalment,
        start_date: agreement.start_date,
        term_months: agreement.term_months,
        total_lend: agreement.total_lend,
        gocardless_mandate_id: agreement.gocardless_mandate_id,
      },
      customer: customer
        ? {
            company_name: customer.company_name,
            email: customer.email,
            has_portal_login: !!customer.auth_user_id,
          }
        : null,
      status: {
        paid_count: paidCount,
        term_months: agreement.term_months,
        live: paidCount < agreement.term_months,
        settlement_figure: settlementFigure,
        last_payment_date: lastPaid ? lastPaid.due_date : null,
      },
      schedule: schedule.map((p) => ({
        instalment_number: p.instalment_number,
        due_date: p.due_date,
        amount: p.amount,
        status: p.status,
        paid_date: p.paid_date,
        balance_after: p.balance_after,
      })),
    },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
  );
}
