import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { fillHirePurchaseAgreement, hpFinancials } from "./fill-hp";
import { fillPersonalGuarantee } from "./fill-pg";
import { buildApprovalPdf } from "./approval-pdf";
import { displayOfficerName } from "./companies-house";

test("HP financial block: VAT is paid up front so (c)-(f) is the net lend", () => {
  const f = hpFinancials({ cashPrice: 15500, vat: 3100, deposit: 1900 });
  assert.equal(f.c, 18600);
  assert.equal(f.d, 5000);
  assert.equal(f.g, 13600);
});

test("HP agreement fills the form fields", async () => {
  const bytes = await fillHirePurchaseAgreement({
    agreementNumber: "HP100", hirerName: "TEST LTD", companyNumber: "123", email: "a@b.co", contactName: "A Person", phone: "07", addressLine1: "1 Road", addressLine2: "Town", postcode: "AB1 2CD",
    goods: [{ description: "Van", condition: "New" }], cashPrice: 10000, vat: 2000, deposit: 1000, documentationFee: 195, termMonths: 36, monthly: 300, optionFee: 100, supplierName: "SUPP", signatoryName: "A Person", signatoryPosition: "Director",
  });
  const form = (await PDFDocument.load(bytes)).getForm();
  assert.equal(form.getTextField("Text1").getText(), "TEST LTD");
  assert.equal(form.getTextField("g").getText(), "£ 9,000.00");
  assert.equal(form.getDropdown("Dropdown37").getSelected()[0], "Monthly");
});

test("personal guarantee fills guarantor and company", async () => {
  const bytes = await fillPersonalGuarantee({ guarantorName: "A Person", guarantorDob: "1980-02-03", guarantorAddress: "1 Road", companyName: "TEST LTD", companyNumber: "123", companyAddress: "2 Road" });
  const form = (await PDFDocument.load(bytes)).getForm();
  assert.equal(form.getTextField("Text3").getText(), "A Person DOB 03/02/1980");
  assert.equal(form.getTextField("Text5.5").getText(), "123");
});

test("approval record builds and survives characters outside WinAnsi", async () => {
  const bytes = await buildApprovalPdf({
    agreementNumber: "HP100", company: "TEST LTD", companyNumber: "123", product: "Hire purchase", asset: "Van", supplier: "S",
    proposal: [["Cash price", "£1.00"]], agreed: [], decision: "Approved", decidedBy: "Owen", decidedAt: new Date().toISOString(), notes: "Approved – 3 guarantees − fine ✓",
    checks: [{ label: "Monthly payment", level: "review", detail: "Email says £449.78 – gives £445.83." }], raisedBy: "Owen",
  });
  assert.ok((await PDFDocument.load(bytes)).getPageCount() >= 1);
});

test("Companies House officer names are flipped and title-cased", () => {
  assert.equal(displayOfficerName("MURRELL, Hayden John"), "Hayden John Murrell");
  assert.equal(displayOfficerName("O'BRIEN, mary-jane"), "Mary-Jane O'Brien");
});
