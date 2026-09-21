"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const SECRET_KEY = "ffg-admin-secret";
const NAME_KEY = "ffg-admin-name";

export function getStoredAdminSecret() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(SECRET_KEY) || "";
}

export function currentAdminBook() {
  if (typeof window === "undefined") return "ffg";
  return window.location.pathname.startsWith("/admin/gg") ? "gg" : "ffg";
}

export function adminHeaders() {
  return {
    "x-admin-secret": getStoredAdminSecret(),
    "x-admin-book": currentAdminBook(),
  };
}

export function adminBasePath(pathname?: string) {
  const path = pathname || (typeof window !== "undefined" ? window.location.pathname : "");
  return path.startsWith("/admin/gg") ? "/admin/gg" : "/admin";
}

const NAV = [
  { href: "", label: "Dashboard" },
  { href: "/figures", label: "Live figures", owenOnly: true },
  { href: "/customers", label: "Customers" },
  { href: "/agreements", label: "Agreements" },
  { href: "/new-deal", label: "New deal" },
  { href: "/lookup", label: "Lookup" },
  { href: "/drive", label: "Drive" },
  { href: "/staff", label: "Staff", ffgOnly: true },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const base = adminBasePath(pathname);
  const isGg = base === "/admin/gg";
  const [unlocked, setUnlocked] = useState(false);
  const [mode, setMode] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [who, setWho] = useState("");
  const [ownerDash, setOwnerDash] = useState(false);

  useEffect(() => {
    const stored = getStoredAdminSecret();
    if (stored) {
      setUnlocked(true);
      setWho(sessionStorage.getItem(NAME_KEY) || "");
    }
  }, []);

  useEffect(() => {
    if (!unlocked) {
      setOwnerDash(false);
      return;
    }
    fetch("/api/admin/me", { headers: adminHeaders() })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        setOwnerDash(!!json?.owner_dashboard);
        if (json?.name) setWho(json.name);
      })
      .catch(() => setOwnerDash(false));
  }, [unlocked]);

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        mode === "code"
          ? { secret: secret.trim() }
          : { email: email.trim(), password }
      ),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "That login didn't match.");
      return;
    }
    sessionStorage.setItem(SECRET_KEY, json.token);
    sessionStorage.setItem(NAME_KEY, json.name || json.email || "");
    setWho(json.name || json.email || "");
    setUnlocked(true);
  };

  const signOut = () => {
    sessionStorage.removeItem(SECRET_KEY);
    sessionStorage.removeItem(NAME_KEY);
    setUnlocked(false);
    setPassword("");
    setSecret("");
  };

  if (!unlocked) {
    return (
      <div className="admin-page">
        <div className="admin-lock">
          <div className="admin-brand">
            <span className="dot" />
            {isGg ? "Glacier Gem admin" : "Future FG admin"}
          </div>
          <h1>Staff only</h1>
          <p>Sign in with your admin email, or the staff code.</p>
          <div className="admin-tabs" style={{ marginBottom: 16 }}>
            <button
              type="button"
              className={`admin-tab ${mode === "email" ? "on" : ""}`}
              onClick={() => setMode("email")}
            >
              Email
            </button>
            <button
              type="button"
              className={`admin-tab ${mode === "code" ? "on" : ""}`}
              onClick={() => setMode("code")}
            >
              Staff code
            </button>
          </div>
          <form className="admin-lock-form" onSubmit={unlock}>
            {mode === "email" ? (
              <>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@ffg.finance"
                  autoComplete="username"
                  required
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  autoComplete="current-password"
                  required
                />
              </>
            ) : (
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Staff code"
                autoComplete="off"
                required
              />
            )}
            <button type="submit">Open</button>
          </form>
          {error && <div className="admin-error">{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <header className="admin-top">
        <Link href={base} className="admin-brand">
          <span className="dot" />
          {isGg ? "Glacier Gem admin" : "Future FG admin"}
        </Link>
        <nav>
          {NAV.filter(
            (item) =>
              (!item.owenOnly || ownerDash) &&
              (!item.ffgOnly || !isGg)
          ).map((item) => {
            const href = `${base}${item.href}` || base;
            const path = href || base;
            return (
            <Link
              key={path}
              href={path}
              className={
                pathname === path ||
                (item.href !== "" && pathname.startsWith(path))
                  ? "active"
                  : ""
              }
            >
              {item.label}
            </Link>
            );
          })}
        </nav>
        <div className="admin-home-wrap">
          {who && who !== "Staff" && (
            <span className="admin-who">{who}</span>
          )}
          <div className="admin-book-switch">
            <Link
              href="/admin"
              className={!isGg ? "on" : ""}
            >
              Future FG
            </Link>
            <Link
              href="/admin/gg"
              className={isGg ? "on" : ""}
            >
              Glacier Gem
            </Link>
          </div>
          <button type="button" className="admin-signout" onClick={signOut}>
            Sign out
          </button>
          <Link href="/" className="admin-home">
            Website
          </Link>
        </div>
      </header>
      <main className="admin-main">{children}</main>
    </div>
  );
}
