import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { getAdminSecret, isAuthorizedAdmin } from "../../../../lib/admin";
import { planPartSettlement, nextInstalmentNumber } from "../../../../lib/part-settlement";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const secret = getAdminSecret(request, body);
  if (!isAuthorizedAdmin(secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agreementNumber = String(body.agreement_number || "").trim();
  const amount = Number(body.amount);
  const paidDate = String(body.paid_date || "").slice(0, 10);
  const note = String(body.note || "").trim();

  if (!agreementNumber) {
    return NextResponse.json({ error: "Missing agreement number." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) {
    return NextResponse.json({ error: "Pick the date the money arrived." }, { status: 400 });
  }
  if (!note) {
    return NextResponse.json(
      { error: "Add a note — e.g. insurance payout for stolen van." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { data: agreement, error: agrErr } = await supabase
    .from("agreements")
    .select("id, agreement_number, term_months, status")
    .ilike("agreement_number", agreementNumber)
    .maybeSingle();
  if (agrErr) {
    return NextResponse.json({ error: agrErr.message }, { status: 500 });
  }
  if (!agreement) {
    return NextResponse.json({ error: "Agreement not found." }, { status: 404 });
  }

  const { data: payments, error: payErr } = await supabase
    .from("payments")
    .select("id, instalment_number, amount, status, due_date")
    .eq("agreement_id", agreement.id)
    .order("due_date");
  if (payErr) {
    return NextResponse.json({ error: payErr.message }, { status: 500 });
  }

  const unpaid = (payments || [])
    .filter((p) => p.status !== "paid")
    .map((p) => ({
      id: p.id,
      instalment_number: p.instalment_number,
      amount: Number(p.amount),
      due_date: p.due_date,
    }));

  let plan;
  try {
    plan = planPartSettlement(unpaid, amount, paidDate);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Could not apply" }, { status: 400 });
  }

  if (plan.removeIds.length) {
    const { error } = await supabase.from("payments").delete().in("id", plan.removeIds);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  if (plan.reduce) {
    const { error } = await supabase
      .from("payments")
      .update({
        amount: plan.reduce.amount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", plan.reduce.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const kept = (payments || []).filter((p) => !plan.removeIds.includes(p.id));
  const n = nextInstalmentNumber(
    kept.map((p) => ({
      instalment_number: p.instalment_number,
      due_date: p.due_date,
    })),
    paidDate
  );
  const { error: insErr } = await supabase.from("payments").insert({
    agreement_id: agreement.id,
    instalment_number: n,
    due_date: paidDate,
    amount: Math.round(Number(amount) * 100) / 100,
    status: "paid",
    paid_date: paidDate,
    notes: note,
    source: "manual",
  });
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const { data: remaining } = await supabase
    .from("payments")
    .select("id, status")
    .eq("agreement_id", agreement.id);
  const stillDue = (remaining || []).some((p) => p.status !== "paid");
  const { error: agrUpd } = await supabase
    .from("agreements")
    .update({
      term_months: remaining?.length || 0,
      status: stillDue ? "active" : "settled",
    })
    .eq("id", agreement.id);
  if (agrUpd) {
    return NextResponse.json({ error: agrUpd.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    agreement_number: agreement.agreement_number,
    applied: Math.round(Number(amount) * 100) / 100,
    cleared: plan.removeIds.length,
    reduced: !!plan.reduce,
    settled: !stillDue,
  });
}
