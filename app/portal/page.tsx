import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import PortalClient from "./PortalClient";

export default async function PortalPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("auth_user_id", user!.id)
    .single();

  if (!customer) {
    // Logged in, but no customer record links to this email yet.
    redirect("/login?error=no-account");
  }

  // For now, show the customer's first agreement. Once a customer
  // can hold multiple agreements in the UI, this becomes a list.
  const { data: agreement } = await supabase
    .from("agreements")
    .select("*")
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!agreement) {
    redirect("/login?error=no-agreement");
  }

  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .eq("agreement_id", agreement!.id)
    .order("instalment_number", { ascending: true });

  const schedule = payments || [];
  const paidPayments = schedule.filter((p) => p.status === "paid");
  const paidCount = paidPayments.length;
  const lastPayment = paidPayments[paidPayments.length - 1];

  // Settlement figure = the balance_after of the most recent paid
  // instalment, matching the same "Settlement" figure the deal book
  // shows. Falls back to total_lend if nothing's been paid yet.
  const settlementFigure = lastPayment
    ? Number(lastPayment.balance_after)
    : Number(agreement!.total_lend);

  const initials = customer.company_name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase())
    .join("");

  return (
    <PortalClient
      companyName={customer.company_name}
      initials={initials || "FG"}
      agreementNumber={agreement!.agreement_number}
      agreementType={agreement!.agreement_type}
      assetDescription={agreement!.asset_description}
      monthlyInstalment={Number(agreement!.monthly_instalment)}
      startDate={agreement!.start_date}
      termMonths={agreement!.term_months}
      paidCount={paidCount}
      settlementFigure={settlementFigure}
      lastPaymentDate={lastPayment ? lastPayment.due_date : null}
      schedule={schedule.slice(
        Math.max(0, paidCount - 2),
        Math.min(schedule.length, paidCount + 3)
      )}
    />
  );
}
