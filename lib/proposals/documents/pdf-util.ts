import { PDFDocument, PDFForm } from "pdf-lib";

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

export function setText(form: PDFForm, name: string, value: unknown) {
  const text = winAnsi(value);
  if (!text) return;
  const field = form.getTextField(name);
  field.setText(text);
  try { field.setFontSize(10); } catch { /* no default appearance string: keep the template size */ }
}
