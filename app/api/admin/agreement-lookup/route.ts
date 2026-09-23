import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { fetchAllIn } from "../../../../lib/supabase/fetch-all";
import { authorizeAdminRequest } from "../../../../lib/admin";
import { syncAgreementPayments, syncAgreementsPayments } from "../../../../lib/gocardless/sync-payments";
import { sortByDueDate, withRemainingBalance } from "../../../../lib/part-settlement";
import { isLiveDeal, paidCount, unpaidSum, netBookValue } from "../../../../lib/deal-status";
import { startDateFromFirstPayment, visibleScheduleNote } from "../../../../lib/schedule";
import { bookFromRequest } from "../../../../lib/admin-book";
import { compareAgreementNumber } from "../../../../lib/gocardless/parse-ref";
import { DD_MISS_FROM, uniqueMonths } from "../../../../lib/gocardless/dd-misses";

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
    const name = company.trim();
    const exact = await supabase
      .from("customers")
      .select("id, company_name, email, auth_user_id")
      .eq("company_name", name)
      .order("company_name");
    if (exact.error) {
      return NextResponse.json({ error: exact.error.message }, { status: 500 });
    }
    let customers = exact.data || [];
    if (customers.length === 0) {
      const fuzzy = await supabase
        .from("customers")
        .select("id, company_name, email, auth_user_id")
        .ilike("company_name", `%${name}%`)
        .order("company_name");
      if (fuzzy.error) {
        return NextResponse.json({ error: fuzzy.error.message }, { status: 500 });
      }
      customers = fuzzy.data || [];
    }
    if (customers.length === 0) {
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
    const allPayments = await fetchAllIn(
      (chunk) =>
        supabase
          .from("payments")
          .select("agreement_id, amount, status")
          .in("agreement_id", chunk),
      agreementIds
    );
    const missRows =
      book === "ffg"
        ? await fetchAllIn(
            (chunk) =>
              supabase
                .from("direct_debit_misses")
                .select("agreement_id, month, charge_date")
                .gte("charge_date", DD_MISS_FROM)
                .in("agreement_id", chunk),
            agreementIds
          )
        : [];
    const missesByAgreement = new Map<string, string[]>();
    for (const id of agreementIds) {
      missesByAgreement.set(
        id,
        uniqueMonths(missRows.filter((row) => row.agreement_id === id))
      );
    }

    const results = customers.map((c) => ({
      company_name: c.company_name,
      email: c.email,
      has_portal_login: !!c.auth_user_id,
      agreements: (allAgreements || [])
        .filter((a) => a.customer_id === c.id)
        .sort((a, b) =>
          compareAgreementNumber(a.agreement_number, b.agreement_number)
        )
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
            net_book_value: netBookValue(a.total_lend, rows),
            has_schedule: rows.length > 0,
            gocardless_mandate_id: a.gocardless_mandate_id,
            missed_months: missesByAgreement.get(a.id) || [],
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

  const { data: relatedRows } = agreement.customer_id
    ? await supabase
        .from("agreements")
        .select(
          "id, agreement_number, agreement_type, status, asset_description, term_months, monthly_instalment, gocardless_mandate_id"
        )
        .eq("book", book)
        .eq("customer_id", agreement.customer_id)
    : { data: [agreement] };

  const relatedIds = (relatedRows || []).map((a) => a.id);
  const relatedPayments = await fetchAllIn(
    (chunk) =>
      supabase
        .from("payments")
        .select("*")
        .in("agreement_id", chunk),
    relatedIds
  );

  const payments = relatedPayments.filter((p) => p.agreement_id === agreement.id);

  const schedule = sortByDueDate(payments || []);
  const paidPayments = schedule.filter((p) => p.status === "paid");
  const lastPaid = [...paidPayments].sort((a, b) =>
    String(a.paid_date || a.due_date).localeCompare(
      String(b.paid_date || b.due_date)
    )
  ).pop();

  const scheduleWithBalance = withRemainingBalance(schedule);

  let missed_months: string[] = [];
  if (book === "ffg") {
    const { data: missRows } = await supabase
      .from("direct_debit_misses")
      .select("month, charge_date")
      .eq("agreement_id", agreement.id)
      .gte("charge_date", DD_MISS_FROM)
      .order("charge_date");
    missed_months = uniqueMonths(missRows || []);
  }

  return NextResponse.json(
    {
      agreement: {
        agreement_number: agreement.agreement_number,
        agreement_type: agreement.agreement_type,
        asset_description: agreement.asset_description,
        monthly_instalment: agreement.monthly_instalment,
        start_date: startDateFromFirstPayment(schedule, agreement.start_date),
        written_date: agreement.written_date,
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
      related_agreements: (relatedRows || [])
        .slice()
        .sort((a, b) =>
          compareAgreementNumber(a.agreement_number, b.agreement_number)
        )
        .map((a) => {
          const rows = relatedPayments.filter((p) => p.agreement_id === a.id);
          return {
            agreement_number: a.agreement_number,
            agreement_type: a.agreement_type,
            asset_description: a.asset_description,
            live: isLiveDeal(a, rows),
            paid_count: paidCount(rows),
            term_months: a.term_months,
            settlement_figure: unpaidSum(rows),
            net_book_value: netBookValue(a.total_lend, rows),
          };
        }),
      status: {
        paid_count: paidCount(schedule),
        term_months: agreement.term_months,
        live: isLiveDeal(agreement, schedule),
        settlement_figure: unpaidSum(schedule),
        net_book_value: netBookValue(agreement.total_lend, schedule),
        last_payment_date: lastPaid
          ? lastPaid.paid_date || lastPaid.due_date
          : null,
      },
      missed_months,
      schedule: scheduleWithBalance.map((p) => ({
        instalment_number: p.instalment_number,
        due_date: p.due_date,
        amount: p.amount,
        status: p.status,
        paid_date: p.paid_date,
        balance_after: p.balance_after,
        notes: visibleScheduleNote(p.notes),
        source: p.source || null,
      })),
    },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
  );
}
