import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

export const dynamic = "force-dynamic";

function normalizeName(name: string) {
  return name
    .toLowerCase()
    .replace(/\bltd\b\.?/g, "")
    .replace(/\blimited\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const apply = searchParams.get("apply") === "true";

  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: customers, error: custErr } = await supabase
    .from("customers")
    .select("id, company_name, email, auth_user_id, created_at");

  if (custErr) {
    return NextResponse.json({ error: custErr.message }, { status: 500 });
  }

  const { data: agreements, error: agrErr } = await supabase
    .from("agreements")
    .select("id, customer_id, agreement_number");

  if (agrErr) {
    return NextResponse.json({ error: agrErr.message }, { status: 500 });
  }

  const agreementsByCustomer = new Map<string, string[]>();
  for (const a of agreements || []) {
    const list = agreementsByCustomer.get(a.customer_id) || [];
    list.push(a.agreement_number);
    agreementsByCustomer.set(a.customer_id, list);
  }

  const list = (customers || []).map((c) => ({
    ...c,
    normalized: normalizeName(c.company_name),
    agreement_numbers: agreementsByCustomer.get(c.id) || [],
  }));

  const byNormalized = new Map<string, typeof list>();
  for (const c of list) {
    const group = byNormalized.get(c.normalized) || [];
    group.push(c);
    byNormalized.set(c.normalized, group);
  }

  // Only exact (post-normalization) duplicate groups are handled here --
  // near-misses need a human decision and are deliberately left out,
  // since some of them turn out to be genuinely different companies
  // (e.g. placeholder names that just happen to look similar).
  const duplicateGroups = Array.from(byNormalized.values()).filter(
    (g) => g.length > 1
  );

  const plan = duplicateGroups.map((group) => {
    // Pick the "keeper": prefer whichever record already has real
    // work done on it (an auth link, then an email), then whichever
    // has the most agreements, then the oldest record.
    const sorted = [...group].sort((a, b) => {
      if (!!a.auth_user_id !== !!b.auth_user_id) return a.auth_user_id ? -1 : 1;
      if (!!a.email !== !!b.email) return a.email ? -1 : 1;
      if (a.agreement_numbers.length !== b.agreement_numbers.length)
        return b.agreement_numbers.length - a.agreement_numbers.length;
      return (a.created_at || "").localeCompare(b.created_at || "");
    });
    const keeper = sorted[0];
    const losers = sorted.slice(1);

    return {
      keeper: {
        id: keeper.id,
        company_name: keeper.company_name,
        agreement_numbers: keeper.agreement_numbers,
      },
      losers: losers.map((l) => ({
        id: l.id,
        company_name: l.company_name,
        agreement_numbers: l.agreement_numbers,
        email_to_copy: !keeper.email && l.email ? l.email : null,
      })),
    };
  });

  let applyResults: any[] = [];
  if (apply) {
    for (const item of plan) {
      for (const loser of item.losers) {
        // Move every agreement from the loser onto the keeper.
        const { data: moved, error: moveErr } = await supabase
          .from("agreements")
          .update({ customer_id: item.keeper.id })
          .eq("customer_id", loser.id)
          .select("agreement_number");

        // If the keeper has no email yet but the loser did, carry it
        // across so nothing already-matched gets lost.
        let emailCopyError: string | null = null;
        if (loser.email_to_copy) {
          const { error: emailErr } = await supabase
            .from("customers")
            .update({ email: loser.email_to_copy })
            .eq("id", item.keeper.id)
            .is("email", null);
          emailCopyError = emailErr?.message || null;
        }

        applyResults.push({
          keeper: item.keeper.company_name,
          loser: loser.company_name,
          agreements_moved: moved?.map((a) => a.agreement_number) || [],
          move_error: moveErr?.message || null,
          email_copied: loser.email_to_copy,
          email_copy_error: emailCopyError,
        });
      }
    }
  }

  return NextResponse.json({
    mode: apply
      ? "APPLIED — agreements moved, loser records left in place (now empty) for you to review/delete"
      : "DRY RUN — nothing written, add &apply=true to write",
    summary: {
      duplicate_groups_found: plan.length,
    },
    plan,
    apply_results: apply ? applyResults : undefined,
  });
}
