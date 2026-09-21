"use client";

import { useState } from "react";
import AdminShell, { adminHeaders, currentAdminBook } from "../AdminShell";

export default function NewDealPage() {
  return (
    <AdminShell>
      <NewDealInner />
    </AdminShell>
  );
}

function NewDealInner() {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [importError, setImportError] = useState("");
  const [form, setForm] = useState({
    agreement_number: "",
    agreement_type: currentAdminBook() === "gg" ? "GG" : "HP",
    company_name: "",
    contact_name: "",
    email: "",
    phone: "",
    asset_description: "",
    purchase_price: "",
    customer_deposit: "",
    total_lend: "",
    commission: "",
    documentation_fee: "",
    monthly_instalment: "",
    term_months: "36",
    start_date: "",
    gocardless_mandate_id: "",
  });

  const set = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    setError("");
    try {
      const res = await fetch("/api/admin/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save");
      setMsg(
        currentAdminBook() === "gg"
          ? `${json.agreement_number} is on the Glacier Gem book with ${json.instalments} instalments. Open the deal sheet and use Record a payment when money lands.`
          : `${json.agreement_number} is on the book with ${json.instalments} instalments. Collections will tick once GoCardless picks them up.`
      );
      setForm((prev) => ({
        ...prev,
        agreement_number: "",
        company_name: "",
        contact_name: "",
        email: "",
        phone: "",
        asset_description: "",
        purchase_price: "",
        customer_deposit: "",
        total_lend: "",
        commission: "",
        documentation_fee: "",
        monthly_instalment: "",
        gocardless_mandate_id: "",
      }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const uploadBook = async (file: File) => {
    setImporting(true);
    setImportMsg("");
    setImportError("");
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const gg = currentAdminBook() === "gg";
      const wb = XLSX.read(buf, {
        type: "array",
        cellDates: true,
        cellStyles: gg,
      });
      let deals;
      if (gg) {
        const { parseGlacierGemTotals, glacierExtrasFor, glacierAgreementNumber } =
          await import("../../../lib/glacier-gem-book");
        const totalsName =
          wb.SheetNames.find((n) => /total/i.test(n)) || wb.SheetNames[0];
        const sh = wb.Sheets[totalsName];
        const range = XLSX.utils.decode_range(sh["!ref"] || "A1");
        const totals: unknown[][] = [];
        for (let r = range.s.r; r <= range.e.r; r++) {
          const row: unknown[] = [];
          for (let c = range.s.c; c <= range.e.c; c++) {
            row[c] = sh[XLSX.utils.encode_cell({ r, c })] || null;
          }
          totals.push(row);
        }
        const dealSheets: Record<string, unknown[][]> = {};
        const extra: Record<string, ReturnType<typeof glacierExtrasFor>> = {};
        for (const name of wb.SheetNames) {
          if (/^GG\s*\d+/i.test(name)) {
            dealSheets[name.toUpperCase().replace(/\s+/g, "")] =
              XLSX.utils.sheet_to_json(wb.Sheets[name], {
                header: 1,
                raw: true,
                defval: "",
              }) as unknown[][];
          }
        }
        for (let i = 1; i <= 40; i++) {
          extra[glacierAgreementNumber(i)] = glacierExtrasFor(
            glacierAgreementNumber(i)
          );
        }
        deals = parseGlacierGemTotals(totals as never, dealSheets, extra);
      } else {
        const sheets: Record<string, unknown[][]> = {};
        for (const name of wb.SheetNames) {
          sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], {
            header: 1,
            raw: true,
            defval: null,
          }) as unknown[][];
        }
        const { parseWorkbookSheets } = await import("../../../lib/spreadsheet");
        deals = parseWorkbookSheets(sheets);
      }
      const apply = await fetch("/api/admin/import-book", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({ deals, apply: true }),
      });
      const json = await apply.json();
      if (!apply.ok) throw new Error(json.error || "Import failed");
      const created = (json.created || []).length;
      const updated = (json.updated || []).length;
      const errors = (json.errors || []).length;
      setImportMsg(
        `Read ${deals.length} deals from ${file.name}. Added ${created}, updated ticks on ${updated}, marked ${json.marked_paid} instalments paid.${
          errors ? ` ${errors} tab(s) need a look.` : ""
        }`
      );
    } catch (err: any) {
      setImportError(err.message || "Could not import that workbook.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <div className="admin-kicker">Origination</div>
      <h1>Load a new deal</h1>
      <p className="admin-lead">
        {currentAdminBook() === "gg"
          ? "New Glacier Gem deals should come from the Glacier Gem Ltd Drive folder (GG15 - Company), then scan on the Drive page. Use this form to type one in. On the deal sheet, Record a payment ticks the next instalment — there is no GoCardless."
          : "New deals should come from Google Drive — put the signed pack in Agreements as HP143 - Company, then scan on the Drive page. Use this form if you need to type one in, or to correct a deal on lookup with Amend this deal."}
      </p>
      <div className="admin-card" style={{ marginBottom: 28 }}>
        <h2>Or drop in the deal book</h2>
        <p className="admin-lead">
          {currentAdminBook() === "gg"
            ? "The Agreement Totals workbook: yellow cells on the Totals tab are collections already received. Existing deals only gain missing paid ticks."
            : "The usual FFG workbook still works — one tab per agreement. New tabs are added to the portal. Existing deals only gain missing green ticks; GoCardless collections are never unmarked."}
        </p>
        <label className="admin-file">
          <input
            type="file"
            accept=".xlsx,.xlsm,.xlsb"
            disabled={importing}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadBook(file);
              e.target.value = "";
            }}
          />
          {importing
            ? "Reading workbook…"
            : currentAdminBook() === "gg"
              ? "Upload Glacier Gem totals workbook"
              : "Upload FFG agreement workbook"}
        </label>
        {importMsg && <div className="admin-ok">{importMsg}</div>}
        {importError && <div className="admin-error">{importError}</div>}
      </div>
      {msg && <div className="admin-ok">{msg}</div>}
      {error && <div className="admin-error">{error}</div>}
      <form className="admin-form" onSubmit={submit}>
        <div>
          <label>Agreement number</label>
          <input
            value={form.agreement_number}
            onChange={(e) => set("agreement_number", e.target.value)}
            placeholder="Blank = next number"
          />
        </div>
        <div>
          <label>Type</label>
          <select
            value={form.agreement_type}
            onChange={(e) => set("agreement_type", e.target.value)}
          >
            {currentAdminBook() === "gg" ? (
              <option value="GG">Glacier Gem HP</option>
            ) : (
              <>
                <option value="HP">Hire purchase</option>
                <option value="FL">Finance lease</option>
                <option value="L">Loan</option>
              </>
            )}
          </select>
        </div>
        <div className="full">
          <label>Company name</label>
          <input
            required
            value={form.company_name}
            onChange={(e) => set("company_name", e.target.value)}
          />
        </div>
        <div>
          <label>Contact</label>
          <input
            value={form.contact_name}
            onChange={(e) => set("contact_name", e.target.value)}
          />
        </div>
        <div>
          <label>Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>
        <div>
          <label>Phone</label>
          <input
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
        </div>
        <div>
          <label>Start date</label>
          <input
            required
            type="date"
            value={form.start_date}
            onChange={(e) => set("start_date", e.target.value)}
          />
          <p className="admin-field-hint">
            Commencement — first collection is one month after this date.
          </p>
        </div>
        <div className="full">
          <label>Asset</label>
          <input
            value={form.asset_description}
            onChange={(e) => set("asset_description", e.target.value)}
          />
        </div>
        <div>
          <label>Purchase price</label>
          <input
            value={form.purchase_price}
            onChange={(e) => set("purchase_price", e.target.value)}
          />
        </div>
        <div>
          <label>Deposit</label>
          <input
            value={form.customer_deposit}
            onChange={(e) => set("customer_deposit", e.target.value)}
          />
        </div>
        <div>
          <label>Total lend</label>
          <input
            value={form.total_lend}
            onChange={(e) => set("total_lend", e.target.value)}
          />
        </div>
        <div>
          <label>Monthly instalment</label>
          <input
            required
            value={form.monthly_instalment}
            onChange={(e) => set("monthly_instalment", e.target.value)}
          />
        </div>
        <div>
          <label>Term (months)</label>
          <input
            required
            value={form.term_months}
            onChange={(e) => set("term_months", e.target.value)}
          />
        </div>
        <div>
          <label>Commission</label>
          <input
            value={form.commission}
            onChange={(e) => set("commission", e.target.value)}
          />
        </div>
        <div>
          <label>Documentation fee</label>
          <input
            value={form.documentation_fee}
            onChange={(e) => set("documentation_fee", e.target.value)}
          />
        </div>
        {currentAdminBook() !== "gg" && (
        <div className="full">
          <label>GoCardless mandate id</label>
          <input
            value={form.gocardless_mandate_id}
            onChange={(e) => set("gocardless_mandate_id", e.target.value)}
            placeholder="MD… optional"
          />
        </div>
        )}
        <button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Add to the book"}
        </button>
      </form>
    </>
  );
}
