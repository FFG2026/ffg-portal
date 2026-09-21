import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { fetchAllRows } from "../../../../lib/supabase/fetch-all";
import { authorizeAdminRequest } from "../../../../lib/admin";
import { syncAgreementPayments, syncAgreementsPayments } from "../../../../lib/gocardless/sync-payments";
import { sortByDueDate, withRemainingBalance } from "../../../../lib/part-settlement";
import { isLiveDeal, paidCount, unpaidSum } from "../../../../lib/deal-status";
import { startDateFromFirstPayment } from "../../../../lib/schedule";
import { bookFromRequest } from "../../../../lib/admin-book";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agreementNumber = searchParams.get("agreement");
  const company = searchParams.get("company");

  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const noStore = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  };

  const book = bookFromRequest(request);
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
      .eq("book", book)
      .in(
        "customer_id",
        customers.map((c) => c.id)
      )
      .order("agreement_number");

    if (book === "ffg") {
      try {
        await syncAgreementsPayments(supabase, allAgreements || []);
      } catch {
        // Lookup still works from the schedule we already hold.
      }
    }

    const agreementIds = (allAgreements || []).map((a) => a.id);
    const allPayments =
      agreementIds.length === 0
        ? []
        : await fetchAllRows(() =>
            supabase
              .from("payments")
              .select("agreement_id, amount, status")
              .in("agreement_id", agreementIds)
          );

    const results = customers.map((c) => ({
      company_name: c.company_name,
      email: c.email,
      has_portal_login: !!c.auth_user_id,
      agreements: (allAgreements || [])
        .filter((a) => a.customer_id === c.id)
        .map((a) => {
          const rows = allPayments.filter((p) => p.agreement_id === a.id);
          return {
            agreement_number: a.agreement_number,
            agreement_type: a.agreement_type,
            asset_description: a.asset_description,
            monthly_instalment: a.monthly_instalment,
            paid_count: paidCount(rows),
            term_months: a.term_months,
            live: isLiveDeal(a, rows),
            settlement_figure: unpaidSum(rows),
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
    .eq("book", book)
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

  if (book === "ffg") {
    try {
      await syncAgreementPayments(supabase, agreement);
    } catch {
      // Fall through and show stored schedule.
    }
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", agreement.customer_id)
    .maybeSingle();

  const payments = await fetchAllRows(() =>
    supabase.from("payments").select("*").eq("agreement_id", agreement.id)
  );

  const schedule = sortByDueDate(payments || []);
  const paidPayments = schedule.filter((p) => p.status === "paid");
  const lastPaid = [...paidPayments].sort((a, b) =>
    String(a.paid_date || a.due_date).localeCompare(
      String(b.paid_date || b.due_date)
    )
  ).pop();

  const scheduleWithBalance = withRemainingBalance(schedule);

  return NextResponse.json(
    {
      agreement: {
        agreement_number: agreement.agreement_number,
        agreement_type: agreement.agreement_type,
        asset_description: agreement.asset_description,
        monthly_instalment: agreement.monthly_instalment,
        start_date: startDateFromFirstPayment(schedule, agreement.start_date),
        term_months: agreement.term_months,
        total_lend: agreement.total_lend,
        purchase_price: agreement.purchase_price,
        customer_deposit: agreement.customer_deposit,
        commission: agreement.commission,
        documentation_fee: agreement.documentation_fee,
        gocardless_mandate_id: agreement.gocardless_mandate_id,
        status: agreement.status,
      },
      customer: customer
        ? {
            company_name: customer.company_name,
            contact_name: customer.contact_name || null,
            email: customer.email,
            phone: customer.phone || null,
            has_portal_login: !!customer.auth_user_id,
          }
        : null,
      status: {
        paid_count: paidCount(schedule),
        term_months: agreement.term_months,
        live: isLiveDeal(agreement, schedule),
        settlement_figure: unpaidSum(schedule),
        last_payment_date: lastPaid
          ? lastPaid.paid_date || lastPaid.due_date
          : null,
      },
      schedule: scheduleWithBalance.map((p) => ({
        instalment_number: p.instalment_number,
        due_date: p.due_date,
        amount: p.amount,
        status: p.status,
        paid_date: p.paid_date,
        balance_after: p.balance_after,
        notes: p.notes || null,
        source: p.source || null,
      })),
    },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
  );
}
