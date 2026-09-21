"use client";

import { useEffect, useState } from "react";
import AdminShell, { adminHeaders } from "../AdminShell";

type Status = {
  oauth_configured: boolean;
  service_account: boolean;
  connected: boolean;
  email: string | null;
  service_account_present?: boolean;
  service_account_valid?: boolean;
  service_account_length?: number;
  agreements_folder_id: string;
  agreements_folder_url: string;
  using_default_folder: boolean;
  last_scan: string | null;
  callback_url: string;
};

type ScanResult = {
  folder_count: number;
  linked: number;
  unmatched_folders: { name: string; id: string; company: string | null }[];
  missing_in_drive: string[];
  created_from_drive?: string[];
  filled_assets?: string[];
  pending_assets?: number;
  ingest_errors?: { name: string; error: string }[];
};

export default function DrivePage() {
  return (
    <AdminShell>
      <DriveInner />
    </AdminShell>
  );
}

function DriveInner() {
  const [status, setStatus] = useState<Status | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState("");
  const [json, setJson] = useState("");

  const load = async () => {
    const res = await fetch("/api/admin/google/status", {
      headers: adminHeaders(),
    });
    if (!res.ok) return;
    setStatus(await res.json());
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected")) {
      setOk("Google Drive is connected. Deal folders have been matched where possible.");
    }
    if (params.get("error")) setError(params.get("error") || "");
    load();
  }, []);

  const connect = async () => {
    setBusy("connect");
    setError("");
    try {
      const res = await fetch("/api/admin/google/start", {
        headers: adminHeaders(),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not start Google sign-in");
      window.location.href = json.url;
    } catch (err: any) {
      setError(err.message || "Could not start Google sign-in");
      setBusy("");
    }
  };

  const saveJson = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("save");
    setError("");
    setOk("");
    try {
      const res = await fetch("/api/admin/google/service-account", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({ json }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the key");
      setJson("");
      setOk(`Saved. Connected as ${data.email}.`);
      await load();
    } catch (err: any) {
      setError(err.message || "Could not save the key");
    } finally {
      setBusy("");
    }
  };

  const runScan = async () => {
    setBusy("scan");
    setError("");
    setOk("");
    try {
      const res = await fetch("/api/admin/google/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: "{}",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Scan failed");
      setScan(json);
      const created = (json.created_from_drive || []).length;
      const filled = (json.filled_assets || []).length;
      setOk(
        `Matched ${json.linked} existing deals. ${created} new agreement${
          created === 1 ? "" : "s"
        } added from Drive. ${filled} pending asset${
          filled === 1 ? "" : "s"
        } filled from the HP documents.`
      );
      await load();
    } catch (err: any) {
      setError(err.message || "Scan failed");
    } finally {
      setBusy("");
    }
  };

  const disconnect = async () => {
    if (!confirm("Disconnect Google Drive from the admin book?")) return;
    setBusy("disconnect");
    await fetch("/api/admin/google/disconnect", {
      method: "POST",
      headers: adminHeaders(),
    });
    setScan(null);
    setOk("Disconnected.");
    setBusy("");
    await load();
  };

  return (
    <>
      <div className="admin-kicker">Google Drive</div>
      <h1>Deal documents</h1>
      <p className="admin-lead">
        Connect the Future FG Google Drive. Signed HP documents and goods
        schedules in each deal folder are used for asset details. New folders
        are added to the book; open lookup to amend anything that came through
        wrongly.
      </p>

      {ok && <div className="admin-ok">{ok}</div>}
      {error && <div className="admin-error">{error}</div>}

      <div className="admin-card" style={{ marginBottom: 22 }}>
        <h2>Connection</h2>
        {!status?.connected && (
          <>
            <p className="admin-lead" style={{ marginBottom: 16 }}>
              {status?.service_account_present && !status.service_account_valid ? (
                <>
                  The Vercel value is only {status.service_account_length}{" "}
                  characters — that is a name or folder id, not the key.
                  The real JSON from DCF is a few thousand characters and
                  starts with{" "}
                  <span className="mono">{`{"type": "service_account"`}</span>.
                  On DCF Vercel click the three dots next to{" "}
                  <span className="mono">GOOGLE_SERVICE_ACCOUNT_JSON</span>,
                  <strong> Edit / Reveal</strong>, copy everything, and
                  paste it below.
                </>
              ) : (
                <>
                  Paste the full{" "}
                  <span className="mono">GOOGLE_SERVICE_ACCOUNT_JSON</span>{" "}
                  from the DCF Portal Vercel project below.
                </>
              )}
            </p>
            <form className="admin-form" onSubmit={saveJson}>
              <div className="full">
                <label>Service account JSON</label>
                <textarea
                  rows={8}
                  value={json}
                  onChange={(e) => setJson(e.target.value)}
                  placeholder='{"type":"service_account","project_id":"portal-page-508706", ... }'
                  required
                />
              </div>
              <button type="submit" disabled={!!busy}>
                {busy === "save" ? "Saving…" : "Save and connect"}
              </button>
            </form>
          </>
        )}
        {status?.connected ? (
          <>
            <p className="admin-lead" style={{ marginBottom: 12 }}>
              {status.service_account
                ? "Using the DCF Google Drive service account"
                : "Connected as"}{" "}
              <strong>{status.email || "Google Drive"}</strong>. Folders
              are read from{" "}
              <a href={status.agreements_folder_url} target="_blank" rel="noreferrer">
                Agreements
              </a>
              {status.using_default_folder ? " (the Future FG pack)." : "."}
              {status.last_scan && (
                <>
                  {" "}
                  Last scan{" "}
                  {new Date(status.last_scan).toLocaleString("en-GB")}.
                </>
              )}
            </p>
            <div className="admin-actions">
              <button
                type="button"
                className="primary"
                onClick={runScan}
                disabled={!!busy}
              >
                {busy === "scan" ? "Scanning…" : "Scan deal folders"}
              </button>
              {status.service_account && (
                <button type="button" onClick={disconnect} disabled={!!busy}>
                  Disconnect
                </button>
              )}
            </div>
          </>
        ) : status?.oauth_configured ? (
          <div className="admin-actions">
            <button
              type="button"
              className="primary"
              onClick={connect}
              disabled={!!busy}
            >
              {busy === "connect" ? "Opening Google…" : "Connect Google Drive"}
            </button>
          </div>
        ) : null}
      </div>

      {scan && (
        <div className="admin-card">
          <h2>Last scan</h2>
          <p className="admin-lead">
            {scan.linked} existing deals linked to a folder.
            {(scan.created_from_drive || []).length
              ? ` Added ${(scan.created_from_drive || []).join(", ")} from Drive.`
              : ""}{" "}
            {(scan.filled_assets || []).length
              ? ` Filled assets on ${(scan.filled_assets || []).join(", ")}.`
              : ""}{" "}
            {scan.missing_in_drive.length} book deals still have no folder.
          </p>
          {(scan.ingest_errors || []).length > 0 && (
            <div className="admin-error" style={{ marginBottom: 12 }}>
              {(scan.ingest_errors || [])
                .map((row) => `${row.name}: ${row.error}`)
                .join(" ")}
            </div>
          )}
          {scan.unmatched_folders.length > 0 && (
            <table className="admin-table" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Drive folder</th>
                  <th>Company on folder</th>
                </tr>
              </thead>
              <tbody>
                {scan.unmatched_folders.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <a
                        href={`https://drive.google.com/drive/folders/${row.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {row.name}
                      </a>
                    </td>
                    <td>{row.company || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
