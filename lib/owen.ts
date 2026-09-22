export function normalizePersonName(name: string | null | undefined) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim();
}

/** Owner figures page — Owen Brunning only. */
export function isOwenBrunning(user: {
  email?: string | null;
  name?: string | null;
} | null | undefined) {
  const email = String(user?.email || "").trim().toLowerCase();
  const name = normalizePersonName(user?.name);
  if (name === "owen brunning") return true;
  if (email === "olb@ffg.finance") return true;
  if (email === "owen@ffg.finance" || email === "owen@dcfgroup.co.uk") {
    return true;
  }
  return false;
}
