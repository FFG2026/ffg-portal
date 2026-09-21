import { NextResponse } from "next/server";
import { authorizeAdminRequest } from "../../../../../lib/admin";
import { googleAuthUrl, googleOAuthConfigured } from "../../../../../lib/google/oauth";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(request: Request) {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!googleOAuthConfigured()) {
    return NextResponse.json(
      {
        error:
          "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on Vercel, then try again.",
      },
      { status: 400 }
    );
  }
  return NextResponse.json({ url: googleAuthUrl(request) });
}
