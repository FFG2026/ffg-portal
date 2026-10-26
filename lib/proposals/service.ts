import type { SupabaseClient } from "@supabase/supabase-js";
import { parseProposalText } from "./parse-proposal";
import { readEmailFile } from "./read-email";
import { figureChecks, dataChecks, type Check } from "./checks";
import { priceProposal } from "./calc";
import { buildAcceptanceEmail, PRODUCT_LABELS } from "./acceptance-email";
import { createDeal } from "../create-deal";
import { parseAdminBook } from "../admin-book";
import { readSupplierInvoice } from "./documents/read-invoice";
import { documentsPrefill, raiseDocuments, reserveNumber, type RaiseInput } from "./documents/raise";

export class ProposalError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const num = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const str = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

export async function logEvent(
  supabase: SupabaseClient,
  proposalId: string,
  actor: string,
  kind: string,
  detail: Record<string, unknown> = {}
) {
  await supabase
    .from("ffg_proposal_events")
    .insert({ proposal_id: proposalId, actor, kind, detail });
}

export async function getProposal(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("ffg_proposals")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new ProposalError(error.message, 500);
  if (!data) throw new ProposalError("Proposal not found.", 404);
  return data as Record<string, any>;
}

/** Finds the DCF calculator quote this email was generated from, if it is on file. */
async function matchQuote(
  supabase: SupabaseClient,
  parsed: ReturnType<typeof parseProposalText>,
  emailDate: string | null
) {
  if (!parsed.companyNumber || parsed.cashPrice === null) return null;
  const { data } = await supabase
    .from("dcf_quotes")
    .select("id, rep_id, rep_name, customer_email, dealer_id, created_at, accepted_at")
    .eq("company_number", parsed.companyNumber)
    .eq("cash_price", parsed.cashPrice)
    .order("created_at", { ascending: false })
    .limit(10);
  if (!data?.length) return null;
  const target = emailDate ? new Date(emailDate).getTime() : Date.now();
  const scored = data
    .map((q) => ({ q, gap: Math.abs(new Date(q.created_at).getTime() - target) }))
    .sort((a, b) => a.gap - b.gap);
  return scored[0].gap <= 3 * 86400000 ? scored[0].q : null;
}

export async function ingestEmail(
  supabase: SupabaseClient,
  actor: string,
  input: { filename?: string; contentBase64?: string; text?: string }
) {
  let email;
  if (input.contentBase64) {
    email = await readEmailFile(
      input.filename || "email.txt",
      Buffer.from(input.contentBase64, "base64")
    );
  } else if (input.text && input.text.trim()) {
    email = await readEmailFile("pasted.txt", Buffer.from(input.text, "utf8"));
  } else {
    throw new ProposalError("Drop in the email file or paste its text.");
  }

  if (email.messageId) {
    const { data: dup } = await supabase
      .from("ffg_proposals")
      .select("id")
      .eq("email_message_id", email.messageId)
      .maybeSingle();
    if (dup) return { id: dup.id as string, duplicate: true, warnings: [] as string[] };
  }

  const parsed = parseProposalText(email.text);
  if (parsed.cashPrice === null && parsed.companyName === null) {
    throw new ProposalError(
      "That doesn't look like a quote proposal – I couldn't find a customer or a cash price in it."
    );
  }

  const received = email.date && !isNaN(new Date(email.date).getTime()) ? new Date(email.date).toISOString() : null;
  const quote = await matchQuote(supabase, parsed, received);
  if (quote) {
    // The same quote may already be here, e.g. sent from the DCF portal's Send to FFG button.
    const { data: already } = await supabase
      .from("ffg_proposals")
      .select("id")
      .eq("dcf_quote_id", quote.id)
      .maybeSingle();
    if (already) return { id: already.id as string, duplicate: true, warnings: [] as string[] };
  }

  let repEmail: string | null = null;
  if (quote?.rep_id) {
    const { data: rep } = await supabase
      .from("dcf_reps")
      .select("email")
      .eq("id", quote.rep_id)
      .maybeSingle();
    repEmail = rep?.email || null;
  }

  const row = {
    source: "email",
    email_message_id: email.messageId,
    email_subject: email.subject,
    email_from: email.from,
    email_received_at: received,
    raw_text: email.text,
    dcf_quote_id: quote?.id || null,
    dealer_id: quote?.dealer_id || null,
    created_by: actor,
    rep_name: parsed.repName || quote?.rep_name || null,
    rep_email: repEmail,
    company_name: parsed.companyName,
    company_number: parsed.companyNumber,
    customer_email: parsed.sentTo || quote?.customer_email || null,
    product_type: parsed.productType,
    asset_description: parsed.assetDescription,
    asset_condition: parsed.assetCondition,
    supplier_name: parsed.supplierName,
    supplier_number: parsed.supplierNumber,
    cash_price: parsed.cashPrice,
    vat: parsed.vat,
    deposit: parsed.deposit,
    commission: parsed.commission,
    commission_pct: parsed.commissionPct,
    financed: parsed.financed,
    term_months: parsed.termMonths,
    quoted_rate_pct: parsed.ratePct,
    quoted_monthly: parsed.monthly,
    extras: parsed.extras,
  };
  const { data: created, error } = await supabase
    .from("ffg_proposals")
    .insert(row)
    .select("id")
    .single();
  if (error || !created) throw new ProposalError(error?.message || "Could not save the proposal.", 500);

  await logEvent(supabase, created.id, actor, "received", {
    subject: email.subject,
    linked_quote: !!quote,
    warnings: parsed.warnings,
  });
  await runChecks(supabase, created.id).catch(() => undefined);
  return { id: created.id as string, duplicate: false, warnings: parsed.warnings };
}

