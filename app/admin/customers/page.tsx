"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AdminShell, { adminHeaders, adminBasePath } from "../AdminShell";
import PageHero from "../PageHero";

type Customer = {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  has_portal_login: boolean;
  agreement_count: number;
  live_count: number;
  agreements: string[];
  exposure: number;
  overdue: number;
  next_payment: string | null;
  missing_details: boolean;
  missing_asset: boolean;
  gaps: string[];
  status: "active" | "arrears" | "missing";
};

type Filter = "all" | "active" | "arrears" | "missing";

const gbp = (n: number) =>
  `£${Number(n).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
const prettyDate = (d: string | null) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

export default function AdminCustomersPage() {
  return (
    <AdminShell>
      <CustomersInner />
    </AdminShell>
  );
}

function CustomersInner() {
  const router = useRouter();
  const base = adminBasePath();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Customer[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async (query: string) => {
    const res = await fetch(
      `/api/admin/customers?q=${encodeURIComponent(query)}`,
      { headers: adminHeaders() }
    );
    if (!res.ok) return;
    const json = await res.json();
    setRows(json.customers || []);
  };

  useEffect(() => {
    load("");
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "active") return rows.filter((c) => c.live_count > 0);
    if (filter === "arrears") return rows.filter((c) => c.status === "arrears");
    return rows.filter((c) => c.missing_details);
  }, [rows, filter]);

  const selected =
    filtered.find((c) => c.id === selectedId) || filtered[0] || null;

  const liveBorrowers = rows.filter((c) => c.live_count > 0).length;
  const exposure = rows.reduce((sum, c) => sum + c.exposure, 0);
  const portalOn = rows.filter((c) => c.has_portal_login).length;
  const arrears = rows.filter((c) => c.status === "arrears").length;
  const missing = rows.filter((c) => c.missing_details).length;

  const openCustomerCard = (companyName: string) => {
    router.push(
      `${base}/lookup?company=${encodeURIComponent(companyName)}`
    );
  };

  const attention = rows
    .flatMap((c) => {
      const items: { id: string; company: string; issue: string }[] = [];
      if (c.status === "arrears") {
        items.push({ id: c.id, company: c.company_name, issue: "Payment in arrears" });
      }
      if (c.missing_details) {
        items.push({
          id: c.id,
          company: c.company_name,
          issue: (c.gaps || ["No email"]).join(" · "),
        });
      }
      return items;
    });

  const exportCsv = () => {
    const header = ["Company", "Contact", "Email", "Live deals", "Exposure", "Next payment", "Status"];
    const body = filtered.map((c) =>
      [
        c.company_name,
        c.contact_name || "",
        c.email || "",
        c.live_count,
        c.exposure,
        c.next_payment || "",
        c.status,
      ].join(",")
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], {
      type: "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "customers.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHero
        title="Customers"
        subtitle="Manage customers, contacts and their lending relationships."
        search={q}
        onSearch={(value) => {
          setQ(value);
          load(value);
        }}
        searchPlaceholder="Search company, contact or email"
        action={
          <button
            className="page-hero-action"
            type="button"
            onClick={() => router.push(`${base}/new-deal`)}
          >
            + Add customer
          </button>
        }
      />

      <div className="page-stat-row">
        <div className="page-stat">
          <div className="page-stat-icon blue">☺</div>
          <div>
            <b>{rows.length}</b>
            <span>Total customers</span>
          </div>
        </div>
        <div className="page-stat">
          <div className="page-stat-icon green">⌂</div>
          <div>
            <b>{liveBorrowers}</b>
            <span>Active borrowers</span>
          </div>
        </div>
        <div className="page-stat">
          <div className="page-stat-icon gold">£</div>
          <div>
            <b>{gbp(exposure)}</b>
            <span>Total exposure</span>
          </div>
        </div>
        <div className="page-stat">
          <div className="page-stat-icon navy">✉</div>
          <div>
            <b>{portalOn}</b>
            <span>Portal access</span>
            <small>
              {rows.length
                ? `${Math.round((portalOn / rows.length) * 100)}% of customers`
                : "—"}
            </small>
          </div>
        </div>
      </div>

      <div className="page-layout">
        <section className="page-panel">
          <div className="page-panel-head">
            <div>
              <h2>Customer directory</h2>
              <p className="panel-sub">All customers and their lending relationships.</p>
            </div>
            <button type="button" className="export-btn" onClick={exportCsv}>
              ↓ Export
            </button>
          </div>
          <div className="page-filters">
            <button className={`page-chip ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>
              All customers ({rows.length})
            </button>
            <button className={`page-chip ${filter === "active" ? "on" : ""}`} onClick={() => setFilter("active")}>
              Active ({liveBorrowers})
            </button>
            <button className={`page-chip ${filter === "arrears" ? "on" : ""}`} onClick={() => setFilter("arrears")}>
              Arrears ({arrears})
            </button>
            <button
              className={`page-chip alert ${filter === "missing" ? "on" : ""}`}
              onClick={() => setFilter("missing")}
            >
              Missing details ({missing})
            </button>
          </div>
          <div className="page-table-scroll">
          <table className="page-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Contact</th>
                <th>Live deals</th>
                <th>Exposure</th>
                <th>Next payment</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className={selected?.id === c.id ? "selected" : ""}
                  onClick={() => setSelectedId(c.id)}
                >
                  <td>
                    <button
                      type="button"
                      className="customer-name-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        openCustomerCard(c.company_name);
                      }}
                    >
                      <strong>{c.company_name}</strong>
                    </button>
                    <span className="sub">{c.agreements.slice(0, 3).join(", ")}</span>
                  </td>
                  <td>
                    {c.contact_name || "—"}
                    <span className="sub">{c.email || "No email"}</span>
                  </td>
                  <td>{c.live_count}</td>
                  <td className="mono">{gbp(c.exposure)}</td>
                  <td>{prettyDate(c.next_payment)}</td>
                  <td>
                    <span className={`status-pill ${c.status}`}>
                      {c.status === "arrears"
                        ? "Arrears"
                        : c.status === "missing"
                          ? "Missing details"
                          : "Active"}
                    </span>
                    {c.gaps?.length ? (
                      <span className="sub">{c.gaps.join(" · ")}</span>
                    ) : null}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="view-agreement"
                      onClick={(e) => {
                        e.stopPropagation();
                        openCustomerCard(c.company_name);
                      }}
                    >
                      View →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <p className="panel-sub" style={{ marginTop: 10, marginBottom: 0 }}>
            {filtered.length} customers
          </p>
        </section>

        <div className="dashboard-side-stack">
          <section className="page-panel">
            <div className="page-panel-head">
              <div>
                <h2>Customer snapshot</h2>
                <p className="panel-sub">
                  {selected ? (
                    <button
                      type="button"
                      className="customer-name-btn"
                      onClick={() => openCustomerCard(selected.company_name)}
                    >
                      {selected.company_name}
                    </button>
                  ) : (
                    "Select a customer"
                  )}
                </p>
              </div>
              <button
                type="button"
                className="ghost-link"
                onClick={() => router.push(`${base}/customers`)}
              >
                View all customers →
              </button>
            </div>
            {selected && (
              <>
                <dl className="snapshot-kv">
                  <dt>Primary contact</dt>
                  <dd>{selected.contact_name || "—"}</dd>
                  <dt>Email</dt>
                  <dd>{selected.email || "—"}</dd>
                  <dt>Agreements</dt>
                  <dd>
                    {selected.agreements.length
                      ? `${selected.agreements.length} (${selected.live_count} live)`
                      : "—"}
                  </dd>
                  <dt>Total exposure</dt>
                  <dd>{gbp(selected.exposure)}</dd>
                  <dt>Next payment</dt>
                  <dd>{prettyDate(selected.next_payment)}</dd>
                  <dt>Payment health</dt>
                  <dd>
                    <span className={`status-pill ${selected.status}`}>
                      {selected.status === "arrears"
                        ? "Arrears"
                        : selected.status === "missing"
                          ? "Missing details"
                          : "Up to date"}
                    </span>
                  </dd>
                  {selected.gaps?.length ? (
                    <>
                      <dt>Missing</dt>
                      <dd>{selected.gaps.join(" · ")}</dd>
                    </>
                  ) : null}
                </dl>
                {selected.agreements.length > 0 && (
                  <div className="snapshot-agreements">
                    {selected.agreements.map((num) => (
                      <button
                        key={num}
                        type="button"
                        className="snapshot-agreement-chip"
                        onClick={() =>
                          router.push(
                            `${base}/lookup?agreement=${encodeURIComponent(num)}`
                          )
                        }
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                )}
                <div className="snapshot-actions">
                  <button
                    className="primary"
                    type="button"
                    onClick={() => openCustomerCard(selected.company_name)}
                  >
                    Open customer →
                  </button>
                  {selected.email && (
                    <a className="ghost" href={`mailto:${selected.email}`}>
                      Email
                    </a>
                  )}
                </div>
              </>
            )}
          </section>
          <section className="page-panel">
            <div className="page-panel-head">
              <div>
                <h2>Attention needed</h2>
                <p className="panel-sub">Customers that need your attention.</p>
              </div>
            </div>
            <div className="attention-list admin-action-scroll">
              {attention.length === 0 && <p className="empty-activity">Nothing flagged.</p>}
              {attention.map((item, index) => (
                <div className="attention-row" key={`${item.id}-${item.issue}-${index}`}>
                  <div>
                    <strong>{item.company}</strong>
                    <small>{item.issue}</small>
                  </div>
                  <button
                    type="button"
                    className="view-agreement"
                    onClick={() => openCustomerCard(item.company)}
                  >
                    View →
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
