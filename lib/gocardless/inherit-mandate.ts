import { isUnwoundAgreement } from "../deal-status";

export type MandateHolder = {
  gocardless_mandate_id?: string | null;
  status?: string | null;
};

export type MandateInheritance = {
  mandateId: string | null;
  /**
   * inherited        — taken from the customer's live agreements
   * inherited-closed — their live agreements have none, so an older one's
   * ambiguous        — more than one mandate to choose from; a person decides
   * none             — nothing to inherit
   */
  reason: "inherited" | "inherited-closed" | "ambiguous" | "none";
};

function isOpen(row: MandateHolder) {
  const status = String(row.status || "").trim().toLowerCase();
  return !isUnwoundAgreement(status) && status !== "settled";
}

function distinctMandates(rows: MandateHolder[]) {
  const ids = new Set<string>();
  for (const row of rows) {
    const id = String(row.gocardless_mandate_id || "").trim();
    if (id) ids.add(id);
  }
  return Array.from(ids);
}

/**
 * A customer who already pays us by Direct Debit collects every agreement on
 * the same mandate — Rochester runs HP125, HP128 and HP143 off one. So a new
 * agreement for an existing customer should inherit it rather than wait for
 * someone to paste the id in.
 *
 * What makes a mandate unsafe to assume is a choice between two of them, not
 * the customer having several agreements. Live agreements decide; only if
 * none of those carries a mandate does a settled or cancelled one supply it.
 *
 * Callers pass one book's agreements. Glacier Gem is collected by hand, so a
 * GG deal must not inherit the same customer's FFG mandate.
 */
export function inheritedMandateId(
  siblings: MandateHolder[] | null | undefined
): MandateInheritance {
  const rows = siblings || [];
  const live = distinctMandates(rows.filter(isOpen));
  if (live.length === 1) return { mandateId: live[0], reason: "inherited" };
  if (live.length > 1) return { mandateId: null, reason: "ambiguous" };

  const all = distinctMandates(rows);
  if (all.length === 1) return { mandateId: all[0], reason: "inherited-closed" };
  if (all.length > 1) return { mandateId: null, reason: "ambiguous" };
  return { mandateId: null, reason: "none" };
}
