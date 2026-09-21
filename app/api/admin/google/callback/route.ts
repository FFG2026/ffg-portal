import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import {
  exchangeCodeForTokens,
  googleUserEmail,
  verifyOAuthState,
} from "../../../../../lib/google/oauth";
import { setSetting } from "../../../../../lib/google/settings";
import { scanDealFolders } from "../../../../../lib/google/drive";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function drivePage(request: Request, query: string) {
  const host =
    request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const origin =
    (process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "").replace(
      /\/$/,
      ""
    ) || `${proto}://${host}`;
  return `${origin}/admin/drive?${query}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";

  if (error) {
    return NextResponse.redirect(
      drivePage(request, `error=${encodeURIComponent(error)}`)
    );
  }
  if (!code || !verifyOAuthState(state)) {
    return NextResponse.redirect(
      drivePage(request, "error=Could+not+finish+Google+sign-in")
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(request, code);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        drivePage(
          request,
          "error=Google+did+not+return+a+refresh+token.+Disconnect+the+app+in+Google+account+permissions+and+try+again."
        )
      );
    }
    const email = await googleUserEmail(tokens.access_token);
    const supabase = createAdminClient();
    await setSetting(supabase, "google_refresh_token", tokens.refresh_token);
    await setSetting(supabase, "google_connected_email", email);
    try {
      await scanDealFolders(supabase);
    } catch {
      // Connection still succeeded; scan can be retried from the Drive page.
    }
    return NextResponse.redirect(drivePage(request, "connected=1"));
  } catch (err: any) {
    return NextResponse.redirect(
      drivePage(
        request,
        `error=${encodeURIComponent(err.message || "Google sign-in failed")}`
      )
    );
  }
}
