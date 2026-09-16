import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const supabase = createClient();
  let user = null;

  if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=link-expired`);
    }
    user = data?.user ?? null;
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=link-expired`);
    }
    user = data?.user ?? null;
  }

  if (user?.email) {
    // Admin client, because this write needs to succeed regardless
    // of the customers table's row-level security policies.
    const admin = createAdminClient();

    // Only try to link if this auth user isn't already linked to
    // a customer -- avoids re-matching on every subsequent login.
    const { data: existingLink } = await admin
      .from("customers")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (!existingLink) {
      // Match on email, case-insensitive, and only ever claim a
      // customer record that isn't already linked to someone else --
      // never overwrite an existing link.
      const { data: matchedCustomer } = await admin
        .from("customers")
        .select("id, auth_user_id")
        .ilike("email", user.email)
        .is("auth_user_id", null)
        .limit(1)
        .maybeSingle();

      if (matchedCustomer) {
        await admin
          .from("customers")
          .update({ auth_user_id: user.id })
          .eq("id", matchedCustomer.id);
      }
    }
  }

  return NextResponse.redirect(`${origin}/portal`);
}
