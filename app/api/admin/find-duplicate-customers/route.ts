import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function normalizeName(name: string) {
  return name
    .toLowerCase()
    .replace(/\bltd\b\.?/g, "")
    .replace(/\blimited\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

// Simple Levenshtein edit distance -- how many single-character edits
// separate two strings. Small distance on already-normalized names
// usually means a typo, not two genuinely different companies.
function editDistance(a: string, b: string) {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");

  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: customers, error: custErr } = await supabase
    .from("customers")
    .select("id, company_name, email, auth_user_id");

  if (custErr) {
    return NextResponse.json({ error: custErr.message }, { status: 500 });
  }

  const { data: agreements, error: agrErr } = await supabase
    .from("agreements")
    .select("id, customer_id, agreement_number");

  if (agrErr) {
    return NextResponse.json({ error: agrErr.message }, { status: 500 });
  }

  const agreementCountByCustomer = new Map<string, string[]>();
  for (const a of agreements || []) {
    const list = agreementCountByCustomer.get(a.customer_id) || [];
    list.push(a.agreement_number);
    agreementCountByCustomer.set(a.customer_id, list);
  }

  const list = (customers || []).map((c) => ({
    id: c.id,
    company_name: c.company_name,
    email: c.email,
    auth_user_id: c.auth_user_id,
    normalized: normalizeName(c.company_name),
    agreement_numbers: agreementCountByCustomer.get(c.id) || [],
  }));

  // 1. Zero-agreement customers -- a real, active customer should
  // have at least one agreement. A customer with none is very likely
  // a leftover duplicate whose agreements got linked to a
  // differently-spelled sibling record instead (exactly what happened
  // with "DCF" and the old "Days of Ashwell Limited").
  const zeroAgreementCustomers = list.filter(
    (c) => c.agreement_numbers.length === 0
  );

  // 2. Exact duplicates after normalizing case/spacing/Ltd-Limited --
  // these are near-certain, safe to merge once you confirm which one
  // should be the "keeper".
  const byNormalized = new Map<string, typeof list>();
  for (const c of list) {
    const group = byNormalized.get(c.normalized) || [];
    group.push(c);
    byNormalized.set(c.normalized, group);
  }
  const exactDuplicateGroups = Array.from(byNormalized.values()).filter(
    (group) => group.length > 1
  );

  // 3. Near-misses -- similar but not identical after normalizing.
  // These need a human look rather than auto-merging; a small edit
  // distance on short names is much more likely to be a coincidence
  // than on long names, so the threshold scales with name length.
  const nearMisses: any[] = [];
  const normalizedKeys = Array.from(byNormalized.keys());
  for (let i = 0; i < normalizedKeys.length; i++) {
    for (let j = i + 1; j < normalizedKeys.length; j++) {
      const a = normalizedKeys[i];
      const b = normalizedKeys[j];
      const maxLen = Math.max(a.length, b.length);
      const threshold = maxLen <= 8 ? 1 : maxLen <= 14 ? 2 : 3;
      const dist = editDistance(a, b);
      if (dist > 0 && dist <= threshold) {
        nearMisses.push({
          distance: dist,
          customers: [
            ...(byNormalized.get(a) || []),
            ...(byNormalized.get(b) || []),
          ].map((c) => ({
            id: c.id,
            company_name: c.company_name,
            agreement_numbers: c.agreement_numbers,
          })),
        });
      }
    }
  }

  return NextResponse.json(
    {
      summary: {
        total_customers: list.length,
        zero_agreement_customers: zeroAgreementCustomers.length,
        exact_duplicate_groups: exactDuplicateGroups.length,
        near_miss_groups: nearMisses.length,
      },
      zero_agreement_customers: zeroAgreementCustomers.map((c) => ({
        id: c.id,
        company_name: c.company_name,
      })),
      exact_duplicate_groups: exactDuplicateGroups.map((group) =>
        group.map((c) => ({
          id: c.id,
          company_name: c.company_name,
          agreement_numbers: c.agreement_numbers,
        }))
      ),
      near_miss_groups: nearMisses,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
