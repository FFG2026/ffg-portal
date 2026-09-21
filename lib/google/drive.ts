import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "../supabase/fetch-all";
import { getSetting, setSetting } from "./settings";
import { parseDealFolderTitle, pickFolderForAgreement } from "./folder-match";
import { googleOAuthConfigured, refreshAccessToken } from "./oauth";
import {
  accessTokenFromServiceAccount,
  parseServiceAccountJson,
  serviceAccountFromEnv,
} from "./service-account";

export const DEFAULT_AGREEMENTS_FOLDER_ID =
  "13pGew1ioaAll792h3sCXfWbAl62rSczv";

const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
};

export async function getRefreshToken(supabase: SupabaseClient) {
  return (
    (await getSetting(supabase, "google_refresh_token")) ||
    process.env.GOOGLE_REFRESH_TOKEN ||
    ""
  );
}

export function driveServiceAccount() {
  return serviceAccountFromEnv();
}

export async function resolveServiceAccount(supabase: SupabaseClient) {
  const fromEnv = serviceAccountFromEnv();
  if (fromEnv) return fromEnv;
  return parseServiceAccountJson(
    await getSetting(supabase, "google_service_account_json")
  );
}

export async function isDriveConnected(supabase: SupabaseClient) {
  if (await resolveServiceAccount(supabase)) return true;
  return Boolean(await getRefreshToken(supabase));
}

export async function getAgreementsFolderId(supabase: SupabaseClient) {
  return (
    (await getSetting(supabase, "google_agreements_folder_id")) ||
    process.env.GOOGLE_AGREEMENTS_FOLDER_ID ||
    DEFAULT_AGREEMENTS_FOLDER_ID
  );
}

export async function driveAccessToken(supabase: SupabaseClient) {
  const service = await resolveServiceAccount(supabase);
  if (service) {
    return accessTokenFromServiceAccount(service);
  }
  const refresh = await getRefreshToken(supabase);
  if (!refresh) {
    throw new Error("Google Drive is not connected.");
  }
  if (!googleOAuthConfigured() && !process.env.GOOGLE_CLIENT_ID) {
    throw new Error(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET need to be set on the site."
    );
  }
  const tokens = await refreshAccessToken(refresh);
  return tokens.access_token;
}

async function driveGet(accessToken: string, url: URL) {
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error?.message || `Drive request failed (${res.status})`);
  }
  return json;
}

export async function listDriveChildren(
  accessToken: string,
  folderId: string,
  foldersOnly = false
) {
  const files: DriveFile[] = [];
  let pageToken = "";
  while (true) {
    const url = new URL(DRIVE_FILES);
    const clauses = [`'${folderId}' in parents`, "trashed = false"];
    if (foldersOnly) {
      clauses.push("mimeType = 'application/vnd.google-apps.folder'");
    }
    url.searchParams.set("q", clauses.join(" and "));
    url.searchParams.set("pageSize", "1000");
    url.searchParams.set(
      "fields",
      "nextPageToken, files(id,name,mimeType,modifiedTime,size,webViewLink)"
    );
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const json = await driveGet(accessToken, url);
    files.push(...(json.files || []));
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }
  return files;
}

export async function scanDealFolders(supabase: SupabaseClient) {
  const accessToken = await driveAccessToken(supabase);
  const folderId = await getAgreementsFolderId(supabase);
  const folders = await listDriveChildren(accessToken, folderId, true);

  const agreements = await fetchAllRows(() =>
    supabase
      .from("agreements")
      .select("id, agreement_number, google_folder_id")
  );

  let linked = 0;
  const unmatchedFolders: { name: string; id: string; company: string | null }[] =
    [];
  const usedIds = new Set<string>();

  for (const agreement of agreements) {
    const folder = pickFolderForAgreement(agreement.agreement_number, folders);
    if (!folder) continue;
    usedIds.add(folder.id);
    if (agreement.google_folder_id === folder.id) {
      linked += 1;
      continue;
    }
    const { error } = await supabase
      .from("agreements")
      .update({
        google_folder_id: folder.id,
        google_folder_name: folder.name,
      })
      .eq("id", agreement.id);
    if (error) throw error;
    linked += 1;
  }

  for (const folder of folders) {
    if (usedIds.has(folder.id)) continue;
    const parsed = parseDealFolderTitle(folder.name);
    unmatchedFolders.push({
      name: folder.name,
      id: folder.id,
      company: parsed?.company || null,
    });
  }

  const missingInDrive = agreements
    .filter((a) => {
      const folder = pickFolderForAgreement(a.agreement_number, folders);
      return !folder;
    })
    .map((a) => a.agreement_number);

  await setSetting(supabase, "google_last_scan", new Date().toISOString());

  return {
    folder_count: folders.length,
    linked,
    unmatched_folders: unmatchedFolders.slice(0, 80),
    missing_in_drive: missingInDrive.slice(0, 80),
  };
}

export async function filesForAgreement(
  supabase: SupabaseClient,
  agreement: {
    agreement_number: string;
    google_folder_id?: string | null;
    google_folder_name?: string | null;
  }
) {
  const accessToken = await driveAccessToken(supabase);
  let folderId = agreement.google_folder_id || "";
  let folderName = agreement.google_folder_name || "";

  if (!folderId) {
    const parentId = await getAgreementsFolderId(supabase);
    const folders = await listDriveChildren(accessToken, parentId, true);
    const match = pickFolderForAgreement(agreement.agreement_number, folders);
    if (match) {
      folderId = match.id;
      folderName = match.name;
      await supabase
        .from("agreements")
        .update({
          google_folder_id: match.id,
          google_folder_name: match.name,
        })
        .eq("agreement_number", agreement.agreement_number);
    }
  }

  if (!folderId) {
    return {
      connected: true,
      folder: null as null,
      files: [] as DriveFile[],
    };
  }

  const files = await listDriveChildren(accessToken, folderId, false);
  const parsed = parseDealFolderTitle(folderName);
  return {
    connected: true,
    folder: {
      id: folderId,
      name: folderName || "Deal folder",
      company: parsed?.company || null,
      url: `https://drive.google.com/drive/folders/${folderId}`,
    },
    files: files
      .filter((f) => f.mimeType !== "application/vnd.google-apps.folder")
      .sort((a, b) =>
        String(b.modifiedTime || "").localeCompare(String(a.modifiedTime || ""))
      ),
  };
}

export function fileKind(mimeType: string) {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) {
    return "Spreadsheet";
  }
  if (mimeType.includes("document") || mimeType.includes("msword")) return "Document";
  if (mimeType.includes("presentation")) return "Presentation";
  return "File";
}
