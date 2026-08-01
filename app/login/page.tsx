"use client";

import { useState } from "react";
import { createClient } from "../../lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState("");

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
    } else {
      setStatus("sent");
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

          {status === "sent" ? (
            <div
              className="status-strip"
              style={{ justifyContent: "center", textAlign: "left" }}
            >
              <span className="status-dot"></span>
              <span className="txt">
                Check <b>{email}</b> for a login link. It'll expire in a few
                minutes.
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
