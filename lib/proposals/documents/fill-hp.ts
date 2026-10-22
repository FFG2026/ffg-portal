import { rgb, StandardFonts } from "pdf-lib";
import { HP_TEMPLATE_B64 } from "./hp-template";
import { loadTemplate, money, setText } from "./pdf-util";
import { winAnsi } from "./pdf-util";
import type { HpData } from "./types";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Financial details follow the FFG convention: net lend = cash price - deposit,
 * and VAT is paid up front, so the cash deposit on the form is the customer's
 * deposit plus the VAT. That makes (c) - (f) equal the net lend.
 */
export function hpFinancials(d: Pick<HpData, "cashPrice" | "vat" | "deposit">) {
  const a = r2(d.cashPrice);
  const b = d.vat === null ? 0 : r2(d.vat);
  const c = r2(a + b);
  const dep = r2(d.deposit + b);
  const e = 0;
  const f = r2(dep + e);
  const g = r2(c - f);
  return { a, b, c, d: dep, e, f, g };
}

export async function fillHirePurchaseAgreement(d: HpData): Promise<Uint8Array> {
  const { doc, form } = await loadTemplate(HP_TEMPLATE_B64);
  const fin = hpFinancials(d);

  setText(form, "Text1", d.hirerName);
  setText(form, "Text2", d.companyNumber);
  setText(form, "Text5", d.email);
  setText(form, "Text3", d.contactName);
  setText(form, "Text4", d.phone);
  setText(form, "Text7", d.addressLine1);
  setText(form, "Text8", d.addressLine2);
  setText(form, "Text9", d.postcode);

  // Goods rows: description, chassis, reg, new/used, date of reg, cost.
  const rows = [
    ["Text10", "Text11", "Text12", "Text13", "Text14", "Text15"],
    ["Text16", "Text17", "Text18", "Text19", "Text20", "Text21"],
    ["Text22", "Text23", "Text24", "Text25", "Text26", "Text27"],
    ["Text28", "Text29", "Text30", "Text31", "Text32", "Text33"],
  ];
  d.goods.slice(0, rows.length).forEach((g, i) => {
    const [desc, chassis, reg, cond, regDate, cost] = rows[i];
    setText(form, desc, g.description);
    // The description box is narrow: shrink long descriptions so they fit on one line.
    if (g.description && g.description.length > 22) {
      try { form.getTextField(desc).setFontSize(g.description.length > 34 ? 7 : 8.5); } catch { /* keep template size */ }
    }
    setText(form, chassis, g.chassis);
    setText(form, reg, g.reg);
    setText(form, cond, g.condition);
    setText(form, regDate, g.regDate);
    setText(form, cost, g.cost !== null && g.cost !== undefined ? money(g.cost) : "");
  });
  if (d.goods.length === 1 && d.goods[0].cost === undefined) setText(form, "Text15", money(fin.c));

  setText(form, "a", money(fin.a));
  setText(form, "b", money(fin.b));
  setText(form, "c", money(fin.c));
  setText(form, "d", money(fin.d));
  setText(form, "e", money(fin.e));
  setText(form, "f", money(fin.f));
  setText(form, "g", money(fin.g));
  if (d.documentationFee !== null) setText(form, "i", money(d.documentationFee));

  setText(form, "Text36", String(d.termMonths));
  const freq = form.getDropdown("Dropdown37");
  freq.select("Monthly");
  try { freq.setFontSize(10); } catch { /* keep template size */ }
  setText(form, "Text38", money(d.monthly));
  setText(form, "Text56", d.optionFee.toFixed(2));
  setText(form, "Text57", String(d.termMonths));
  setText(form, "Text58", d.supplierName);
  setText(form, "Text59", d.supplierAddress1);
  setText(form, "Text60", d.supplierAddress2);
  setText(form, "Text62", d.supplierPostcode);
  setText(form, "Text34", d.goodsLocation1);
  setText(form, "Text35", d.goodsLocationPostcode);

  // Page 2: insurance (all optional - often not known until closer to delivery).
  const ins = d.insurer;
  if (ins) {
    setText(form, "Text63", ins.name);
    setText(form, "Text64", ins.address1);
    setText(form, "Text65", ins.address2);
    setText(form, "Text66", ins.address3);
    setText(form, "Text67", ins.postcode);
    setText(form, "Text68", ins.policy);
    // Expiry date goes one digit per box: dd / mm / yyyy.
    const digits = String(ins.expiry || "").replace(/\D/g, "");
    if (digits.length === 8) {
      ["Text69", "Text70", "Text71", "Text72", "Text73", "Text74", "Text75", "Text76"].forEach((name, i) => setText(form, name, digits[i]));
    }
  }

  // Page 2: hirer signatory (name, position, mobile) - signature and date stay blank.
  setText(form, "Text80", d.signatoryName);
  setText(form, "Text81", d.signatoryPosition);
  setText(form, "Text82", d.phone);

  form.updateFieldAppearances();

  // The agreement number box at the top right is not a form field.
  const page = doc.getPages()[0];
  const font = await doc.embedFont(StandardFonts.Helvetica);
  if (d.agreementNumber) {
    page.drawText(winAnsi(d.agreementNumber), { x: 456, y: 794, size: 11, font, color: rgb(0, 0, 0) });
  }
  return doc.save();
}
