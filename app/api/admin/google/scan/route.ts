import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { authorizeAdminRequest } from "../../../../../lib/admin";
import { scanDealFolders } from "../../../../../lib/google/drive";
import {
  fillPendingAssetsFromDrive,
  ingestDealFromFolder,
} from "../../../../../lib/google/ingest-deal";
import { parseDealFolderTitle } from "../../../../../lib/google/folder-match";
import { bookFromRequest } from "../../../../../lib/admin-book";
import { setSetting } from "../../../../../lib/google/settings";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await authorizeAdminRequest(request, body);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  const book = bookFromRequest(request, body);
  const folderId = String(body.agreements_folder_id || "").trim();
  if (folderId) {
    await setSetting(
      supabase,
      book === "gg" ? "google_glacier_gem_folder_id" : "google_agreements_folder_id",
      folderId
    );
  }
  try {
    const result = await scanDealFolders(supabase, { book });
    const created: string[] = [];
    const ingest_errors: { name: string; error: string }[] = [];
    const ingest = body.ingest !== false;
    if (ingest) {
      for (const folder of result.unmatched_folders.slice(0, 20)) {
        try {
          const added = await ingestDealFromFolder(supabase, folder);
          if (!added.skipped && added.created) {
            created.push(added.agreement_number);
          }
        } catch (err: any) {
          ingest_errors.push({
            name: folder.name,
            error: err.message || "Could not add from Drive",
          });
        }
      }
    }
    const assets = ingest
      ? await fillPendingAssetsFromDrive(supabase, 12)
      : { pending: 0, filled: [] as string[], errors: [] as { name: string; error: string }[] };
    ingest_errors.push(...assets.errors);
    return NextResponse.json({
      ...result,
      unmatched_folders: result.unmatched_folders.filter((folder) => {
        const parsed = parseDealFolderTitle(folder.name);
        return !parsed || !created.includes(parsed.agreement_number);
      }),
      created_from_drive: created,
      filled_assets: assets.filled,
      pending_assets: assets.pending,
      ingest_errors,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Could not scan Google Drive" },
      { status: 500 }
    );
  }
}
