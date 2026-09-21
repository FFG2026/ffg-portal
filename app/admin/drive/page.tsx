"use client";

import { useEffect, useState } from "react";
import AdminShell, { adminHeaders } from "../AdminShell";

type Status = {
  oauth_configured: boolean;
  connected: boolean;
  email: string | null;
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
      setOk(
        `Matched ${json.linked} deal folders out of ${json.folder_count} in Drive.`
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
        Connect the Future FG Google Drive. Agreement folders such as
        HP143 - Company are matched to the book, and the signed paperwork
        shows on lookup.
      </p>

      {ok && <div className="admin-ok">{ok}</div>}
      {error && <div className="admin-error">{error}</div>}

      <div className="admin-card" style={{ marginBottom: 22 }}>
        <h2>Connection</h2>
        {!status?.oauth_configured && (
          <p className="admin-lead" style={{ marginBottom: 16 }}>
            Add <span className="mono">GOOGLE_CLIENT_ID</span> and{" "}
            <span className="mono">GOOGLE_CLIENT_SECRET</span> in Vercel.
            The authorised redirect URI is{" "}
            <span className="mono">{status?.callback_url}</span>. Sign in
            with the Google account that can see the Agreements folder
            (usually sales@dcfgroup.co.uk).
          </p>
        )}
        {status?.connected ? (
          <>
            <p className="admin-lead" style={{ marginBottom: 12 }}>
              Connected as{" "}
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
              <button type="button" onClick={connect} disabled={!!busy}>
                Reconnect
              </button>
              <button type="button" onClick={disconnect} disabled={!!busy}>
                Disconnect
              </button>
            </div>
          </>
        ) : (
          <div className="admin-actions">
            <button
              type="button"
              className="primary"
              onClick={connect}
              disabled={!!busy || status?.oauth_configured === false}
            >
              {busy === "connect" ? "Opening Google…" : "Connect Google Drive"}
            </button>
          </div>
        )}
      </div>

      {scan && (
        <div className="admin-card">
          <h2>Last scan</h2>
          <p className="admin-lead">
            {scan.linked} book deals now have a Drive folder.{" "}
            {scan.missing_in_drive.length} in the book have no matching
            folder. {scan.unmatched_folders.length} Drive folders did not
            match a deal.
          </p>
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