export async function runChecks(supabase: SupabaseClient, id: string): Promise<Check[]> {
  const p = await getProposal(supabase, id);
  const figures = figureChecks({
    cash_price: num(p.cash_price),
    vat: num(p.vat),
    deposit: num(p.deposit),
    commission: num(p.commission),
    commission_pct: num(p.commission_pct),
    financed: num(p.financed),
    term_months: num(p.term_months),
    quoted_rate_pct: num(p.quoted_rate_pct),
    quoted_monthly: num(p.quoted_monthly),
  });
  const data = await dataChecks(supabase, {
    company_name: p.company_name,
    company_number: p.company_number,
    supplier_name: p.supplier_name,
    supplier_number: p.supplier_number,
    dealer_id: p.dealer_id,
    cash_price: num(p.cash_price),
    financed: num(p.financed),
  });
  const checks = [...data, ...figures];
  await supabase
    .from("ffg_proposals")
    .update({ checks, checks_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  return checks;
}

const EDITABLE = [
  "rep_name", "rep_email", "company_name", "company_number", "customer_email",
  "product_type", "asset_description", "asset_condition", "supplier_name", "supplier_number",
  "cash_price", "vat", "deposit", "commission", "commission_pct", "financed",
  "term_months", "quoted_rate_pct", "quoted_monthly",
] as const;
const NUMERIC = new Set([
  "cash_price", "vat", "deposit", "commission", "commission_pct", "financed",
  "term_months", "quoted_rate_pct", "quoted_monthly",
]);

function touch(extra: Record<string, unknown>) {
  return { ...extra, updated_at: new Date().toISOString() };
}

function requireStatus(p: Record<string, any>, allowed: string[], what: string) {
  if (!allowed.includes(p.status)) {
    throw new ProposalError(
      `Can't ${what} while the proposal is "${p.status}".`,
      409
    );
  }
}

export async function applyAction(
  supabase: SupabaseClient,
  id: string,
  actor: { name: string; email: string },
  body: Record<string, any>
) {
  const action = String(body.action || "");
  const p = await getProposal(supabase, id);
  const who = actor.name || actor.email;

  switch (action) {
    case "edit": {
      requireStatus(p, ["new", "underwriting", "approved"], "edit the figures");
      const patch: Record<string, unknown> = {};
      for (const key of EDITABLE) {
        if (body.fields && key in body.fields) {
          patch[key] = NUMERIC.has(key) ? num(body.fields[key]) : str(body.fields[key]);
        }
      }
      if (!Object.keys(patch).length) throw new ProposalError("Nothing to change.");
      const { error } = await supabase.from("ffg_proposals").update(touch(patch)).eq("id", id);
      if (error) throw new ProposalError(error.message, 500);
      await logEvent(supabase, id, who, "edited", { fields: Object.keys(patch) });
      await runChecks(supabase, id).catch(() => undefined);
      return {};
    }

    case "run_checks": {
      await runChecks(supabase, id);
      return {};
    }

    case "underwrite": {
      requireStatus(p, ["new", "underwriting", "approved"], "record a decision");
      const decision = String(body.decision || "");
      if (!["approve", "refer", "decline"].includes(decision)) {
        throw new ProposalError("Choose approve, refer or decline.");
      }
      const notes = str(body.notes);
      if (decision === "decline" && !notes) {
        throw new ProposalError("Add a note saying why you're declining.");
      }
      const status = decision === "approve" ? "approved" : decision === "decline" ? "declined" : "underwriting";
      const patch: Record<string, unknown> = {
        uw_decision: decision,
        uw_notes: notes,
        uw_by: who,
        uw_at: new Date().toISOString(),
        status,
      };
      if (decision === "decline") {
        patch.decline_reason = notes;
        patch.declined_at = new Date().toISOString();
      }
      const { error } = await supabase.from("ffg_proposals").update(touch(patch)).eq("id", id);
      if (error) throw new ProposalError(error.message, 500);
      await logEvent(supabase, id, who, `underwriting_${decision}`, { notes });
      return {};
    }

    case "set_rate": {
      requireStatus(p, ["approved"], "agree a rate");
      const rate = num(body.rate_pct);
      const term = num(body.term_months) ?? num(p.term_months);
      const deposit = num(body.deposit) ?? num(p.deposit) ?? 0;
      if (rate === null || rate < 0 || rate > 100) throw new ProposalError("Enter a rate between 0 and 100.");
      if (!term || term < 1) throw new ProposalError("Enter a term in months.");
      const cash = num(p.cash_price);
      if (cash === null) throw new ProposalError("The proposal has no cash price.");
      // An explicit commission wins. Otherwise a percentage-based commission
      // follows the new net lend, and a fixed one stays as quoted.
      const explicitCommission =
        body.commission !== undefined && body.commission !== "" && body.commission !== null
          ? num(body.commission)
          : null;
      const commission =
        explicitCommission !== null
          ? explicitCommission
          : num(p.commission_pct) !== null
            ? null
            : num(p.commission);
      const priced = priceProposal({
        cashPrice: cash,
        deposit,
        commissionPct: num(p.commission_pct),
        commission,
        ratePct: rate,
        termMonths: term,
      });
      const { error } = await supabase
        .from("ffg_proposals")
        .update(
          touch({
            agreed_rate_pct: rate,
            agreed_term_months: term,
            agreed_deposit: deposit,
            agreed_commission: priced.commission,
            agreed_financed: priced.financed,
            agreed_monthly: priced.monthly,
            agreed_total_repayable: priced.totalRepayable,
            agreed_by: who,
            agreed_at: new Date().toISOString(),
          })
        )
        .eq("id", id);
      if (error) throw new ProposalError(error.message, 500);
      await logEvent(supabase, id, who, "rate_agreed", { rate, term, ...priced });
      return { priced };
    }

    case "documents_prefill": {
      requireStatus(p, ["approved", "accepted"], "raise documents");
      return { prefill: await documentsPrefill(supabase, p) };
    }

    case "read_invoice": {
      requireStatus(p, ["approved", "accepted"], "read the invoice");
      try {
        return { invoice: await readSupplierInvoice(supabase, p) };
      } catch (err: any) {
        throw new ProposalError(err?.message || "Could not read the invoice.", 502);
      }
    }

    case "raise_documents": {
      requireStatus(p, ["approved", "accepted"], "raise documents");
      if (p.uw_decision !== "approve") throw new ProposalError("Approve the proposal first.");
      let result;
      try {
        // Reserve the number first so it is the same one the deal goes on the book under.
        const number = await reserveNumber(supabase, p);
        result = await raiseDocuments(supabase, { ...p, extras: { ...(p.extras || {}), reserved_agreement_number: number } }, who, (body.input || {}) as RaiseInput);
      } catch (err: any) {
        throw new ProposalError(err?.message || "Could not raise the documents.", 502);
      }
      const extras = {
        ...(p.extras || {}),
        reserved_agreement_number: result.agreement_number,
        docs: {
          version: result.version,
          folder_name: result.folder_name,
          folder_link: result.folder_link,
          raised_at: new Date().toISOString(),
          raised_by: who,
          files: [...((p.extras?.docs?.files as any[]) || []), ...result.files],
        },
      };
      const { error } = await supabase.from("ffg_proposals").update(touch({ extras })).eq("id", id);
      if (error) throw new ProposalError(error.message, 500);
      await logEvent(supabase, id, who, "documents_raised", {
        agreement_number: result.agreement_number,
        folder: result.folder_name,
        files: result.files.map((f) => f.name),
        skipped: result.skipped,
      });
      return { documents: result };
    }

    case "acceptance_draft": {
      requireStatus(p, ["approved", "accepted"], "draft the acceptance");
      if (num(p.agreed_monthly) === null) throw new ProposalError("Agree a rate first.");
      return { email: acceptanceFor(p, who), to: p.acceptance_to || p.rep_email || "" };
    }

    case "send_acceptance": {
      requireStatus(p, ["approved"], "send the acceptance");
      if (num(p.agreed_monthly) === null) throw new ProposalError("Agree a rate first.");
      const to = str(body.to);
      const subject = str(body.subject);
      const text = str(body.body);
      if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new ProposalError("Enter a valid email address to send to.");
      if (!subject || !text) throw new ProposalError("The email needs a subject and a message.");
      const key = process.env.RESEND_API_KEY;
      if (!key) throw new ProposalError("Email isn't set up on the server (RESEND_API_KEY is missing), so nothing was sent.", 500);

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Future FG <noreply@ffg.finance>",
          to,
          bcc: actor.email ? [actor.email] : undefined,
          reply_to: actor.email || undefined,
          subject,
          text,
        }),
      });
      const out: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new ProposalError(`The email didn't send: ${out?.message || res.status}.`, 502);
      }
      const { error } = await supabase
        .from("ffg_proposals")
        .update(
          touch({
            status: "accepted",
            acceptance_to: to,
            acceptance_subject: subject,
            acceptance_body: text,
            acceptance_sent_at: new Date().toISOString(),
            acceptance_sent_by: who,
            acceptance_provider_id: out?.id || null,
          })
        )
        .eq("id", id);
      if (error) throw new ProposalError(`Email sent but the record failed to save: ${error.message}`, 500);
      await logEvent(supabase, id, who, "acceptance_sent", { to, provider_id: out?.id || null });
      return {};
    }

    case "put_on_book": {
      requireStatus(p, ["approved", "accepted"], "put the deal on the book");
      const priorStatus = p.status === "approved" ? "approved" : "accepted";
      const startDate = String(body.start_date || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new ProposalError("Enter the start date.");
      const monthly = num(body.monthly_instalment) ?? num(p.agreed_monthly);
      const term = num(body.term_months) ?? num(p.agreed_term_months);
      if (!monthly || !term) throw new ProposalError("The agreed monthly payment and term are needed.");
      const typeMap: Record<string, string> = { hp: "HP", fl: "FL", loan: "L" };
      const cash = num(p.cash_price);
      const deposit = num(p.agreed_deposit) ?? num(p.deposit) ?? 0;

      // Claim it first so a double click can't book it twice.
      const { data: claimed } = await supabase
        .from("ffg_proposals")
        .update(touch({ status: "on_book" }))
        .eq("id", id)
        .eq("status", priorStatus)
        .select("id");
      if (!claimed?.length) throw new ProposalError("This proposal has already been put on the book.", 409);

      const result = await createDeal(
        supabase,
        {
          agreement_type: typeMap[p.product_type || "hp"] || "HP",
          agreement_number: str(body.agreement_number) || str(p.extras?.reserved_agreement_number) || "",
          company_name: p.company_name,
          email: p.customer_email,
          contact_name: str(body.contact_name),
          phone: str(body.phone),
          asset_description: str(body.asset_description) || p.asset_description,
          purchase_price: cash,
          customer_deposit: deposit,
          total_lend: cash !== null ? Math.round((cash - deposit) * 100) / 100 : null,
          commission: num(p.agreed_commission) ?? num(p.commission),
          documentation_fee: body.documentation_fee === "" || body.documentation_fee === undefined ? 195 : num(body.documentation_fee),
          monthly_instalment: monthly,
          term_months: term,
          start_date: startDate,
          written_date: str(body.written_date) || new Date().toISOString().slice(0, 10),
          gocardless_mandate_id: str(body.gocardless_mandate_id),
        },
        parseAdminBook("ffg")
      );
      if (!result.ok) {
        // Put it back so it can be fixed and tried again – unless the agreement itself exists.
        if (!result.agreement) {
          await supabase.from("ffg_proposals").update(touch({ status: priorStatus })).eq("id", id);
        }
        throw new ProposalError(result.error, result.status);
      }
      await supabase
        .from("ffg_proposals")
        .update(
          touch({
            agreement_id: result.agreement_id,
            agreement_number: result.agreement_number,
            customer_id: result.customer_id,
            booked_at: new Date().toISOString(),
            booked_by: who,
          })
        )
        .eq("id", id);
      await logEvent(supabase, id, who, "put_on_book", {
        agreement_number: result.agreement_number,
        instalments: result.instalments,
        mandate: result.mandate_source,
      });
      return {
        agreement_number: result.agreement_number,
        instalments: result.instalments,
        mandate_source: result.mandate_source,
        gocardless_mandate_id: result.gocardless_mandate_id,
      };
    }

    case "decline": {
      requireStatus(p, ["new", "underwriting", "approved", "accepted"], "decline");
      const reason = str(body.reason);
      if (!reason) throw new ProposalError("Add a reason.");
      const { error } = await supabase
        .from("ffg_proposals")
        .update(touch({ status: "declined", decline_reason: reason, declined_at: new Date().toISOString() }))
        .eq("id", id);
      if (error) throw new ProposalError(error.message, 500);
      await logEvent(supabase, id, who, "declined", { reason });
      return {};
    }

    case "delete": {
      // Removes the proposal and its history. If it was already put on the book the
      // agreement stays – only the proposal record goes. Deleting also lets the
      // DCF quote be sent to FFG again.
      if (body.confirm !== true) throw new ProposalError("Confirm the delete first.");
      const { error } = await supabase.from("ffg_proposals").delete().eq("id", id);
      if (error) throw new ProposalError(error.message, 500);
      return { deleted: true, agreement_number: p.agreement_number || null };
    }

    case "reopen": {
      requireStatus(p, ["declined"], "reopen");
      const { error } = await supabase
        .from("ffg_proposals")
        .update(touch({ status: "new", declined_at: null, decline_reason: null }))
        .eq("id", id);
      if (error) throw new ProposalError(error.message, 500);
      await logEvent(supabase, id, who, "reopened");
      return {};
    }

    default:
      throw new ProposalError("Unknown action.");
  }
}

export function acceptanceFor(p: Record<string, any>, senderName: string) {
  return buildAcceptanceEmail({
    repName: p.rep_name,
    companyName: p.company_name,
    productLabel: PRODUCT_LABELS[p.product_type || "hp"] || "Hire Purchase",
    assetDescription: p.asset_description,
    supplierName: p.supplier_name,
    cashPrice: num(p.cash_price),
    deposit: num(p.agreed_deposit) ?? num(p.deposit),
    financed: num(p.agreed_financed),
    termMonths: num(p.agreed_term_months) ?? num(p.term_months),
    ratePct: num(p.agreed_rate_pct),
    monthly: num(p.agreed_monthly),
    senderName,
  });
}
