import {
  parseAgreementRef,
  type AgreementRef,
} from "../gocardless/parse-ref";

export type DealFolderMatch = {
  agreement_number: string;
  company: string | null;
};

/** Drive folders look like `HP143 - Rochester Utilities Ltd` or `FL00016 _ LMK2`. */
export function parseDealFolderTitle(
  title: string
): DealFolderMatch | null {
  const ref = parseAgreementRef(title);
  if (!ref?.agreement_number) return null;
  if (looksLikeInstalmentOnly(title, ref)) return null;

  const stripped = title
    .replace(/^(HP|FL|L)\s*0*\d+/i, "")
    .replace(/^[\s\-–—_:]+/, "")
    .trim();

  return {
    agreement_number: ref.agreement_number,
    company: stripped || null,
  };
}

function looksLikeInstalmentOnly(title: string, ref: AgreementRef) {
  return (
    ref.instalment_number != null &&
    /^(HP|FL|L)\s*0*\d+\s*[\/\-]\s*0*\d+\s*$/i.test(title.trim())
  );
}

export function pickFolderForAgreement(
  agreementNumber: string,
  folders: { id: string; name: string; modifiedTime?: string }[]
) {
  const matches = folders.filter((folder) => {
    const parsed = parseDealFolderTitle(folder.name);
    return parsed?.agreement_number === agreementNumber;
  });
  matches.sort((a, b) =>
    String(b.modifiedTime || "").localeCompare(String(a.modifiedTime || ""))
  );
  return matches[0] || null;
}
