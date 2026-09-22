"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const SECRET_KEY = "ffg-admin-secret";
const NAME_KEY = "ffg-admin-name";
const SIDEBAR_KEY = "ffg-admin-sidebar-collapsed";

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
  { href: "", label: "Dashboard", icon: "home" },
  { href: "/figures", label: "Live figures", icon: "chart", owenOnly: true },
  { href: "/customers", label: "Customers", icon: "users" },
  { href: "/agreements", label: "Agreements", icon: "file" },
  { href: "/new-deal", label: "New deal", icon: "plus" },
  { href: "/lookup", label: "Lookup", icon: "search" },
  { href: "/drive", label: "Drive", icon: "folder" },
  { href: "/staff", label: "Staff", icon: "staff", ffgOnly: true },
];

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10M9 20v-6h6v6"/></>,
    chart: <><path d="M5 20V10M12 20V4M19 20v-7"/></>,
    users: <><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 20v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    file: <><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h8"/></>,
    plus: <><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    folder: <path d="M3 6h7l2 2h9v11H3z"/>,
    staff: <><circle cx="8" cy="8" r="3"/><circle cx="17" cy="8" r="3"/><path d="M2 20v-2a5 5 0 0 1 10 0v2M12 20v-2a5 5 0 0 1 10 0v2"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const base = adminBasePath(pathname);
  const isGg = base === "/admin/gg";
  const [unlocked, setUnlocked] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [who, setWho] = useState("");
  const [ownerDash, setOwnerDash] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const stored = getStoredAdminSecret();
    if (stored) {
      setUnlocked(true);
      setWho(sessionStorage.getItem(NAME_KEY) || "");
    }
  }, []);

  useEffect(() => {
    setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "true");
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggleSidebar = () => {
    setCollapsed((value) => {
      localStorage.setItem(SIDEBAR_KEY, String(!value));
      return !value;
    });
  };

  useEffect(() => {
    if (!unlocked) {
      setOwnerDash(false);
      return;
    }
    fetch("/api/admin/me", { headers: adminHeaders() })
      .then((res) => {
        if (res.status === 401) {
          sessionStorage.removeItem(SECRET_KEY);
          sessionStorage.removeItem(NAME_KEY);
          setUnlocked(false);
          return null;
        }
        return res.ok ? res.json() : null;
      })
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
      body: JSON.stringify({ email: email.trim(), password }),
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
          <p>Sign in with your admin email and password.</p>
          <form className="admin-lock-form" onSubmit={unlock}>
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
            <button type="submit">Open</button>
          </form>
          {error && <div className="admin-error">{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className={`admin-page admin-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <header className="admin-mobile-top">
        <Link href={base} className="admin-mobile-brand">
          <Image src="/logo-icon.png" alt="Future Finance Group" width={34} height={42} priority />
          <span>{isGg ? "Glacier Gem" : "Future FG"}</span>
        </Link>
        <button type="button" className="admin-menu-button" onClick={() => setMobileOpen((value) => !value)} aria-label="Open navigation" aria-expanded={mobileOpen}>
          <span /><span /><span />
        </button>
      </header>

      <aside className={`admin-sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <Link href={base} className="admin-sidebar-logo" aria-label="Future Finance Group dashboard">
          <Image className="admin-logo-full" src="/logo-full.png" alt="Future Finance Group Limited" width={176} height={135} priority />
          <Image className="admin-logo-icon" src="/logo-icon.png" alt="Future Finance Group Limited" width={42} height={52} priority />
        </Link>
        <nav aria-label="Admin navigation">
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
              title={collapsed ? item.label : undefined}
            >
              <NavIcon name={item.icon} />
              <span>{item.label}</span>
            </Link>
            );
          })}
        </nav>
        <div className="admin-sidebar-bottom">
          <div className="admin-sidebar-label">Company</div>
          <div className="admin-book-switch">
            <Link
              href="/admin"
              className={!isGg ? "on" : ""}
            >
              <NavIcon name="file" /><span>Future FG</span>
            </Link>
            <Link
              href="/admin/gg"
              className={isGg ? "on" : ""}
            >
              <NavIcon name="file" /><span>Glacier Gem</span>
            </Link>
          </div>
          {who && who !== "Staff" && (
            <div className="admin-user"><span>{who.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><b>{who}</b></div>
          )}
          <button type="button" className="admin-signout" onClick={signOut}>
            <NavIcon name="search" /><span>Sign out</span>
          </button>
          <button type="button" className="admin-collapse" onClick={toggleSidebar} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            <span aria-hidden="true">{collapsed ? "›" : "‹"}</span><b>{collapsed ? "" : "Collapse sidebar"}</b>
          </button>
        </div>
      </aside>
      {mobileOpen && <button className="admin-sidebar-scrim" type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}

      <div className="admin-workspace">
        <header className="admin-utility">
          <div><strong>{isGg ? "Glacier Gem" : "Future FG"}</strong><span>/</span><span>{NAV.find((item) => `${base}${item.href}` === pathname)?.label || "Admin"}</span></div>
          <div className="admin-utility-right"><Link href="/">Website ↗</Link>{who && <span className="admin-avatar">{who.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>}</div>
        </header>
        <main className="admin-main">{children}</main>
      </div>
    </div>
  );
}
