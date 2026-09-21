import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { authorizeAdminRequest } from "../../../../../lib/admin";
import { googleOAuthConfigured } from "../../../../../lib/google/oauth";
import {
  DEFAULT_AGREEMENTS_FOLDER_ID,
  getAgreementsFolderId,
  isDriveConnected,
  resolveServiceAccount,
} from "../../../../../lib/google/drive";
import { bookFromRequest, GLACIER_GEM_FOLDER_ID } from "../../../../../lib/admin-book";
import { inspectServiceAccountEnv } from "../../../../../lib/google/service-account";
import { getSetting } from "../../../../../lib/google/settings";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(request: Request) {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const book = bookFromRequest(request);
  const supabase = createAdminClient();
  const service = await resolveServiceAccount(supabase);
  const connected = await isDriveConnected(supabase);
  const email = service?.client_email || null;
  const folderId = await getAgreementsFolderId(supabase, book);
  const lastScan = await getSetting(supabase, "google_last_scan");
  const inspect = inspectServiceAccountEnv();
  return NextResponse.json({
    oauth_configured: googleOAuthConfigured(),
    service_account: Boolean(service),
    connected,
    email: email || null,
    service_account_present: inspect.present,
    service_account_valid: inspect.valid,
    service_account_length: inspect.length,
    agreements_folder_id: folderId,
    agreements_folder_url: `https://drive.google.com/drive/folders/${folderId}`,
    using_default_folder:
      book === "gg"
        ? folderId === GLACIER_GEM_FOLDER_ID
        : folderId === DEFAULT_AGREEMENTS_FOLDER_ID,
    last_scan: lastScan || null,
    callback_url: `${(process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://ffg.finance").replace(/\/$/, "")}/api/admin/google/callback`,
  });
}
