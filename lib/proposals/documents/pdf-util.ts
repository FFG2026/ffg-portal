import { PDFDocument, PDFDropdown, PDFForm, PDFTextField } from "pdf-lib";

/** Standard PDF fonts only cover WinAnsi: swap the few characters that don't fit. */
export function winAnsi(text: unknown): string {
  return String(text ?? "")
    .replace(/[−–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
}

export const money = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? ""
    : `£ ${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const ukDate = (iso: string | Date | null | undefined) => {
  if (!iso) return "";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
};

export async function loadTemplate(b64: string) {
  const doc = await PDFDocument.load(Buffer.from(b64, "base64"));
  return { doc, form: doc.getForm() };
}

/** Fixes the text size of a field. Some template fields have auto-size (0) or no size at all, which renders at wildly different sizes. */
export function fixFontSize(field: PDFTextField | PDFDropdown, size: number) {
  const da = `/Helv ${size} Tf 0 g`;
  try {
    field.setFontSize(size);
  } catch {
    field.acroField.setDefaultAppearance(da);
  }
  for (const w of field.acroField.getWidgets()) {
    try {
      w.setDefaultAppearance(da);
    } catch {
      /* widget keeps the field's appearance string */
    }
  }
}

export function setText(form: PDFForm, name: string, value: unknown, size = 10) {
  const text = winAnsi(value);
  if (!text) return;
  const field = form.getTextField(name);
  field.setText(text);
  fixFontSize(field, size);
}
