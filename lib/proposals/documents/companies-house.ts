/** Companies House lookups used to pre-fill the finance documents. */

export type CompanyForDocs = {
  name: string;
  number: string;
  registeredOffice: string;
  registeredOfficeParts: { line1: string; line2: string; postcode: string };
  registeredIn: string;
  directors: Array<{ name: string; birth: string; address: string }>;
};

const BASE = "https://api.company-information.service.gov.uk";

const titleCase = (s: string) =>
  s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_m, a, b) => a + b.toUpperCase());

/** "SMITH, John Paul" -> "John Paul Smith". */
export function displayOfficerName(raw: string) {
  const [surname, rest] = String(raw || "").split(",").map((s) => s.trim());
  return titleCase([rest, surname].filter(Boolean).join(" "));
}

const addr = (a: any) =>
  [a?.premises, a?.address_line_1, a?.address_line_2, a?.locality, a?.region, a?.postal_code]
    .filter(Boolean)
    .join(", ");

export async function lookupCompanyForDocs(number: string): Promise<CompanyForDocs | null> {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key || !number) return null;
  const headers = { Authorization: "Basic " + Buffer.from(`${key}:`).toString("base64") };
  try {
    const [cRes, oRes] = await Promise.all([
      fetch(`${BASE}/company/${encodeURIComponent(number)}`, { headers, cache: "no-store" }),
      fetch(`${BASE}/company/${encodeURIComponent(number)}/officers?items_per_page=100`, { headers, cache: "no-store" }),
    ]);
    if (!cRes.ok) return null;
    const c: any = await cRes.json();
    const o: any = oRes.ok ? await oRes.json() : { items: [] };
    const ro = c.registered_office_address || {};
    const directors = (o.items || [])
      .filter((i: any) => !i.resigned_on && /director/i.test(String(i.officer_role || "")))
      .map((i: any) => ({
        name: displayOfficerName(i.name),
        birth: i.date_of_birth?.year
          ? `${String(i.date_of_birth.month || "").padStart(2, "0")}/${i.date_of_birth.year}`
          : "",
        address: addr(i.address),
      }));
    return {
      name: String(c.company_name || ""),
      number: String(c.company_number || number),
      registeredOffice: addr(ro),
      registeredOfficeParts: {
        line1: [ro.premises, ro.address_line_1].filter(Boolean).join(" "),
        line2: [ro.address_line_2, ro.locality, ro.region].filter(Boolean).join(", "),
        postcode: String(ro.postal_code || ""),
      },
      registeredIn: c.jurisdiction === "scotland" ? "Scotland" : c.jurisdiction === "northern-ireland" ? "Northern Ireland" : "England and Wales",
      directors,
    };
  } catch {
    return null;
  }
}
