import { HAVE } from "./types";
import { PG_TEMPLATE_B64 } from "./pg-template";
import { loadTemplate, setText, ukDate } from "./pdf-util";
import type { PgData } from "./types";

/** One Personal Guarantee (unlimited) for one director. */
export async function fillPersonalGuarantee(d: PgData): Promise<Uint8Array> {
  const { doc, form } = await loadTemplate(PG_TEMPLATE_B64);
  const nameDob = [d.guarantorName, d.guarantorDob ? `DOB ${ukDate(d.guarantorDob) || d.guarantorDob}` : ""]
    .filter(Boolean)
    .join(" ");
  setText(form, "Text3", nameDob);
  setText(form, "Text4", d.guarantorAddress);
  setText(form, "Text5.0", d.companyName);
  setText(form, "Text5.2", d.companyAddress);
  setText(form, "Text5.4", d.registeredIn || "England");
  setText(form, "Text5.5", d.companyNumber);
  setText(form, "Text5.6", d.registeredOffice || d.companyAddress);
  setText(form, "Text9.1.1", HAVE.funderEmail);
  form.updateFieldAppearances();
  return doc.save();
}
