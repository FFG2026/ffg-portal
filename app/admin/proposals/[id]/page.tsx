"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AdminShell, { adminHeaders } from "../../AdminShell";
import PageHero from "../../PageHero";
import { priceProposal } from "../../../../lib/proposals/calc";
import { PRODUCT_NAME } from "../../../../lib/proposals/labels";
import "../proposals.css";

type P = Record<string, any>;
type Check = { id: string; label: string; level: "ok" | "info" | "review" | "issue"; detail: string };
type Ev = { id: string; created_at: string; actor: string | null; kind: string; detail: any };

const gbp = (v: any) =>
  v === null || v === undefined || v === ""
    ? "–"
    : `£${Number(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const numOrNull = (v: string) => (v.trim() === "" || isNaN(Number(v)) ? null : Number(v));

const EVENT_TEXT: Record<string, string> = {
  received: "Proposal received",
  edited: "Figures edited",
  underwriting_approve: "Approved at underwriting",
  underwriting_refer: "Referred",
  underwriting_decline: "Declined at underwriting",
  rate_agreed: "Rate agreed",
  acceptance_sent: "Acceptance sent",
  put_on_book: "Put on the book",
  documents_raised: "Finance documents raised",
  declined: "Declined",
  reopened: "Reopened",
};

export default function ProposalPage() {
  return (
    <AdminShell>
      <ProposalInner />
    </AdminShell>
  );
}

function ProposalInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [p, setP] = useState<P | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/proposals/${id}`, { headers: adminHeaders(), cache: "no-store" });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Could not load this proposal");
      return;
    }
    setP(json.proposal);
    setEvents(json.events || []);
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (action: string, extra: Record<string, unknown> = {}, success = "") => {
    setBusy(action);
    setError("");
    setOk("");
    try {
      const res = await fetch(`/api/admin/proposals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "That didn't work");
      if (success) setOk(success);
      await load();
      return json;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setBusy("");
    }
  };

  if (!p) {
    return (
      <>
        <PageHero title="Proposal" subtitle="" />
        {error ? <div className="admin-error">{error}</div> : <p>Loading…</p>}
      </>
    );
  }

  const status: string = p.status;
  const editable = ["new", "underwriting", "approved"].includes(status);
  const steps: [string, boolean, boolean][] = [
    ["Received", true, false],
    ["Underwritten", ["approved", "accepted", "on_book"].includes(status), status === "new" || status === "underwriting"],
    ["Rate agreed", p.agreed_monthly !== null && ["approved", "accepted", "on_book"].includes(status), status === "approved" && p.agreed_monthly === null],
    ["Acceptance sent", ["accepted", "on_book"].includes(status), status === "approved" && p.agreed_monthly !== null],
    ["On the book", status === "on_book", status === "accepted"],
  ];

  return (
    <>
      <PageHero
        title={p.company_name || "Proposal"}
        subtitle={`${PRODUCT_NAME[p.product_type] || "Proposal"}${p.asset_description ? ` · ${p.asset_description}` : ""} · received ${new Date(p.created_at).toLocaleDateString("en-GB")}`}
        action={<Link className="admin-view-btn" href="/admin/proposals">← All proposals</Link>}
      />
      {error && <div className="admin-error">{error}</div>}
      {ok && <div className="admin-ok">{ok}</div>}

      <ol className="pp-steps">
        {status === "declined" ? (
          <li className="now" style={{ background: "#B4232C", borderColor: "#B4232C" }}>Declined</li>
        ) : (
          steps.map(([label, done, now]) => (
            <li key={label} className={done ? "done" : now ? "now" : ""}>{label}</li>
          ))
        )}
      </ol>

      <div className="pp-stack">
        <DetailsPanel p={p} editable={editable} busy={busy === "edit"} onSave={(fields) => act("edit", { fields }, "Saved – checks re-run.")} />
        <DealPackPanel p={p} />
        <ChecksPanel p={p} busy={busy === "run_checks"} onRerun={() => act("run_checks", {}, "Checks re-run.")} />
        {["new", "underwriting", "approved"].includes(status) && (
          <UnderwritePanel p={p} busy={busy === "underwrite"} onSave={(decision, notes) => act("underwrite", { decision, notes }, decision === "approve" ? "Approved – now agree a rate." : decision === "refer" ? "Marked as referred." : "Declined.")} />
        )}
        {["approved", "accepted"].includes(status) && p.uw_decision === "approve" && (
          <DocumentsPanel id={id} p={p} onDone={load} setError={setError} setOk={setOk} />
        )}
        {status === "approved" && (
          <RatePanel p={p} busy={busy === "set_rate"} onSave={(v) => act("set_rate", v, "Rate saved.")} />
        )}
        {["accepted", "on_book"].includes(status) && <AgreedSummary p={p} />}
        {status === "approved" && p.agreed_monthly !== null && (
          <AcceptancePanel id={id} p={p} busy={busy === "send_acceptance"} onSend={(v) => act("send_acceptance", v, "Acceptance sent.")} setError={setError} />
        )}
        {["accepted", "on_book"].includes(status) && p.acceptance_sent_at && <SentAcceptance p={p} />}
        {status === "accepted" && (
          <BookPanel p={p} busy={busy === "put_on_book"} onBook={async (v) => {
            const r = await act("put_on_book", v);
            if (r) setOk(`${r.agreement_number} is on the book with ${r.instalments} instalments.${r.mandate_source === "inherited" ? " It picked up this customer's existing direct debit mandate." : r.mandate_source === "none" ? " No direct debit mandate yet – add it on the deal sheet once it's set up." : ""}`);
          }} />
        )}
        {status === "on_book" && (
          <div className="page-panel">
            <h2>On the book</h2>
            <p className="admin-lead">
              This is agreement <strong>{p.agreement_number}</strong>, loaded {p.booked_at ? new Date(p.booked_at).toLocaleDateString("en-GB") : ""}.{" "}
              <Link href={`/admin/lookup?agreement=${encodeURIComponent(p.agreement_number)}`}>Open the deal sheet →</Link>
            </p>
          </div>
        )}
        {!["on_book", "declined"].includes(status) && (
          <DeclinePanel busy={busy === "decline"} onDecline={(reason) => act("decline", { reason }, "Declined.")} />
        )}
        {status === "declined" && (
          <div className="page-panel">
            <h2>Declined</h2>
            <p className="admin-lead">{p.decline_reason}</p>
            <div className="pp-btns"><button onClick={() => act("reopen", {}, "Reopened.")} disabled={!!busy}>Reopen</button></div>
          </div>
        )}

        <DeletePanel
          status={status}
          agreementNumber={p.agreement_number}
          busy={busy === "delete"}
          onDelete={async () => {
            const r = await act("delete", { confirm: true });
            if (r) router.push("/admin/proposals");
          }}
        />

        <div className="page-panel">
          <h2>History</h2>
          <ul className="pp-events">
            {events.map((e) => (
              <li key={e.id}>
                <span>
                  {EVENT_TEXT[e.kind] || e.kind}
                  {e.actor ? ` · ${e.actor}` : ""}
                  {e.detail?.notes ? ` – “${e.detail.notes}”` : ""}
                  {e.detail?.reason ? ` – “${e.detail.reason}”` : ""}
                  {e.detail?.agreement_number ? ` – ${e.detail.agreement_number}` : ""}
                  {e.kind === "rate_agreed" && e.detail?.rate !== undefined ? ` – ${e.detail.rate}%, ${gbp(e.detail.monthly)}/month` : ""}
                </span>
                <time>{new Date(e.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

/* ---------- 1. the proposal as received ---------- */

function DetailsPanel({ p, editable, busy, onSave }: { p: P; editable: boolean; busy: boolean; onSave: (f: Record<string, unknown>) => void }) {
  const keys = ["company_name", "company_number", "customer_email", "rep_name", "rep_email", "asset_description", "supplier_name", "supplier_number", "cash_price", "deposit", "commission", "financed", "term_months", "quoted_rate_pct", "quoted_monthly"] as const;
  const init = useMemo(() => Object.fromEntries(keys.map((k) => [k, p[k] === null || p[k] === undefined ? "" : String(p[k])])) as Record<string, string>, [p]); // eslint-disable-line react-hooks/exhaustive-deps
  const [f, setF] = useState(init);
  useEffect(() => setF(init), [init]);
  const dirty = keys.some((k) => f[k] !== init[k]);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const field = (k: (typeof keys)[number], label: string, full = false) => (
    <div className={full ? "full" : ""}>
      <label>{label}</label>
      <input value={f[k]} disabled={!editable} onChange={(e) => set(k, e.target.value)} />
    </div>
  );
  return (
    <div className="page-panel">
      <div className="page-panel-head">
        <div>
          <h2>The proposal</h2>
          <div className="panel-sub">
            As read from the email{p.dcf_quote_id ? " · matched to the DCF calculator quote" : " · no matching DCF quote found, so the rep's email needs adding by hand"}
          </div>
        </div>
      </div>
      <div className="admin-form">
        {field("company_name", "Customer", true)}
        {field("company_number", "Company number")}
        {field("customer_email", "Customer email")}
        {field("rep_name", "Sent by (rep)")}
        {field("rep_email", "Rep email – acceptance goes here")}
        {field("asset_description", "Asset", true)}
        {field("supplier_name", "Supplier")}
        {field("supplier_number", "Supplier number")}
        {field("cash_price", "Cash price (£)")}
        {field("deposit", "Deposit (£)")}
        {field("commission", "Commission (£)")}
        {field("financed", "Amount financed (£)")}
        {field("term_months", "Term (months)")}
        {field("quoted_rate_pct", "Quoted rate (%)")}
        {field("quoted_monthly", "Quoted monthly (£)")}
      </div>
      {editable && (
        <div className="pp-btns">
          <button className="primary" disabled={!dirty || busy} onClick={() => onSave(f)}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- 2. checks ---------- */

function ChecksPanel({ p, busy, onRerun }: { p: P; busy: boolean; onRerun: () => void }) {
  const checks: Check[] = p.checks || [];
  const order = { issue: 0, review: 1, info: 2, ok: 3 } as const;
  const sorted = [...checks].sort((a, b) => order[a.level] - order[b.level]);
  return (
    <div className="page-panel">
      <div className="page-panel-head">
        <div>
          <h2>Checks</h2>
          <div className="panel-sub">
            Red = doesn't add up · amber = worth a look · green = fine · grey = for information.
            {p.checks_at ? ` Run ${new Date(p.checks_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.` : ""}
          </div>
        </div>
        <div className="pp-btns" style={{ marginTop: 0 }}>
          <button disabled={busy} onClick={onRerun}>{busy ? "Checking…" : "Re-run checks"}</button>
        </div>
      </div>
      {sorted.length === 0 ? (
        <p className="admin-lead">No checks have run yet.</p>
      ) : (
        <ul className="pp-checks">
          {sorted.map((c) => (
            <li key={c.id}>
              <span className={`pp-dot ${c.level}`} />
              <span className="lbl">{c.label}</span>
              <span className="txt">{c.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- 3. underwriting ---------- */

function UnderwritePanel({ p, busy, onSave }: { p: P; busy: boolean; onSave: (d: string, n: string) => void }) {
  const [notes, setNotes] = useState(p.uw_notes || "");
  return (
    <div className="page-panel">
      <h2>Underwriting</h2>
      <div className="panel-sub">
        {p.uw_decision ? `Last recorded: ${p.uw_decision}${p.uw_by ? ` by ${p.uw_by}` : ""}.` : "Record your decision and why."}
      </div>
      <textarea className="pp-textarea" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes – what you looked at and why you've decided this" />
      <div className="pp-btns">
        <button className={`primary ${p.uw_decision === "approve" ? "on" : ""}`} disabled={busy} onClick={() => onSave("approve", notes)}>Approve</button>
        <button disabled={busy} onClick={() => onSave("refer", notes)}>Refer / hold</button>
        <button className="danger" disabled={busy || !notes.trim()} onClick={() => onSave("decline", notes)} title={!notes.trim() ? "Add a note first" : ""}>Decline</button>
      </div>
    </div>
  );
}

/* ---------- 3b. finance documents ---------- */

type Director = { name: string; birth: string; address: string; dob: string; include: boolean };

function DocumentsPanel({ id, p, onDone, setError, setOk }: { id: string; p: P; onDone: () => void; setError: (m: string) => void; setOk: (m: string) => void }) {
  const [pre, setPre] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const [hirer, setHirer] = useState({ contact_name: "", phone: "", address_line1: "", address_line2: "", postcode: "" });
  const [dirs, setDirs] = useState<Director[]>([]);
  const [goods, setGoods] = useState({ chassis: "", reg: "", reg_date: "", condition: "", goods_location1: "", goods_location_postcode: "", supplier_address1: "", supplier_address2: "", supplier_postcode: "" });
  const [ins, setIns] = useState({ insurer_name: "", insurer_address1: "", insurer_address2: "", insurer_address3: "", insurer_postcode: "", insurer_policy: "", insurer_expiry: "" });
  const [invoiceNote, setInvoiceNote] = useState<{ file: string | null; warnings: string[] } | null>(null);
  const [invoiceError, setInvoiceError] = useState("");
  const [docFee, setDocFee] = useState("");
  const [optionFee, setOptionFee] = useState("");
  const [done, setDone] = useState<any>(null);
  const docs = p.extras?.docs;

  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    const res = await fetch(`/api/admin/proposals/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...adminHeaders() },
      body: JSON.stringify({ action, ...extra }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "That didn't work");
    return json;
  };

  const prepare = async () => {
    setBusy("prefill");
    setError("");
    try {
      const { prefill } = await call("documents_prefill");
      setPre(prefill);
      setHirer(prefill.hirer);
      setDirs(prefill.directors.map((d: any) => ({ ...d, dob: "", include: true })));
      setGoods((g) => ({ ...g, condition: p.asset_condition || "" }));
      setDocFee(String(prefill.documentation_fee ?? ""));
      setOptionFee(String(prefill.option_fee ?? ""));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const readInvoice = async () => {
    setBusy("invoice");
    setError("");
    setInvoiceError("");
    setInvoiceNote(null);
    try {
      const { invoice } = await call("read_invoice");
      const f = invoice.facts;
      setGoods((g) => ({
        chassis: f.chassis || g.chassis,
        reg: f.reg || g.reg,
        reg_date: f.reg_date || g.reg_date,
        condition: f.condition || g.condition,
        goods_location1: f.goods_location1 || g.goods_location1,
        goods_location_postcode: f.goods_location_postcode || g.goods_location_postcode,
        supplier_address1: f.supplier_address1 || g.supplier_address1,
        supplier_address2: f.supplier_address2 || g.supplier_address2,
        supplier_postcode: f.supplier_postcode || g.supplier_postcode,
      }));
      setInvoiceNote({ file: f.file || invoice.files_read[0] || null, warnings: invoice.warnings });
    } catch (e: any) {
      setInvoiceError(e.message);
    } finally {
      setBusy("");
    }
  };

  const raise = async () => {
    setBusy("raise");
    setError("");
    try {
      const guarantors = dirs.filter((d) => d.include && d.name.trim()).map((d) => ({ name: d.name, dob: d.dob, address: d.address }));
      const { documents } = await call("raise_documents", {
        input: { ...hirer, ...goods, ...ins, signatory_name: guarantors[0]?.name || hirer.contact_name, documentation_fee: numOrNull(docFee), option_fee: numOrNull(optionFee), guarantors },
      });
      setDone(documents);
      setOk(`${documents.agreement_number}: ${documents.files.length} document${documents.files.length === 1 ? "" : "s"} saved to Drive.`);
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const setDir = (i: number, patch: Partial<Director>) => setDirs((x) => x.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const agreed = p.agreed_monthly !== null && p.agreed_monthly !== undefined;

  return (
    <div className="page-panel">
      <h2>Finance documents</h2>
      <div className="panel-sub">
        Saves an approval record, the hire purchase agreement and a personal guarantee for each director into a new folder in the Future FG Drive folder.
        {!agreed ? " The rate isn't agreed yet, so the documents would carry the quoted figures – agree the rate first if it has changed." : ""}
      </div>
      {docs?.folder_link && (
        <p className="admin-lead">
          Raised {docs.raised_at ? new Date(docs.raised_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""} as <strong>{p.extras?.reserved_agreement_number}</strong>.{" "}
          <a href={docs.folder_link} target="_blank" rel="noreferrer">Open the folder in Drive →</a>
        </p>
      )}
      {!pre ? (
        <div className="pp-btns">
          <button className="primary" disabled={!!busy} onClick={prepare}>{busy === "prefill" ? "Looking up Companies House…" : docs ? "Raise again (new versions)" : "Prepare the documents"}</button>
        </div>
      ) : (
        <>
          <p className="admin-lead">
            Number <strong>{pre.agreement_number}</strong>{pre.reserved ? " (already reserved for this deal)" : " (will be reserved for this deal)"} · folder <strong>{pre.agreement_number} - {pre.company?.name || p.company_name}</strong>
          </p>
          {!pre.hp_supported && <p className="admin-field-hint">There's no template for this product yet, so only the approval record and guarantees will be raised.</p>}
          <h3 style={{ margin: "14px 0 6px", fontSize: 14 }}>Hirer</h3>
          <div className="admin-form">
            <div><label>Main contact</label><input value={hirer.contact_name} onChange={(e) => setHirer({ ...hirer, contact_name: e.target.value })} /></div>
            <div><label>Telephone</label><input value={hirer.phone} onChange={(e) => setHirer({ ...hirer, phone: e.target.value })} /></div>
            <div><label>Address line 1</label><input value={hirer.address_line1} onChange={(e) => setHirer({ ...hirer, address_line1: e.target.value })} /></div>
            <div><label>Address line 2</label><input value={hirer.address_line2} onChange={(e) => setHirer({ ...hirer, address_line2: e.target.value })} /></div>
            <div><label>Postcode</label><input value={hirer.postcode} onChange={(e) => setHirer({ ...hirer, postcode: e.target.value })} /></div>
            <div><label>Documentation fee (£)</label><input value={docFee} onChange={(e) => setDocFee(e.target.value)} inputMode="decimal" /></div>
            <div><label>Option to purchase fee (£)</label><input value={optionFee} onChange={(e) => setOptionFee(e.target.value)} inputMode="decimal" /></div>
          </div>
          <h3 style={{ margin: "14px 0 6px", fontSize: 14 }}>Goods</h3>
          <p className="admin-field-hint">The documents aren't raised until the chassis, registration and registration date are in.</p>
          <div className="pp-btns" style={{ marginTop: 6 }}>
            <button disabled={!!busy} onClick={readInvoice}>{busy === "invoice" ? "Reading the invoice…" : "Read these from the supplier invoice"}</button>
          </div>
          {invoiceError && <p className="admin-field-hint" style={{ color: "#B4232C" }}>Couldn't read the invoice: {invoiceError}</p>}
          {invoiceNote && (
            <p className="admin-field-hint">
              Filled from {invoiceNote.file || "the invoice"} – check each box against it.
              {invoiceNote.warnings.map((w) => <span key={w} style={{ display: "block", color: "#B4232C" }}>{w}</span>)}
            </p>
          )}
          <div className="admin-form">
            <div><label>Chassis / serial no.</label><input value={goods.chassis} onChange={(e) => setGoods({ ...goods, chassis: e.target.value })} /></div>
            <div><label>Registration (N/A if none)</label><input value={goods.reg} onChange={(e) => setGoods({ ...goods, reg: e.target.value })} /></div>
            <div><label>Date of reg / year of manufacture</label><input value={goods.reg_date} onChange={(e) => setGoods({ ...goods, reg_date: e.target.value })} placeholder="dd/mm/yy or year" /></div>
            <div><label>New / used</label><input value={goods.condition} onChange={(e) => setGoods({ ...goods, condition: e.target.value })} /></div>
            <div><label>Goods location (if not the hirer's address)</label><input value={goods.goods_location1} onChange={(e) => setGoods({ ...goods, goods_location1: e.target.value })} /></div>
            <div><label>Goods location postcode</label><input value={goods.goods_location_postcode} onChange={(e) => setGoods({ ...goods, goods_location_postcode: e.target.value })} /></div>
            <div><label>Supplier address</label><input value={goods.supplier_address1} onChange={(e) => setGoods({ ...goods, supplier_address1: e.target.value })} /></div>
            <div><label>Supplier address line 2</label><input value={goods.supplier_address2} onChange={(e) => setGoods({ ...goods, supplier_address2: e.target.value })} /></div>
            <div><label>Supplier postcode</label><input value={goods.supplier_postcode} onChange={(e) => setGoods({ ...goods, supplier_postcode: e.target.value })} /></div>
          </div>
          <h3 style={{ margin: "14px 0 6px", fontSize: 14 }}>Insurance (optional)</h3>
          <div className="admin-form">
            <div><label>Insurer</label><input value={ins.insurer_name} onChange={(e) => setIns({ ...ins, insurer_name: e.target.value })} /></div>
            <div><label>Policy number</label><input value={ins.insurer_policy} onChange={(e) => setIns({ ...ins, insurer_policy: e.target.value })} /></div>
            <div><label>Insurer address</label><input value={ins.insurer_address1} onChange={(e) => setIns({ ...ins, insurer_address1: e.target.value })} /></div>
            <div><label>Insurer address line 2</label><input value={ins.insurer_address2} onChange={(e) => setIns({ ...ins, insurer_address2: e.target.value })} /></div>
            <div><label>Insurer postcode</label><input value={ins.insurer_postcode} onChange={(e) => setIns({ ...ins, insurer_postcode: e.target.value })} /></div>
            <div><label>Policy expiry (dd/mm/yyyy)</label><input value={ins.insurer_expiry} onChange={(e) => setIns({ ...ins, insurer_expiry: e.target.value })} placeholder="dd/mm/yyyy" /></div>
          </div>
          <h3 style={{ margin: "14px 0 6px", fontSize: 14 }}>Personal guarantees</h3>
          <p className="admin-field-hint">Directors from Companies House. It only gives birth month and year, so add the full date of birth and home address for each guarantor.</p>
          {!dirs.length && <p className="admin-field-hint">No directors came back from Companies House – add one below.</p>}
          {dirs.map((d, i) => (
            <div key={i} className="admin-form" style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--rule)" }}>
              <div className="full"><label><input type="checkbox" checked={d.include} onChange={(e) => setDir(i, { include: e.target.checked })} /> Guarantee for {d.name || "this person"}{d.birth ? ` (born ${d.birth})` : ""}</label></div>
              <div><label>Full name</label><input value={d.name} onChange={(e) => setDir(i, { name: e.target.value })} /></div>
              <div><label>Date of birth</label><input type="date" value={d.dob} onChange={(e) => setDir(i, { dob: e.target.value })} /></div>
              <div className="full"><label>Home address</label><input value={d.address} onChange={(e) => setDir(i, { address: e.target.value })} /></div>
            </div>
          ))}
          <div className="pp-btns">
            <button onClick={() => setDirs([...dirs, { name: "", birth: "", address: "", dob: "", include: true }])}>Add a guarantor</button>
            <button className="primary" disabled={!!busy} onClick={raise}>{busy === "raise" ? "Saving to Drive…" : "Raise the documents"}</button>
          </div>
        </>
      )}
      {done && (
        <div style={{ marginTop: 12 }}>
          <p className="admin-lead"><a href={done.folder_link} target="_blank" rel="noreferrer">Open {done.folder_name} in Drive →</a></p>
          <ul className="pp-events">{done.files.map((f: any) => <li key={f.link}><span><a href={f.link} target="_blank" rel="noreferrer">{f.name}</a></span></li>)}</ul>
          {done.skipped.map((m: string) => <p key={m} className="admin-field-hint">{m}</p>)}
        </div>
      )}
    </div>
  );
}

/* ---------- 4. the rate ---------- */

function RatePanel({ p, busy, onSave }: { p: P; busy: boolean; onSave: (v: Record<string, unknown>) => void }) {
  const [rate, setRate] = useState(String(p.agreed_rate_pct ?? p.quoted_rate_pct ?? ""));
  const [term, setTerm] = useState(String(p.agreed_term_months ?? p.term_months ?? ""));
  const [deposit, setDeposit] = useState(String(p.agreed_deposit ?? p.deposit ?? 0));
  const [commission, setCommission] = useState<string | null>(p.agreed_commission !== null ? String(p.agreed_commission) : null);

  const priced = useMemo(() => {
    const r = numOrNull(rate), t = numOrNull(term), d = numOrNull(deposit) ?? 0;
    if (r === null || !t || p.cash_price === null) return null;
    return priceProposal({
      cashPrice: Number(p.cash_price),
      deposit: d,
      commissionPct: p.commission_pct === null ? null : Number(p.commission_pct),
      commission: commission !== null ? numOrNull(commission) : p.commission_pct !== null ? null : p.commission === null ? null : Number(p.commission),
      ratePct: r,
      termMonths: t,
    });
  }, [rate, term, deposit, commission, p]);

  const q = p.quoted_monthly === null ? null : Number(p.quoted_monthly);
  return (
    <div className="page-panel">
      <h2>Agree a rate</h2>
      <div className="panel-sub">Quoted at {p.quoted_rate_pct}% over {p.term_months} months. Change anything and the payment recalculates.</div>
      <div className="admin-form">
        <div><label>Rate (%)</label><input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" /></div>
        <div><label>Term (months)</label><input value={term} onChange={(e) => setTerm(e.target.value)} inputMode="numeric" /></div>
        <div><label>Deposit (£)</label><input value={deposit} onChange={(e) => setDeposit(e.target.value)} inputMode="decimal" /></div>
        <div>
          <label>Commission (£)</label>
          <input value={commission ?? (priced ? String(priced.commission) : "")} onChange={(e) => setCommission(e.target.value)} inputMode="decimal" />
          <p className="admin-field-hint">{p.commission_pct !== null ? `Quoted at ${p.commission_pct}% of net lend.` : ""}</p>
        </div>
      </div>
      {priced && (
        <dl className="pp-kv" style={{ marginTop: 12 }}>
          <dt>Net lend (cash price − deposit)</dt><dd>{gbp(priced.netLend)}</dd>
          <dt>Commission</dt><dd>{gbp(priced.commission)}</dd>
          <dt>Amount financed</dt><dd>{gbp(priced.financed)}</dd>
          <dt className="hl">Monthly payment</dt>
          <dd className="hl">{gbp(priced.monthly)}{q !== null && Math.abs(priced.monthly - q) > 0.01 ? <span className="pp-diff"> (quoted {gbp(q)})</span> : ""}</dd>
          <dt>Total repayable</dt><dd>{gbp(priced.totalRepayable)}</dd>
          <dt>Profit (repayable − net lend − commission)</dt><dd>{gbp(priced.profit)}</dd>
        </dl>
      )}
      <div className="pp-btns">
        <button className="primary" disabled={busy || !priced} onClick={() => onSave({ rate_pct: rate, term_months: term, deposit, commission })}>
          {busy ? "Saving…" : p.agreed_monthly !== null ? "Update agreed rate" : "Agree this rate"}
        </button>
      </div>
    </div>
  );
}

function AgreedSummary({ p }: { p: P }) {
  return (
    <div className="page-panel">
      <h2>Agreed terms</h2>
      <dl className="pp-kv">
        <dt>Rate</dt><dd>{p.agreed_rate_pct}%</dd>
        <dt>Term</dt><dd>{p.agreed_term_months} months</dd>
        <dt>Deposit</dt><dd>{gbp(p.agreed_deposit)}</dd>
        <dt>Amount financed</dt><dd>{gbp(p.agreed_financed)}</dd>
        <dt className="hl">Monthly payment</dt><dd className="hl">{gbp(p.agreed_monthly)}</dd>
        <dt>Total repayable</dt><dd>{gbp(p.agreed_total_repayable)}</dd>
      </dl>
    </div>
  );
}

/* ---------- 5. acceptance ---------- */

function AcceptancePanel({ id, p, busy, onSend, setError }: { id: string; p: P; busy: boolean; onSend: (v: Record<string, unknown>) => void; setError: (m: string) => void }) {
  const [to, setTo] = useState(p.rep_email || "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const draft = async () => {
    setError("");
    const res = await fetch(`/api/admin/proposals/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...adminHeaders() },
      body: JSON.stringify({ action: "acceptance_draft" }),
    });
    const json = await res.json();
    if (!res.ok) return setError(json.error || "Could not draft the email");
    setSubject(json.email.subject);
    setBody(json.email.body);
    setTo((t: string) => t || json.to || "");
    setLoaded(true);
  };

  return (
    <div className="page-panel">
      <h2>Send the acceptance</h2>
      <div className="panel-sub">Goes back to the rep who sent the proposal. You can edit it first; you'll be copied in.</div>
      {!loaded ? (
        <div className="pp-btns" style={{ marginTop: 0 }}>
          <button className="primary" onClick={draft}>Draft the acceptance email</button>
        </div>
      ) : (
        <>
          {!p.rep_email && <div className="pp-warn">No email address was found for {p.rep_name || "the rep"} – type one in below (or save it on the proposal above).</div>}
          <div className="admin-form">
            <div className="full"><label>To</label><input value={to} onChange={(e) => setTo(e.target.value)} type="email" /></div>
            <div className="full"><label>Subject</label><input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
            <div className="full"><label>Message</label><textarea className="pp-textarea pp-mono" rows={18} value={body} onChange={(e) => setBody(e.target.value)} /></div>
          </div>
          <div className="pp-btns">
            {!confirm ? (
              <button className="primary" disabled={!to.trim()} onClick={() => setConfirm(true)}>Send acceptance…</button>
            ) : (
              <>
                <button className="primary" disabled={busy} onClick={() => onSend({ to, subject, body })}>{busy ? "Sending…" : `Yes, send to ${to}`}</button>
                <button disabled={busy} onClick={() => setConfirm(false)}>Not yet</button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SentAcceptance({ p }: { p: P }) {
  return (
    <div className="page-panel">
      <h2>Acceptance sent</h2>
      <div className="panel-sub">
        To {p.acceptance_to} · {new Date(p.acceptance_sent_at).toLocaleString("en-GB")}{p.acceptance_sent_by ? ` · by ${p.acceptance_sent_by}` : ""}
      </div>
      <details>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>{p.acceptance_subject}</summary>
        <pre className="pp-mono" style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{p.acceptance_body}</pre>
      </details>
    </div>
  );
}

/* ---------- 6. onto the book ---------- */

function BookPanel({ p, busy, onBook }: { p: P; busy: boolean; onBook: (v: Record<string, unknown>) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState("");
  const [written, setWritten] = useState(today);
  const [docFee, setDocFee] = useState("195");
  const [mandate, setMandate] = useState("");
  const [number, setNumber] = useState("");
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="page-panel">
      <h2>Put it on the book</h2>
      <div className="panel-sub">
        Do this once the documents are signed. It creates the customer (or finds them), the agreement and the {p.agreed_term_months}-instalment schedule, exactly as the New deal form does.
      </div>
      {p.product_type !== "hp" && (
        <div className="pp-warn">
          This is a {PRODUCT_NAME[p.product_type] || "non-HP"} proposal. Check the VAT treatment – finance lease schedules are held VAT-inclusive to match what GoCardless collects.
        </div>
      )}
      <div className="admin-form">
        <div><label>Start date (commencement)</label><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /><p className="admin-field-hint">First collection is one month after this date.</p></div>
        <div><label>Deal written date</label><input type="date" value={written} onChange={(e) => setWritten(e.target.value)} /></div>
        <div><label>Documentation fee (£)</label><input value={docFee} onChange={(e) => setDocFee(e.target.value)} /></div>
        <div><label>Agreement number</label><input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Blank = next number" /></div>
        <div className="full"><label>GoCardless mandate id</label><input value={mandate} onChange={(e) => setMandate(e.target.value)} placeholder="MD… – left blank, an existing customer's mandate is picked up" /></div>
      </div>
      <dl className="pp-kv" style={{ marginTop: 12 }}>
        <dt>Monthly instalment</dt><dd>{gbp(p.agreed_monthly)}</dd>
        <dt>Purchase price / deposit</dt><dd>{gbp(p.cash_price)} / {gbp(p.agreed_deposit)}</dd>
        <dt>Commission</dt><dd>{gbp(p.agreed_commission)}</dd>
      </dl>
      <div className="pp-btns">
        {!confirm ? (
          <button className="primary" disabled={!start} onClick={() => setConfirm(true)}>Add to the book…</button>
        ) : (
          <>
            <button className="primary" disabled={busy} onClick={() => onBook({ start_date: start, written_date: written, documentation_fee: docFee, agreement_number: number, gocardless_mandate_id: mandate })}>
              {busy ? "Adding…" : "Yes, add it to the book"}
            </button>
            <button disabled={busy} onClick={() => setConfirm(false)}>Not yet</button>
          </>
        )}
      </div>
    </div>
  );
}

function DeclinePanel({ busy, onDecline }: { busy: boolean; onDecline: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) {
    return (
      <div className="pp-btns" style={{ marginTop: 0 }}>
        <button className="danger" onClick={() => setOpen(true)}>Decline this proposal…</button>
      </div>
    );
  }
  return (
    <div className="page-panel">
      <h2>Decline</h2>
      <textarea className="pp-textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
      <div className="pp-btns">
        <button className="danger" disabled={busy || !reason.trim()} onClick={() => onDecline(reason)}>{busy ? "Declining…" : "Decline"}</button>
        <button onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

/* ---------- the deal pack sent over from the DCF portal ---------- */

function DealPackPanel({ p }: { p: P }) {
  const x = p.extras || {};
  const docs: { category: string | null; file_name: string | null }[] = Array.isArray(x.documents) ? x.documents : [];
  const link: string | null = typeof x.drive_folder_link === "string" && /^https:\/\//.test(x.drive_folder_link) ? x.drive_folder_link : null;
  const other: { term: number; monthly_payment: number }[] = Array.isArray(x.other_terms_offered) ? x.other_terms_offered : [];
  if (!link && !docs.length && x.shareholders_funds == null && !x.customer_phone && !other.length) return null;
  const byCategory: Record<string, string[]> = {};
  for (const d of docs) (byCategory[d.category || "other"] ||= []).push(d.file_name || "(unnamed)");
  return (
    <div className="page-panel">
      <h2>Deal pack</h2>
      <div className="panel-sub">Sent over from the DCF portal with the proposal.</div>
      <dl className="pp-kv">
        {link && (<><dt>Documents folder</dt><dd><a href={link} target="_blank" rel="noopener noreferrer">Open in Google Drive ↗</a></dd></>)}
        {x.customer_phone && (<><dt>Customer phone</dt><dd>{x.customer_phone}</dd></>)}
        {x.shareholders_funds != null && (<><dt>Shareholders' funds{x.shareholders_funds_period_end ? ` (${String(x.shareholders_funds_period_end).slice(0, 10)})` : ""}</dt><dd>{gbp(x.shareholders_funds)}</dd></>)}
        {other.length > 0 && (<><dt>Other terms the customer was offered</dt><dd>{other.map((o) => `${o.term}m ${gbp(o.monthly_payment)}`).join(" · ")}</dd></>)}
      </dl>
      {docs.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 13.5 }}>
          <strong style={{ color: "var(--navy)" }}>Documents on file ({docs.length})</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {Object.entries(byCategory).map(([cat, names]) => (
              <li key={cat}>{cat.replace(/_/g, " ")}: {names.join(", ")}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DeletePanel({ status, agreementNumber, busy, onDelete }: { status: string; agreementNumber: string | null; busy: boolean; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div className="pp-btns" style={{ marginTop: 0 }}>
        <button className="danger" onClick={() => setOpen(true)}>Delete this proposal…</button>
      </div>
    );
  }
  return (
    <div className="page-panel">
      <h2>Delete this proposal</h2>
      <p className="admin-lead">
        This removes the proposal and its history from the FFG portal for good. The quote on the DCF portal isn't touched, and it can be sent to FFG again.
        {status === "accepted" ? " The acceptance email has already gone out and can't be recalled." : ""}
        {status === "on_book" ? ` Agreement ${agreementNumber} stays on the book – only the proposal record is deleted.` : ""}
      </p>
      <div className="pp-btns">
        <button className="danger" disabled={busy} onClick={onDelete}>{busy ? "Deleting…" : "Yes, delete it"}</button>
        <button disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}
