"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminShell, { adminHeaders, adminBasePath } from "../AdminShell";

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
};

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

  return (
    <>
      <div className="admin-kicker">Customers</div>
      <h1>Customers</h1>
      <p className="admin-lead">
        Every company on the book. Open a row to jump to their agreements.
      </p>
      <div className="admin-toolbar">
        <input
          value={q}
          placeholder="Search company, contact or email"
          onChange={(e) => {
            setQ(e.target.value);
            load(e.target.value);
          }}
        />
      </div>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Company</th>
            <th>Contact</th>
            <th>Email</th>
            <th>Agreements</th>
            <th>Portal</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr
              key={c.id}
              onClick={() =>
                router.push(
                  `${base}/agreements?q=${encodeURIComponent(c.company_name)}`
                )
              }
            >
              <td>
                <strong>{c.company_name}</strong>
                <div style={{ color: "var(--slate)", fontSize: 12 }}>
                  {c.agreements.join(", ")}
                </div>
              </td>
              <td>{c.contact_name || "—"}</td>
              <td>{c.email || "—"}</td>
              <td>
                {c.live_count} live / {c.agreement_count}
              </td>
              <td>{c.has_portal_login ? "Linked" : "Not yet"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
