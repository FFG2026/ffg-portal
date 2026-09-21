import { createSign } from "crypto";
import { DRIVE_READONLY_SCOPE, GOOGLE_TOKEN_URL } from "./oauth";

export type ServiceAccount = {
  client_email: string;
  private_key: string;
};

export function parseServiceAccountJson(raw: string): ServiceAccount | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    const email = String(parsed.client_email || "").trim();
    let key = String(parsed.private_key || "");
    key = key.replace(/\\n/g, "\n");
    if (!email || !key.includes("BEGIN")) return null;
    return { client_email: email, private_key: key };
  } catch {
    return null;
  }
}

export function serviceAccountFromEnv() {
  return parseServiceAccountJson(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "");
}

export async function accessTokenFromServiceAccount(account: ServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" })
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: account.client_email,
      scope: DRIVE_READONLY_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  ).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const jwt = `${header}.${payload}.${signer.sign(account.private_key, "base64url")}`;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description || json.error || "Google service account token failed"
    );
  }
  return String(json.access_token);
}
