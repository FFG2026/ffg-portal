"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const SECRET_KEY = "ffg-admin-secret";

export function getStoredAdminSecret() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(SECRET_KEY) || "";
}

export function adminHeaders() {
  return { "x-admin-secret": getStoredAdminSecret() };
}

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/agreements", label: "Agreements" },
  { href: "/admin/new-deal", label: "New deal" },
  { href: "/admin/lookup", label: "Lookup" },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [secret, setSecret] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = getStoredAdminSecret();
    if (stored) {
      setSecret(stored);
      setUnlocked(true);
    }
  }, []);

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/admin/dashboard", {
      headers: { "x-admin-secret": secret.trim() },
    });
    if (!res.ok) {
      setError("That secret didn't match.");
      return;
    }
    sessionStorage.setItem(SECRET_KEY, secret.trim());
    setUnlocked(true);
  };

  if (!unlocked) {
    return (
      <div className="admin-page">
        <div className="admin-lock">
          <div className="admin-brand">
            <span className="dot" />
            Future FG admin
          </div>
          <h1>Staff only</h1>
          <p>Enter the admin secret to open the book.</p>
          <form onSubmit={unlock}>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Admin secret"
              autoComplete="off"
            />
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
        <Link href="/admin" className="admin-brand">
          <span className="dot" />
          Future FG admin
        </Link>
        <nav>
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={
                pathname === item.href ||
                (item.href !== "/admin" && pathname.startsWith(item.href))
                  ? "active"
                  : ""
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Link href="/" className="admin-home">
          Website
        </Link>
      </header>
      <main className="admin-main">{children}</main>
    </div>
  );
}
