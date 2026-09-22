"use client";

import { useEffect, useState } from "react";
import AdminShell, { adminHeaders } from "../AdminShell";
import PageHero from "../PageHero";

type Staff = {
  id: string;
  email: string;
  name: string;
  created_at: string;
};

export default function StaffPage() {
  return (
    <AdminShell>
      <StaffInner />
    </AdminShell>
  );
}

function StaffInner() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await fetch("/api/admin/staff", { headers: adminHeaders() });
    if (!res.ok) return;
    const json = await res.json();
    setStaff(json.staff || []);
  };

  useEffect(() => {
    load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setOk("");
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({ name, email, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not create login");
      setOk(`Login created for ${json.staff.email}. They can sign in from the admin page.`);
      setName("");
      setEmail("");
      setPassword("");
      await load();
    } catch (err: any) {
      setError(err.message || "Could not create login");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: Staff) => {
    if (!confirm(`Remove admin access for ${row.email}?`)) return;
    const res = await fetch(`/api/admin/staff?id=${encodeURIComponent(row.id)}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
    if (res.ok) await load();
  };

  return (
    <>
      <PageHero
        title="Admin logins"
        subtitle="Add a login for someone on the team. They sign in at Admin with their email and password — they do not need the staff code."
      />

      <div className="page-layout">
        <section className="page-panel">
          <h2>Create a login</h2>
          <p className="panel-sub">They can sign in from the admin page straight away.</p>
          <form className="admin-form" onSubmit={create} style={{ marginTop: 12, marginBottom: 0, border: 0, padding: 0, background: "transparent" }}>
        <div>
          <label>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. Sam"
          />
        </div>
        <div>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="name@ffg.finance"
          />
        </div>
        <div className="full">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            placeholder="At least 8 characters"
          />
        </div>
        <button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Create admin login"}
        </button>
          </form>
          {ok && <div className="admin-ok">{ok}</div>}
          {error && <div className="admin-error">{error}</div>}
        </section>
        <section className="page-panel">
          <h2>Current staff</h2>
          <p className="panel-sub">People who can open the admin book.</p>
          <table className="page-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 && (
                <tr>
                  <td colSpan={4}>No email logins yet — create one on the left.</td>
                </tr>
              )}
              {staff.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td className="mono">{row.email}</td>
                  <td>
                    {new Date(row.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="view-agreement"
                      onClick={() => remove(row)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
