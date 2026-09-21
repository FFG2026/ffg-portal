import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { getAdminSecret, isAuthorizedAdmin } from "../../../../lib/admin";
import { buildPaymentSchedule } from "../../../../lib/schedule";

export const dynamic = "force-dynamic";

function n(v: unknown) {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const secret = getAdminSecret(request, body);
  if (!isAuthorizedAdmin(secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const companyName = String(body.company_name || "").trim();
  const agreementType = String(body.agreement_type || "HP").trim().toUpperCase();
  const startDate = String(body.start_date || "").slice(0, 10);
  const termMonths = n(body.term_months);
  const monthly = n(body.monthly_instalment);

  if (!companyName || !startDate || !termMonths || !monthly) {
    return NextResponse.json(
      {
        error:
          "Company name, start date, term and monthly instalment are required.",
      },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  let agreementNumber = String(body.agreement_number || "").trim().toUpperCase();
  if (!agreementNumber) {
    const { data: existing } = await supabase
      .from("agreements")
      .select("agreement_number")
      .ilike("agreement_number", `${agreementType}%`);
    let maxN = 0;
    for (const row of existing || []) {
      const match = String(row.agreement_number).match(/(\d+)/);
      if (match) maxN = Math.max(maxN, Number(match[1]));
    }
    agreementNumber = `${agreementType}${maxN + 1}`;
  } else {
    const { data: clash } = await supabase
      .from("agreements")
      .select("id")
      .ilike("agreement_number", agreementNumber)
      .maybeSingle();
    if (clash) {
      return NextResponse.json(
        { error: `${agreementNumber} already exists.` },
        { status: 409 }
      );
    }
  }

  let customerId = String(body.customer_id || "").trim();
  if (!customerId) {
    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("id")
      .ilike("company_name", companyName)
      .limit(1)
      .maybeSingle();
    if (existingCustomer) {
      customerId = existingCustomer.id;
      const patch: Record<string, string> = {};
      if (body.email) patch.email = String(body.email).trim();
      if (body.phone) patch.phone = String(body.phone).trim();
      if (body.contact_name) patch.contact_name = String(body.contact_name).trim();
      if (Object.keys(patch).length) {
        await supabase.from("customers").update(patch).eq("id", customerId);
      }
    } else {
      const { data: created, error: custErr } = await supabase
        .from("customers")
        .insert({
          company_name: companyName,
          contact_name: body.contact_name || null,
          email: body.email || null,
          phone: body.phone || null,
        })
        .select("id")
        .single();
      if (custErr || !created) {
        return NextResponse.json(
          { error: custErr?.message || "Could not create customer" },
          { status: 500 }
        );
      }
      customerId = created.id;
    }
  }

  const { data: agreement, error: agrErr } = await supabase
    .from("agreements")
    .insert({
      agreement_number: agreementNumber,
      agreement_type: agreementType,
      customer_id: customerId,
      asset_description: body.asset_description || null,
      purchase_price: n(body.purchase_price),
      customer_deposit: n(body.customer_deposit),
      total_lend: n(body.total_lend) ?? monthly * termMonths,
      commission: n(body.commission),
      documentation_fee: n(body.documentation_fee),
      monthly_instalment: monthly,
      term_months: termMonths,
      start_date: startDate,
      status: "live",
      gocardless_mandate_id: body.gocardless_mandate_id || null,
    })
    .select("id, agreement_number")
    .single();

  if (agrErr || !agreement) {
    return NextResponse.json(
      { error: agrErr?.message || "Could not create agreement" },
      { status: 500 }
    );
  }

  const schedule = buildPaymentSchedule({
    termMonths,
    monthlyInstalment: monthly,
    startDate,
  }).map((row) => ({ ...row, agreement_id: agreement.id }));

  const { error: payErr } = await supabase.from("payments").insert(schedule);
  if (payErr) {
    return NextResponse.json(
      {
        error: `Agreement ${agreement.agreement_number} was created but the schedule failed: ${payErr.message}`,
        agreement,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    agreement_number: agreement.agreement_number,
    customer_id: customerId,
    instalments: schedule.length,
  });
}
