import {
  isPlaceholderAsset,
  parseAgreementPdfText,
  parseEquipmentScheduleAssets,
  parseLeaseAgreementAssets,
} from "./parse-agreement-pdf";

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

const sevenDays = parseAgreementPdfText(`
Full Name: 7 DAYS RECRUITMENT & SERVICES LTD
Email: agnaldo@7daysservices.com
Moin Contact Name: Agnaldo Da Silva Espindola
Address: Unit 4 Cliffside Estate
Telephone Number: 07912 345678
`);
assert(sevenDays.contact_name === "Agnaldo Da Silva Espindola", sevenDays.contact_name || "7 days contact");
assert(sevenDays.email === "agnaldo@7daysservices.com", "7 days email");
assert(sevenDays.phone === "07912345678", "7 days phone");

const flLessee = parseAgreementPdfText(`
Email address for notices:
david@asbestosgone.co.uk
Agreement No.:
FL00005 Telephone No: 07455285505 The The Goods
`);
assert(flLessee.email === "david@asbestosgone.co.uk", "FL email");
assert(flLessee.phone === "07455285505", "FL phone");
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
assert(
  hp141.asset_description?.includes("Mercedes") === true,
  hp141.asset_description || "hp141 asset"
);

const hp132 = parseAgreementPdfText(`
OF MANUFACTURE
Massey Ferguson tractor 6490 RX57FFH USED 19,000.00
Separate Goods Schedule attached? Yes
FINANCIAL DETAILS AMOUNT (£)
`);
assert(
  hp132.asset_description === "Massey Ferguson tractor 6490 RX57FFH",
  hp132.asset_description || "hp132"
);

const hp133 = parseAgreementPdfText(`
OF MANUFACTURE
Citroen Berlingo M VR7EDYHT8SJ813815 CF75HWU New 2026 21,400.00
Citroen Berlingo M VR7EDYHT7SJ813823 CF75HZZ New 2026 21,400.00
As above
Separate Goods Schedule attached? Yes
FINANCIAL DETAILS AMOUNT (£)
`);
assert(
  hp133.asset_description?.includes("CF75HWU") === true &&
    hp133.asset_description?.includes("CF75HZZ") === true,
  hp133.asset_description || "hp133"
);

const hp135 = parseAgreementPdfText(`
OF MANUFACTURE
DrivePro2 + 1x IVS Fix - Support
Separate Goods Schedule attached? Yes
FINANCIAL DETAILS AMOUNT (£)
`);
assert(
  hp135.asset_description === "DrivePro2 + 1x IVS Fix - Support",
  hp135.asset_description || "hp135"
);

const schedule = parseEquipmentScheduleAssets(`
EQUIPMENT SCHEDULE
Agreement No:
HP00134
Description of Goods New/Used Registration Number Chassis No. / Serial No. Date of Manufacture/
Date of Registration
Ford Fiesta
Used
LD14 YZJ
VW Transporter T6
Used
RJ19JXL
RENAULT TRUCKS MASTER 35 LWB
Used
YY71OJW
Confirmed By Hirer (Full Name): Signature: Scarlett Mahan
Final Audit Report 2026-04-09
`);
assert(schedule?.includes("Ford Fiesta LD14 YZJ") === true, schedule || "ford");
assert(schedule?.includes("VW Transporter T6 RJ19JXL") === true, schedule || "vw");
assert(
  parseAgreementPdfText(schedule ? `EQUIPMENT SCHEDULE\nDate of Registration\nFord Fiesta\nUsed\nLD14 YZJ\nConfirmed By Hirer\n` : "").asset_description?.includes("Ford Fiesta") === true,
  "schedule via agreement parser"
);

assert(
  parseAgreementPdfText(`
OF MANUFACTURE
Carried Over from HP122
Separate Goods Schedule attached? Yes
FINANCIAL DETAILS AMOUNT (£)
COST OF GOODS (£)
Ranger Wildtrak Double Cab 2.0 6FPPXXMJ2PNY76197 YP22HVM
This agreement is an invoice for VAT purposes
`).asset_description?.includes("Ranger Wildtrak") === true,
  "hp121 cost of goods fallback"
);
assert(isPlaceholderAsset(null), "null asset");
assert(isPlaceholderAsset("GG07"), "gg number is a placeholder");
assert(isPlaceholderAsset("Prior Construction Limited"), "company name only");
assert(!isPlaceholderAsset("FIAT 500 1.0 Dolcevita"), "real asset");

const fl13 = parseLeaseAgreementAssets(`
Lease Agreement Non Regulated
The Goods (Make/Model) New/Used Registration No.(s)
(if applicable)
Transit Leader Van 350 L3 2.0L EcoBlue 1 Used
WO24NKL - WF0EXXTTRERK43518
Supplier Name:
Haynes Bros Limited
`);
assert(
  fl13?.includes("Transit Leader Van") === true,
  fl13 || "fl13 lease goods"
);
assert(
  parseAgreementPdfText(`
Lease Agreement Non Regulated
The Goods (Make/Model) New/Used Registration No.(s)
(if applicable)
Mercedes Arcos - 24/09/2020 Used
GN70XXM - WIT96420020461219
Supplier Name:
EAST KENT RECYCLING LTD
`).asset_description?.includes("Mercedes") === true,
  "fl15 lease goods"
);

console.log("parse-agreement-pdf tests ok");
