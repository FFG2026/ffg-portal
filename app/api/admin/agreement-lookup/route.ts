import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const agreementNumber = searchParams.get("agreement");
  const company = searchParams.get("company");

  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const noStore = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  };

  const supabase = createAdminClient();

  // --- Company search: returns every agreement for matching customers ---
  if (company) {
    const { data: customers, error: custErr } = await supabase
      .from("customers")
      .select("id, company_name, email, auth_user_id")
      .ilike("company_name", `%${company.trim()}%`)
      .order("company_name");

    if (custErr) {
      return NextResponse.json({ error: custErr.message }, { status: 500 });
    }
    if (!customers || customers.length === 0) {
      return NextResponse.json(
        { error: `No customer found matching "${company}"` },
        { status: 404, headers: noStore }
      );
    }

    const { data: allAgreements } = await supabase
      .from("agreements")
      .select("*")
      .in(
        "customer_id",
        customers.map((c) => c.id)
      )
      .order("agreement_number");

    const { data: allPayments } = await supabase
      .from("payments")
      .select("agreement_id, amount, status")
      .in(
        "agreement_id",
        (allAgreements || []).map((a) => a.id)
      );

    const results = customers.map((c) => ({
      company_name: c.company_name,
      email: c.email,
      has_portal_login: !!c.auth_user_id,
      agreements: (allAgreements || [])
        .filter((a) => a.customer_id === c.id)
        .map((a) => {
          const rows = (allPayments || []).filter(
            (p) => p.agreement_id === a.id
          );
          const paidCount = rows.filter((p) => p.status === "paid").length;
          const settlement = rows
            .filter((p) => p.status !== "paid")
            .reduce((sum, p) => sum + Number(p.amount), 0);
          return {
            agreement_number: a.agreement_number,
            agreement_type: a.agreement_type,
            asset_description: a.asset_description,
            monthly_instalment: a.monthly_instalment,
            paid_count: paidCount,
            term_months: a.term_months,
            live: paidCount < a.term_months,
            settlement_figure: settlement,
            has_schedule: rows.length > 0,
            gocardless_mandate_id: a.gocardless_mandate_id,
          };
        }),
    }));

    return NextResponse.json(
      { mode: "company", customers: results },
      { headers: noStore }
    );
  }

  if (!agreementNumber) {
    return NextResponse.json(
      { error: "Provide ?agreement= or ?company=" },
      { status: 400 }
    );
  }

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

  // Settlement figure = the total of all instalments not yet paid,
  // matching FFG's settlement basis (remaining scheduled payments,
  // no early settlement rebate). Correct from day one, before any
  // payment has been collected.
  const settlementFigure = schedule
    .filter((p) => p.status !== "paid")
    .reduce((sum, p) => sum + Number(p.amount), 0);

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
