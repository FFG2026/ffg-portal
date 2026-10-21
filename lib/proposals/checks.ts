import type { SupabaseClient } from "@supabase/supabase-js";
import { priceProposal, round2 } from "./calc";

export type CheckLevel = "ok" | "info" | "review" | "issue";

export type Check = {
  id: string;
  label: string;
  level: CheckLevel;
  detail: string;
};

export type ProposalFigures = {
  cash_price: number | null;
  vat: number | null;
  deposit: number | null;
  commission: number | null;
  commission_pct: number | null;
  financed: number | null;
  term_months: number | null;
  quoted_rate_pct: number | null;
  quoted_monthly: number | null;
};

const gbp = (v: number) =>
  `£${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Do the numbers in the email agree with each other? No judgement, just arithmetic. */
export function figureChecks(p: ProposalFigures): Check[] {
  const out: Check[] = [];
  const { cash_price, deposit, commission, financed, term_months } = p;
  if (cash_price === null || term_months === null || p.quoted_rate_pct === null) {
    out.push({
      id: "figures-missing",
      label: "Figures",
      level: "issue",
      detail: "Cash price, term or rate is missing, so the figures can't be checked.",
    });
    return out;
  }
  const dep = deposit ?? 0;
  const priced = priceProposal({
    cashPrice: cash_price,
    deposit: dep,
    commissionPct: p.commission_pct,
    commission,
    ratePct: p.quoted_rate_pct,
    termMonths: term_months,
  });

  if (financed !== null) {
    out.push(
      Math.abs(financed - priced.financed) <= 0.01
        ? {
            id: "financed",
            label: "Amount financed",
            level: "ok",
            detail: `${gbp(cash_price)} − ${gbp(dep)} deposit + ${gbp(priced.commission)} commission = ${gbp(priced.financed)}.`,
          }
        : {
            id: "financed",
            label: "Amount financed",
            level: "issue",
            detail: `Email says ${gbp(financed)} but cash price − deposit + commission is ${gbp(priced.financed)}.`,
          }
    );
  }

  if (p.quoted_monthly !== null) {
    const recalculated = priceProposal({
      cashPrice: cash_price,
      deposit: dep,
      commissionPct: p.commission_pct,
      commission,
      ratePct: p.quoted_rate_pct,
      termMonths: term_months,
    }).monthly;
    out.push(
      Math.abs(p.quoted_monthly - recalculated) <= 0.02
        ? {
            id: "monthly",
            label: "Monthly payment",
            level: "ok",
            detail: `${gbp(p.quoted_monthly)} a month agrees with ${p.quoted_rate_pct}% over ${term_months} months.`,
          }
        : {
            id: "monthly",
            label: "Monthly payment",
            level: "review",
            detail: `Email says ${gbp(p.quoted_monthly)} but ${p.quoted_rate_pct}% over ${term_months} months gives ${gbp(recalculated)}.`,
          }
    );
  }

  if (p.vat !== null) {
    const expected = round2(cash_price * 0.2);
    if (Math.abs(p.vat - expected) > 0.01) {
      out.push({
        id: "vat",
        label: "VAT",
        level: "info",
        detail: `VAT of ${gbp(p.vat)} is not 20% of the cash price (${gbp(expected)}) – part of the price may be non-vatable.`,
      });
    }
  }

  out.push({
    id: "shape",
    label: "Deal shape",
    level: "info",
    detail: `Deposit ${cash_price ? round2((dep / cash_price) * 100) : 0}% of cash price · net lend ${gbp(priced.netLend)} · total repayable ${gbp(priced.totalRepayable)} · profit ${gbp(priced.profit)} (total repayable − net lend − commission).`,
  });
  return out;
}

function normName(name: string | null | undefined) {
  return String(name || "")
    .toLowerCase()
    .replace(/\bltd\b\.?/g, "")
    .replace(/\blimited\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

async function companiesHouse(number: string): Promise<Check[]> {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key) {
    return [
      {
        id: "ch",
        label: "Companies House",
        level: "info",
        detail: "Not checked – no Companies House key is set on the server.",
      },
    ];
  }
  try {
    const res = await fetch(
      `https://api.company-information.service.gov.uk/company/${encodeURIComponent(number)}`,
      {
        headers: { Authorization: "Basic " + Buffer.from(`${key}:`).toString("base64") },
        cache: "no-store",
      }
    );
    if (res.status === 404) {
      return [
        {
          id: "ch",
          label: "Companies House",
          level: "issue",
          detail: `No company found with number ${number}.`,
        },
      ];
    }
    if (!res.ok) {
      return [
        {
          id: "ch",
          label: "Companies House",
          level: "info",
          detail: `Lookup failed (${res.status}) – try Re-run checks.`,
        },
      ];
    }
    const c: any = await res.json();
    const out: Check[] = [];
    const status = String(c.company_status || "unknown");
    out.push({
      id: "ch",
      label: "Companies House",
      level: status === "active" ? "ok" : "issue",
      detail: `${c.company_name} – ${status}${c.type ? `, ${c.type}` : ""}.`,
    });
    if (c.date_of_creation) {
      const months = Math.floor(
        (Date.now() - new Date(c.date_of_creation).getTime()) / (30.44 * 86400000)
      );
      out.push({
        id: "ch-age",
        label: "Time incorporated",
        level: months < 24 ? "review" : "ok",
        detail: `Incorporated ${c.date_of_creation} (${months} months ago)${months < 24 ? " – under two years" : ""}.`,
      });
    }
    if (c.accounts?.overdue || c.confirmation_statement?.overdue) {
      out.push({
        id: "ch-overdue",
        label: "Filings",
        level: "review",
        detail: [
          c.accounts?.overdue ? "Accounts overdue" : null,
          c.confirmation_statement?.overdue ? "Confirmation statement overdue" : null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    }
    if (c.has_charges) {
      out.push({
        id: "ch-charges",
        label: "Charges",
        level: "info",
        detail: "The company has registered charges.",
      });
    }
    const addr = c.registered_office_address;
    if (addr) {
      out.push({
        id: "ch-address",
        label: "Registered office",
        level: "info",
        detail: [addr.address_line_1, addr.address_line_2, addr.locality, addr.postal_code]
          .filter(Boolean)
          .join(", "),
      });
    }
    return out;
  } catch (err: any) {
    return [
      {
        id: "ch",
        label: "Companies House",
        level: "info",
        detail: `Lookup failed (${err?.message || "network"}).`,
      },
    ];
  }
}

export async function dataChecks(
  supabase: SupabaseClient,
  p: {
    company_name: string | null;
    company_number: string | null;
    supplier_name: string | null;
    supplier_number: string | null;
    dealer_id: string | null;
    cash_price: number | null;
    financed: number | null;
  }
): Promise<Check[]> {
  const out: Check[] = [];

  if (p.company_number) out.push(...(await companiesHouse(p.company_number)));
  else
    out.push({
      id: "ch",
      label: "Companies House",
      level: "review",
      detail: "No company number on the proposal.",
    });

  // Our own book: is this an existing customer, and what do they already owe us?
  if (p.company_name) {
    const { data: customers } = await supabase
      .from("customers")
      .select("id, company_name")
      .ilike("company_name", `%${normName(p.company_name).slice(0, 12)}%`);
    const wanted = normName(p.company_name);
    const match = (customers || []).find((c) => normName(c.company_name) === wanted);
    if (!match) {
      out.push({
        id: "book",
        label: "FFG history",
        level: "info",
        detail: "New to FFG – no agreements on the book.",
      });
    } else {
      const { data: agreements } = await supabase
        .from("agreements")
        .select("id, agreement_number, status, monthly_instalment, book")
        .eq("customer_id", match.id);
      const live = (agreements || []).filter((a) => a.status === "active");
      const settled = (agreements || []).filter((a) => a.status === "settled");
      let outstanding = 0;
      let overdue = 0;
      if (live.length) {
        const { data: pays } = await supabase
          .from("payments")
          .select("agreement_id, amount, status, due_date")
          .in("agreement_id", live.map((a) => a.id))
          .neq("status", "paid");
        const today = new Date().toISOString().slice(0, 10);
        for (const row of pays || []) {
          outstanding += Number(row.amount) || 0;
          if (row.due_date && String(row.due_date).slice(0, 10) < today) overdue++;
        }
      }
      out.push({
        id: "book",
        label: "FFG history",
        level: overdue > 0 ? "review" : "info",
        detail: `Existing customer: ${live.length} live agreement(s)${live.length ? ` (${live.map((a) => a.agreement_number).join(", ")})` : ""}, ${settled.length} settled. Unpaid instalments on live agreements ${gbp(round2(outstanding))}${overdue ? ` – ${overdue} instalment(s) past due` : ""}.`,
      });
    }
  }

  // DCF's own records on the company
  if (p.company_number) {
    const { data: dcfCustomer } = await supabase
      .from("dcf_customers")
      .select("shareholders_funds, shareholders_funds_period_end, shareholders_funds_checked_at")
      .eq("company_number", p.company_number)
      .limit(1)
      .maybeSingle();
    if (dcfCustomer && dcfCustomer.shareholders_funds !== null) {
      const sf = Number(dcfCustomer.shareholders_funds);
      out.push({
        id: "sf",
        label: "Shareholders' funds",
        level: sf < 0 ? "review" : "info",
        detail: `${gbp(sf)}${dcfCustomer.shareholders_funds_period_end ? ` at ${String(dcfCustomer.shareholders_funds_period_end).slice(0, 10)}` : ""} (from the DCF record).`,
      });
    }
    const { data: uw } = await supabase
      .from("dcf_underwriting_checks")
      .select("status, summary, created_at")
      .eq("company_number", p.company_number)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (uw) {
      out.push({
        id: "dcf-uw",
        label: "DCF underwriting report",
        level: uw.status === "review" ? "review" : "info",
        detail: `${uw.summary || uw.status} (run ${String(uw.created_at).slice(0, 10)}).`,
      });
    }
  }

  // Supplier
  if (p.supplier_name || p.supplier_number) {
    let dealer: { id: string; name: string } | null = null;
    if (p.dealer_id) {
      const { data } = await supabase.from("dcf_dealers").select("id, name").eq("id", p.dealer_id).maybeSingle();
      dealer = data;
    }
    if (!dealer && p.supplier_number) {
      const { data } = await supabase
        .from("dcf_dealers")
        .select("id, name")
        .eq("company_number", p.supplier_number)
        .limit(1)
        .maybeSingle();
      dealer = data;
    }
    out.push({
      id: "supplier",
      label: "Supplier",
      level: "info",
      detail: dealer
        ? `${p.supplier_name || dealer.name} is a known dealer on the DCF system.`
        : `${p.supplier_name || p.supplier_number} is not yet on the DCF dealer list.`,
    });
  }
  return out;
}
