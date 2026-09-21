import { createHmac, timingSafeEqual } from "crypto";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const DRIVE_READONLY_SCOPE =
  "https://www.googleapis.com/auth/drive.readonly";

export function googleClientId() {
  return process.env.GOOGLE_CLIENT_ID || "";
}

export function googleClientSecret() {
  return process.env.GOOGLE_CLIENT_SECRET || "";
}

export function googleOAuthConfigured() {
  return Boolean(googleClientId() && googleClientSecret());
}

export function googleCallbackUrl(request: Request) {
  const fromEnv = (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    ""
  ).replace(/\/$/, "");
  if (fromEnv) return `${fromEnv}/api/admin/google/callback`;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}/api/admin/google/callback`;
}

function signingKey() {
  return process.env.ADMIN_SECRET || googleClientSecret() || "";
}

export function signOAuthState() {
  const payload = Buffer.from(
    JSON.stringify({ t: Date.now(), n: Math.random().toString(36).slice(2) })
  ).toString("base64url");
  const sig = createHmac("sha256", signingKey()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyOAuthState(state: string) {
  const parts = String(state || "").split(".");
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expected = createHmac("sha256", signingKey())
    .update(payload)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  if (!timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof data?.t !== "number") return false;
    return Date.now() - data.t < 20 * 60 * 1000;
  } catch {
    return false;
  }
}

export function googleAuthUrl(request: Request) {
  const params = new URLSearchParams({
    client_id: googleClientId(),
    redirect_uri: googleCallbackUrl(request),
    response_type: "code",
    scope: `${DRIVE_READONLY_SCOPE} email profile`,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: signOAuthState(),
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(request: Request, code: string) {
  const body = new URLSearchParams({
    code,
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
    redirect_uri: googleCallbackUrl(request),
    grant_type: "authorization_code",
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error_description || json.error || "Google token exchange failed");
  }
  return json as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
  };
}

export async function refreshAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error_description || json.error || "Google token refresh failed");
  }
  return json as { access_token: string; expires_in: number };
}

export async function googleUserEmail(accessToken: string) {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return "";
  const json = await res.json();
  return String(json.email || "");
}
