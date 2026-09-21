"use client";

import { useState } from "react";
import AdminShell, { adminHeaders } from "../AdminShell";

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
  const [form, setForm] = useState({
    agreement_number: "",
    agreement_type: "HP",
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
        `${json.agreement_number} is on the book with ${json.instalments} instalments. Collections will tick once GoCardless picks them up.`
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

  return (
    <>
      <div className="admin-kicker">Origination</div>
      <h1>Load a new deal</h1>
      <p className="admin-lead">
        Add the agreement here instead of the spreadsheet. Leave the agreement
        number blank and the next HP / FL number is used. Paste a GoCardless
        mandate id if you already have it — monthly collections then sync from
        the API, no merge sheet required.
      </p>
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
            <option value="HP">Hire purchase</option>
            <option value="FL">Finance lease</option>
            <option value="LN">Loan</option>
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
        <div className="full">
          <label>GoCardless mandate id</label>
          <input
            value={form.gocardless_mandate_id}
            onChange={(e) => set("gocardless_mandate_id", e.target.value)}
            placeholder="MD… optional"
          />
        </div>
        <button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Add to the book"}
        </button>
      </form>
    </>
  );
}
