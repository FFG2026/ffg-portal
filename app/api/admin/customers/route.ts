import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { fetchAllIn, fetchAllRows } from "../../../../lib/supabase/fetch-all";
import { bookFromRequest } from "../../../../lib/admin-book";
import { compareAgreementNumber } from "../../../../lib/gocardless/parse-ref";
import { authorizeAdminRequest } from "../../../../lib/admin";
import {
  isLiveDeal,
  unpaidSum,
  chaseOverdueSum,
  isPaidRow,
} from "../../../../lib/deal-status";

export const dynamic = "force-dynamic";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export async function GET(request: Request) {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const book = bookFromRequest(request);
  const q = new URL(request.url).searchParams.get("q")?.trim() || "";
  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

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

  const agreements = await fetchAllRows(() =>
    supabase
      .from("agreements")
      .select(
        "id, customer_id, agreement_number, monthly_instalment, term_months, status, asset_description, gocardless_mandate_id"
      )
      .eq("book", book)
  );

  const ids = (agreements || []).map((a) => a.id);
  const payments = await fetchAllIn(
    (chunk) =>
      supabase
        .from("payments")
        .select("agreement_id, amount, status, due_date, paid_date")
        .in("agreement_id", chunk),
    ids
  );

  const rowsByAgreement = new Map<string, typeof payments>();
  for (const p of payments || []) {
    const list = rowsByAgreement.get(p.agreement_id) || [];
    list.push(p);
    rowsByAgreement.set(p.agreement_id, list);
  }

  const list = (customers || [])
    .map((c) => {
      const ags = (agreements || []).filter((a) => a.customer_id === c.id);
      const liveAgs = ags.filter((a) =>
        isLiveDeal(a, rowsByAgreement.get(a.id) || [])
      );
      let exposure = 0;
      let overdue = 0;
      let nextPayment: string | null = null;
      let missingAsset = false;
      for (const a of liveAgs) {
        const rows = rowsByAgreement.get(a.id) || [];
        exposure += unpaidSum(rows);
        overdue += chaseOverdueSum(c.company_name, a, rows, today);
        if (!a.asset_description || String(a.asset_description).startsWith("Pending")) {
          missingAsset = true;
        }
        for (const row of rows) {
          if (isPaidRow(row.status) || !row.due_date) continue;
          const due = String(row.due_date).slice(0, 10);
          if (!nextPayment || due < nextPayment) nextPayment = due;
        }
      }
      const gaps: string[] = [];
      if (!String(c.contact_name || "").trim()) gaps.push("No contact name");
      if (!String(c.email || "").trim()) gaps.push("No email");
      const missingDetails = gaps.includes("No email");
      const status = overdue > 0 ? "arrears" : missingDetails ? "missing" : "active";
      return {
        id: c.id,
        company_name: c.company_name,
        contact_name: c.contact_name,
        email: c.email,
        phone: c.phone,
        has_portal_login: !!c.auth_user_id,
        agreement_count: ags.length,
        live_count: liveAgs.length,
        agreements: ags
          .map((a) => a.agreement_number)
          .sort(compareAgreementNumber),
        exposure: round2(exposure),
        overdue: round2(overdue),
        next_payment: nextPayment,
        missing_details: missingDetails,
        missing_asset: missingAsset,
        gaps,
        status,
      };
    })
    .filter((c) => c.agreement_count > 0);

  return NextResponse.json({ customers: list });
}
