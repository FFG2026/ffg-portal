import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { authorizeAdminRequest } from "../../../../../lib/admin";
import { googleOAuthConfigured } from "../../../../../lib/google/oauth";
import {
  DEFAULT_AGREEMENTS_FOLDER_ID,
  driveServiceAccount,
  getAgreementsFolderId,
  isDriveConnected,
} from "../../../../../lib/google/drive";
import { getSetting } from "../../../../../lib/google/settings";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(request: Request) {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  const service = driveServiceAccount();
  const connected = await isDriveConnected(supabase);
  const email =
    service?.client_email ||
    (await getSetting(supabase, "google_connected_email"));
  const folderId = await getAgreementsFolderId(supabase);
  const lastScan = await getSetting(supabase, "google_last_scan");
  return NextResponse.json({
    oauth_configured: googleOAuthConfigured(),
    service_account: Boolean(service),
    connected,
    email: email || null,
    agreements_folder_id: folderId,
    agreements_folder_url: `https://drive.google.com/drive/folders/${folderId}`,
    using_default_folder: folderId === DEFAULT_AGREEMENTS_FOLDER_ID,
    last_scan: lastScan || null,
    callback_url: `${(process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://ffg.finance").replace(/\/$/, "")}/api/admin/google/callback`,
  });
}
