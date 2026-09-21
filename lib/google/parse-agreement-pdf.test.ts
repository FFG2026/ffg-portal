import { parseAgreementPdfText } from "./parse-agreement-pdf";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const SAMPLE = `
HIRER DETAILS
Full Name: ROCHESTER UTILITIES LTDCompany Registration Number (if applicable):
09746075
Email:
gavin@rochesterutilities.co.uk
Main Contact Name:
GAVIN COWARD
Telephone Number:
01634710293
OF MANUFACTURE
Audi RS3 Sportback Carbon Vorsprung WUAZZZGY1TA903319 SB75SNB USED 31/10/2025 66,000.00
Separate Goods Schedule attached? Yes
FINANCIAL DETAILS AMOUNT (£)
a) Cash price (excluding VAT)
66,000.00
d) Less: cash deposit
1,630.88
f) Total deposit (d) + (e)
1,630.88
g) Balance financed (c) - (f)
64,369.12
h) Documentation fee
195.00
AMOUNT OF EACH HIRER PAYMENT (£) 48 Monthly 1,630.88
Period of Hire means 48 months commencing on the Start Date.
Final Audit Report 2026-09-17
Agreement completed.
2026-09-17
`;

const parsed = parseAgreementPdfText(SAMPLE);
assert(parsed.company_name === "Rochester Utilities LTD", parsed.company_name || "company");
assert(parsed.email === "gavin@rochesterutilities.co.uk", "email");
assert(parsed.contact_name === "Gavin Coward", parsed.contact_name || "contact");
assert(parsed.phone === "01634710293", "phone");
assert(parsed.purchase_price === 66000, "price");
assert(parsed.customer_deposit === 1630.88, "deposit");
assert(parsed.total_lend === 64369.12, "lend");
assert(parsed.documentation_fee === 195, "doc");
assert(parsed.monthly_instalment === 1630.88, "monthly");
assert(parsed.term_months === 48, "term");
assert(parsed.start_date === "2026-09-17", "start");
assert(
  parsed.asset_description?.includes("Audi RS3") === true,
  parsed.asset_description || "asset"
);

const hp141 = parseAgreementPdfText(`
HIRER DETAILS
Full Name:
Luke Lawrence
Company Registration Number (if applicable):
Email:
matt@fullergrabhire.co.uk
Main Contact Name:
Address:
31 Downland walk Chatham kent ME5 8AF
Telephone Number:
07548862656
OF MANUFACTURE
Mercedes sprinter WDB9066352S344906 WU58 OCL USED 2008 8,000
AMOUNT OF EACH HIRER PAYMENT (£) 24 Monthly 376.59
Period of Hire means 24 months commencing on the Start Date.
`);
assert(hp141.company_name === "Luke Lawrence", hp141.company_name || "hp141 name");
assert(hp141.email === "matt@fullergrabhire.co.uk", "hp141 email is on the form but is not the hirer");
assert(hp141.monthly_instalment === 376.59, "hp141 monthly");
assert(hp141.term_months === 24, "hp141 term");

console.log("parse-agreement-pdf tests ok");
