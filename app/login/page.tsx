"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState("");

  const urlErrorMsg =
    urlError === "no-account"
      ? "You're signed in, but we don't have a customer record linked to this email yet. Call us and we'll set it up."
      : urlError === "no-agreement"
        ? "We couldn't find an agreement on this account. Call us if that doesn't sound right."
        : urlError === "link-expired"
          ? "That login link is invalid or has expired. Request a new one below."
          : "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");

    try {
      const res = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          origin: window.location.origin,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error || "Something went wrong — please try again.");
        return;
      }
      setStatus("sent");
    } catch {
      setStatus("error");
      setErrorMsg("Couldn't reach the server — please try again.");
    }
  };

  return (
    <>
      <nav>
        <div className="nav-inner">
          <div className="wordmark">
            <span className="dot"></span>
            FUTURE FG
          </div>
        </div>
      </nav>

      <div className="wrap">
        <div
          style={{
            maxWidth: 420,
            margin: "80px auto",
            textAlign: "center",
          }}
        >
          <div className="hero-tag" style={{ marginBottom: 24 }}>
            Customer portal
          </div>
          <h1 style={{ fontSize: 28, color: "var(--navy)", marginBottom: 12 }}>
            Log in to your account
          </h1>
          <p
            style={{
              color: "var(--ink-soft)",
              fontSize: 14.5,
              marginBottom: 32,
            }}
          >
            Enter the email address we hold on file for your agreement, and
            we&apos;ll send you a secure link to log in — no password
            needed.
          </p>

          {urlErrorMsg && status === "idle" && (
            <p style={{ color: "#B42318", fontSize: 13, marginBottom: 20 }}>
              {urlErrorMsg}
            </p>
          )}

          {status === "sent" ? (
            <div
              className="status-strip"
              style={{ justifyContent: "center", textAlign: "left" }}
            >
              <span className="status-dot"></span>
              <span className="txt">
                Check <b>{email}</b> for a login link. It&apos;ll expire in a
                few minutes.
              </span>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="company-field" style={{ marginBottom: 16 }}>
                <input
                  type="email"
                  required
                  placeholder="you@yourbusiness.co.uk"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="btn btn-solid"
                style={{ width: "100%", border: "none" }}
                disabled={status === "sending"}
              >
                {status === "sending" ? "Sending..." : "Send me a login link"}
              </button>
              {status === "error" && (
                <p style={{ color: "#B42318", fontSize: 13, marginTop: 12 }}>
                  {errorMsg || "Something went wrong — please try again."}
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
