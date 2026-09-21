/** FFG GoCardless descriptions look like HP41/1, FL16/4, L2/12. */

const INSTALMENT_REF =
  /\b(HP|FL|GG|L)\s*0*(\d+)\s*[\/\-]\s*0*(\d+)\b/i;
const AGREEMENT_ONLY_REF = /\b(HP|FL|GG|L)\s*0*(\d+)\b/i;

export type AgreementRef = {
  agreement_number: string;
  instalment_number: number | null;
};

export function normalizeAgreementNumber(type: string, n: string | number) {
  const t = type.toUpperCase();
  const num = Number(n);
  if (t === "GG") return `GG${String(num).padStart(2, "0")}`;
  return `${t}${num}`;
}

const NUMBERED = /^(HP|FL|GG|L)(\d+)$/i;

export function compareAgreementNumber(a: string, b: string) {
  const ma = String(a || "").toUpperCase().match(NUMBERED);
  const mb = String(b || "").toUpperCase().match(NUMBERED);
  if (ma && mb) {
    if (ma[1] !== mb[1]) return ma[1].localeCompare(mb[1]);
    return Number(ma[2]) - Number(mb[2]);
  }
  return String(a || "").localeCompare(String(b || ""), "en", { numeric: true });
}

export function parseAgreementRef(
  ...texts: (string | null | undefined)[]
): AgreementRef | null {
  const blob = texts.filter(Boolean).join(" ");
  if (!blob) return null;

  const withInstalment = blob.match(INSTALMENT_REF);
  if (withInstalment) {
    return {
      agreement_number: normalizeAgreementNumber(
        withInstalment[1],
        withInstalment[2]
      ),
      instalment_number: Number(withInstalment[3]),
    };
  }

  const agreementOnly = blob.match(AGREEMENT_ONLY_REF);
  if (agreementOnly) {
    return {
      agreement_number: normalizeAgreementNumber(
        agreementOnly[1],
        agreementOnly[2]
      ),
      instalment_number: null,
    };
  }

  return null;
}

export function parseAgreementRefFromPayment(payment: {
  description?: string | null;
  reference?: string | null;
  metadata?: Record<string, unknown> | null;
}): AgreementRef | null {
  const meta = payment.metadata || {};
  const metaBits = [
    meta.agreement,
    meta.agreement_number,
    meta.description,
    meta.reference,
    meta.instalment,
    meta.instalment_number,
  ]
    .filter((v) => v != null && v !== "")
    .map((v) => String(v));

  const slashFirst = parseAgreementRef(
    payment.description,
    payment.reference,
    ...metaBits
  );
  if (slashFirst?.instalment_number != null) return slashFirst;

  const combined = [payment.description, payment.reference, ...metaBits];
  const instalmentMeta = meta.instalment ?? meta.instalment_number;
  const agreementOnly = parseAgreementRef(...combined);
  if (agreementOnly && instalmentMeta != null && instalmentMeta !== "") {
    const n = Number(instalmentMeta);
    if (Number.isFinite(n) && n > 0) {
      return { ...agreementOnly, instalment_number: n };
    }
  }
  return slashFirst || agreementOnly;
}
