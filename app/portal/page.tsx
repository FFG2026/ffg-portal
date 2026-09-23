import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { createAdminClient } from "../../lib/supabase/admin";
import { syncAgreementsPayments } from "../../lib/gocardless/sync-payments";
import { isDirectDebitUpToDate } from "../../lib/gocardless/match-payments";
import { fetchAllRows } from "../../lib/supabase/fetch-all";
import { isLiveDeal, paidCount as countPaid, settlementFigure as owingOn, netBookValue } from "../../lib/deal-status";
import { startDateFromFirstPayment } from "../../lib/schedule";
import PortalClient from "./PortalClient";

export const dynamic = "force-dynamic";

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

  // Every agreement this customer holds — the customer picks between
  // them in the portal UI if they have more than one.
  const { data: agreements } = await supabase
    .from("agreements")
    .select("*")
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: true });

  if (!agreements || agreements.length === 0) {
    redirect("/login?error=no-agreement");
  }

  // Pull the latest collected / failed payments from GoCardless
  // before we render, so the ticks a customer sees are current.
  try {
    await syncAgreementsPayments(createAdminClient(), agreements);
  } catch {
    // Still show whatever we already hold if GoCardless is unreachable.
  }

  const allPayments = await fetchAllRows(() =>
    supabase
      .from("payments")
      .select("*")
      .in(
        "agreement_id",
        agreements!.map((a) => a.id)
      )
      .order("instalment_number", { ascending: true })
  );

  const agreementSummaries = agreements!.map((agreement) => {
    const schedule = (allPayments || []).filter(
      (p) => p.agreement_id === agreement.id
    );
    const paidPayments = schedule.filter((p) => p.status === "paid");
    const paidCount = countPaid(schedule);
    const lastPayment = paidPayments[paidPayments.length - 1];

    const settlementFigure = owingOn(agreement, schedule);

    return {
      agreementNumber: agreement.agreement_number,
      agreementType: agreement.agreement_type,
      assetDescription: agreement.asset_description,
      monthlyInstalment: Number(agreement.monthly_instalment),
      startDate:
        startDateFromFirstPayment(schedule, agreement.start_date) ||
        String(agreement.start_date || ""),
      termMonths: agreement.term_months,
      paidCount,
      settlementFigure,
      netBookValue: netBookValue(agreement, schedule),
      lastPaymentDate: lastPayment ? lastPayment.due_date : null,
      directDebitUpToDate: isDirectDebitUpToDate(schedule),
      schedule: schedule.slice(
        Math.max(0, paidCount - 2),
        Math.min(schedule.length, paidCount + 3)
      ),
      isLive: isLiveDeal(agreement, schedule),
    };
  });

  // Customers only see agreements that are still running. Finished
  // ones stay in the database (and in the admin lookup tool) but
  // aren't shown here, so the portal reflects what they actually
  // still owe on.
  const liveAgreements = agreementSummaries
    .filter((a) => a.isLive)
    .map(({ isLive, ...rest }) => rest);

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
      agreements={liveAgreements}
    />
  );
}
