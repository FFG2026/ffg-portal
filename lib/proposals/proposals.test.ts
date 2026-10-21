import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { monthlyPayment, impliedRatePct, priceProposal } from "./calc";
import { parseProposalText, parseMoney } from "./parse-proposal";
import { readEml, readMsg } from "./read-email";

const body = [
  "New Proposal Form Submission",
  "A new quote has been generated and sent by Zara Sargun.",
  "Quote Details",
  "Customer\t OUTLINE CONSTRUCTION SOUTH EAST LIMITED (16521629)\t ",
  "Sent To\t zss@dcfgroup.co.uk\t ",
  "Product\t Hire Purchase\t ",
  "Asset Details\t Ford Transit Custom (New)\t ",
  "Cash Price\t £15,500.00\t ",
  "Deposit\t £5,000.00 (32.26%)\t ",
  "VAT\t £3,100.00 (20%)\t ",
  "Amount Financed (with commission)\t £10,920.00\t ",
  "Commission (4%)\t £420.00\t ",
  "Term\t 36 months\t ",
  "Monthly Payment\t £347.25\t ",
  "Rate %\t 9.00%\t ",
  "Supplier\t KENHIRE LIMITED (01064115)\t ",
  "Sent from the DCF calculator (Hire Purchase) by Zara Sargun",
].join("\r\n");

// --- calc
assert.ok(Math.abs(monthlyPayment(10920, 9, 36) - 347.2530806465497) < 1e-9);
assert.ok(Math.abs((impliedRatePct(10920, 347.2530806465497, 36) ?? 0) - 9) < 1e-6);
const priced = priceProposal({
  cashPrice: 15500, deposit: 5000, commissionPct: 4, commission: null, ratePct: 9, termMonths: 36,
});
assert.equal(priced.financed, 10920);
assert.equal(priced.monthly, 347.25);
assert.equal(priced.totalRepayable, 12501);
assert.equal(priced.profit, 1581);
assert.equal(monthlyPayment(1200, 0, 12), 100);

// --- parse
assert.equal(parseMoney("£15,500.00"), 15500);
const p = parseProposalText(body);
assert.equal(p.companyName, "OUTLINE CONSTRUCTION SOUTH EAST LIMITED");
assert.equal(p.companyNumber, "16521629");
assert.equal(p.sentTo, "zss@dcfgroup.co.uk");
assert.equal(p.productType, "hp");
assert.equal(p.assetDescription, "Ford Transit Custom");
assert.equal(p.assetCondition, "new");
assert.equal(p.cashPrice, 15500);
assert.equal(p.deposit, 5000);
assert.equal(p.depositPct, 32.26);
assert.equal(p.vat, 3100);
assert.equal(p.financed, 10920);
assert.equal(p.commission, 420);
assert.equal(p.commissionPct, 4);
assert.equal(p.termMonths, 36);
assert.equal(p.monthly, 347.25);
assert.equal(p.ratePct, 9);
assert.equal(p.supplierName, "KENHIRE LIMITED");
assert.equal(p.supplierNumber, "01064115");
assert.equal(p.repName, "Zara Sargun");
assert.deepEqual(p.warnings, []);

// colon-separated paste, no tabs
const colon = parseProposalText("Customer: ACME LTD (12345678)\nCash Price: £1,000.00\nTerm: 24 months\nMonthly Payment: £50\nRate %: 7.5%\nProduct: Finance Lease");
assert.equal(colon.companyNumber, "12345678");
assert.equal(colon.productType, "fl");
assert.equal(colon.ratePct, 7.5);

// junk gives warnings, not a crash
assert.ok(parseProposalText("hello").warnings.length >= 4);

// --- eml (quoted-printable html, as the calculator sends it)
const eml = [
  "From: finance@dcfgroup.co.uk",
  "To: finance@dcfgroup.co.uk",
  "Subject: =?UTF-8?Q?New_Quote_Proposal=3A_Ford_Transit_Custo?=",
  " =?UTF-8?Q?m_-_=C2=A315=2C500=2E00?=",
  "Message-ID: <abc@dcfgroup.co.uk>",
  "Content-Transfer-Encoding: quoted-printable",
  "Content-Type: text/html; charset=utf-8",
  "",
  "<table><tr><td>Customer</td><td>ACME LTD (12345678)</td></tr><tr><td>Cash Price</td><td>=C2=A31,000.00</td></tr></table>",
].join("\r\n");
const e = readEml(eml);
assert.equal(e.subject, "New Quote Proposal: Ford Transit Custom - £15,500.00");
assert.equal(e.messageId, "<abc@dcfgroup.co.uk>");
const ep = parseProposalText(e.text);
assert.equal(ep.companyNumber, "12345678");
assert.equal(ep.cashPrice, 1000);

// --- real .msg, if the fixture is around
const fixture = process.env.PROPOSAL_MSG_FIXTURE;
if (fixture && existsSync(fixture)) {
  readMsg(readFileSync(fixture)).then((m) => {
    assert.equal(m.messageId, "<50198178-a39e-bb54-92e1-8300b4c0c1c4@dcfgroup.co.uk>");
    const mp = parseProposalText(m.text);
    assert.equal(mp.companyNumber, "16521629");
    assert.equal(mp.monthly, 347.25);
    assert.deepEqual(mp.warnings, []);
    console.log("proposals.test.ts: ok (incl. .msg fixture)");
  });
} else {
  console.log("proposals.test.ts: ok");
}

// --- figure checks and acceptance email
import { figureChecks } from "./checks";
import { buildAcceptanceEmail } from "./acceptance-email";
const base = {
  cash_price: 15500, vat: 3100, deposit: 5000, commission: 420, commission_pct: 4,
  financed: 10920, term_months: 36, quoted_rate_pct: 9, quoted_monthly: 347.25,
};
const good = figureChecks(base);
assert.ok(good.filter((c) => c.level === "issue" || c.level === "review").length === 0);
assert.equal(figureChecks({ ...base, financed: 10000 }).find((c) => c.id === "financed")?.level, "issue");
assert.equal(figureChecks({ ...base, quoted_monthly: 300 }).find((c) => c.id === "monthly")?.level, "review");
assert.equal(figureChecks({ ...base, cash_price: null })[0].level, "issue");
const mail = buildAcceptanceEmail({
  repName: "Zara Sargun", companyName: "ACME LTD", productLabel: "Hire Purchase",
  assetDescription: "Ford Transit Custom", supplierName: "KENHIRE LIMITED", cashPrice: 15500,
  deposit: 5000, financed: 10920, termMonths: 36, ratePct: 9, monthly: 347.25, senderName: "Owen",
});
assert.ok(mail.body.startsWith("Hi Zara,"));
assert.ok(mail.body.includes("£347.25"));
assert.ok(mail.subject.includes("ACME LTD"));
