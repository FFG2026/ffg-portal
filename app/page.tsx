"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

type CompanyResult = {
  name: string;
  number: string;
  status: string;
  address: string | null;
};

export default function HomePage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [step, setStep] = useState(1);

  // Step 1
  const [amount, setAmount] = useState(50000);
  const [bizType, setBizType] = useState<"ltd" | "sole">("ltd");
  const [companyQuery, setCompanyQuery] = useState("");
  const [companySelected, setCompanySelected] = useState("");
  const [companyNumber, setCompanyNumber] = useState("");
  const [matches, setMatches] = useState<CompanyResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 2
  const [assetType, setAssetType] = useState("");
  const [assetDescription, setAssetDescription] = useState("");
  const [assetCondition, setAssetCondition] = useState<"new" | "used">("used");
  const [assetCost, setAssetCost] = useState("");

  // Step 3
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const formatAmount = (n: number) => `£${n.toLocaleString("en-GB")}`;
  const stepAmount = (delta: number) =>
    setAmount((prev) => Math.max(10000, Math.min(1000000, prev + delta)));

  const resetDrawer = () => {
    setStep(1);
    setAmount(50000);
    setBizType("ltd");
    setCompanyQuery("");
    setCompanySelected("");
    setCompanyNumber("");
    setMatches([]);
    setAssetType("");
    setAssetDescription("");
    setAssetCondition("used");
    setAssetCost("");
    setContactName("");
    setContactEmail("");
    setContactPhone("");
    setSubmitError("");
  };

  const step1Valid = !!companySelected && !!companyNumber;
  const step2Valid = !!assetType && assetDescription.trim().length > 1;
  const step3Valid =
    contactName.trim().length > 1 &&
    /\S+@\S+\.\S+/.test(contactEmail) &&
    contactPhone.trim().length > 6;

  const submitApplication = async () => {
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          bizType,
          companyName: companySelected,
          companyNumber,
          assetType,
          assetDescription,
          assetCondition,
          assetCost: assetCost ? Number(assetCost) : null,
          contactName,
          contactEmail,
          contactPhone,
        }),
      });
      if (!res.ok) throw new Error("Submission failed");
      setStep(4);
    } catch {
      setSubmitError(
        "Something went wrong sending your application. Please try again, or call us on 07525 823547."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Debounced live Companies House search -- waits for a short pause
  // in typing before calling the API, so we're not firing a request
  // on every keystroke.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (companyQuery.trim().length < 2) {
      setMatches([]);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/companies-house/search?q=${encodeURIComponent(companyQuery.trim())}`
        );
        const data = await res.json();
        setMatches(data.items || []);
      } catch {
        setMatches([]);
      } finally {
        setSearchLoading(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [companyQuery]);

  return (
    <>
      <nav>
        <div className="nav-inner">
          <div className="wordmark">
            <img src="/logo-icon.png" alt="Future FG" className="logo-mark" />
            <div>
              FUTURE FG
              <small>BUSINESS &amp; ASSET FINANCE SPECIALISTS</small>
            </div>
          </div>
          <div className="nav-links">
            <a href="#products">Funding solutions</a>
            <a href="#specialities">Specialities</a>
            <a href="#why">Why Future FG</a>
            <a href="#portal">Customer portal</a>
          </div>
          <div className="nav-right">
            <Link href="/portal" className="btn btn-outline">
              Customer login
            </Link>
            <button
              className="btn btn-solid"
              style={{ border: "none" }}
              onClick={() => setDrawerOpen(true)}
            >
              Apply now
            </button>
          </div>
        </div>
      </nav>

      <div className="wrap">
        <section className="hero">
          <div className="hero-tag">Rochester, Kent &middot; Business asset finance</div>
          <h1>
            Finance for the assets that keep your business <em>moving</em>.
          </h1>
          <p>
            Hire purchase, finance lease and loan agreements for vehicles,
            plant and equipment — arranged directly with a lender who still
            answers the phone.
          </p>
          <div className="hero-ctas">
            <button
              className="btn btn-solid"
              style={{ border: "none" }}
              onClick={() => setDrawerOpen(true)}
            >
              Apply for finance
            </button>
            <a href="#portal" className="btn btn-outline">
              Get your settlement figure
            </a>
          </div>

          <div className="hero-visual">
            <div className="hero-visual-inner">
              <div>
                <div className="hv-label">Settlement, on demand</div>
                <h3>
                  See exactly what it costs to settle early — any time you
                  need it.
                </h3>
              </div>
              <div className="hv-card">
                <div className="row">
                  <span>Agreement</span>
                  <span>HP5962</span>
                </div>
                <div className="row">
                  <span>Asset</span>
                  <span>Ford Transit</span>
                </div>
                <div className="row">
                  <span>Paid</span>
                  <span>24 / 48</span>
                </div>
                <div className="total">
                  <span className="l">Settlement</span>
                  <span className="v">£6,738</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="stats-strip">
          <div className="stats-grid">
            <div className="stat">
              <div className="num">2.5%</div>
              <div className="lbl">Rates from</div>
            </div>
            <div className="stat">
              <div className="num">£7.5K–£10M</div>
              <div className="lbl">Lending range</div>
            </div>
            <div className="stat">
              <div className="num">24 hrs</div>
              <div className="lbl">Average turnaround</div>
            </div>
            <div className="stat">
              <div className="num">HP &middot; FL &middot; L</div>
              <div className="lbl">Agreement types</div>
            </div>
          </div>
        </section>
      </div>

      <div className="wrap" id="products">
        <section className="section">
          <div className="section-head">
            <div className="eyebrow">Funding solutions</div>
            <h2>Three ways to fund the asset.</h2>
            <p>
              Whichever structure suits your business, you deal with the
              same team from application through to settlement.
            </p>
          </div>
          <div className="products-grid">
            <div className="product-card">
              <div className="p-icon">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8}>
                  <path d="M3 12h18M3 6h18M3 18h18" />
                </svg>
              </div>
              <h3>Hire Purchase</h3>
              <p>
                Fixed monthly instalments, with ownership of the asset
                transferring to you once the agreement is settled in full.
              </p>
              <span className="learn">HP agreements &rarr;</span>
            </div>
            <div className="product-card">
              <div className="p-icon">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8}>
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                  <path d="M4 10h16" />
                </svg>
              </div>
              <h3>Finance Lease</h3>
              <p>
                Use the asset for an agreed term without tying up capital in
                ownership — suited to equipment you update regularly.
              </p>
              <span className="learn">FL agreements &rarr;</span>
            </div>
            <div className="product-card">
              <div className="p-icon">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8}>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 3" />
                </svg>
              </div>
              <h3>Business Loan</h3>
              <p>
                A structured loan secured against the asset being financed,
                repaid on a schedule agreed at the outset.
              </p>
              <span className="learn">Loan agreements &rarr;</span>
            </div>
          </div>
        </section>
      </div>

      <div className="wrap" id="specialities">
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="section-head">
            <div className="eyebrow">Specialities</div>
            <h2>Assets we finance</h2>
          </div>
          <div className="spec-strip">
            <div className="spec-item">
              <div className="s-icon">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8}>
                  <rect x="2" y="8" width="14" height="8" rx="1" />
                  <path d="M16 11h3l3 3v2h-6z" />
                  <circle cx="6.5" cy="18.5" r="1.5" />
                  <circle cx="17.5" cy="18.5" r="1.5" />
                </svg>
              </div>
              <span>Vehicles</span>
            </div>
            <div className="spec-item">
              <div className="s-icon">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8}>
                  <rect x="1" y="10" width="12" height="7" rx="1" />
                  <path d="M13 12h4l4 3v2h-8z" />
                  <circle cx="5" cy="19" r="1.6" />
                  <circle cx="16" cy="19" r="1.6" />
                </svg>
              </div>
              <span>Commercial vehicles</span>
            </div>
            <div className="spec-item">
              <div className="s-icon">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8}>
                  <path d="M3 20h6l2-9-5 2v7" />
                  <path d="M11 20l3-12 4 3v9" />
                </svg>
              </div>
              <span>Plant &amp; construction</span>
            </div>
            <div className="spec-item">
              <div className="s-icon">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8}>
                  <circle cx="7" cy="17" r="3" />
                  <circle cx="17" cy="17" r="2" />
                  <path d="M4 17V9l6-2 4 4h4" />
                </svg>
              </div>
              <span>Agriculture</span>
            </div>
            <div className="spec-item">
              <div className="s-icon">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8}>
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                  <path d="M9 9h6v6H9z" />
                </svg>
              </div>
              <span>Machinery &amp; equipment</span>
            </div>
          </div>
        </section>
      </div>

      <div className="wrap" id="why">
        <section className="section">
          <div className="why-grid">
            <div
              className="why-visual"
              style={{ backgroundImage: "url('/office.jpg')" }}
            >
              <div className="tag-caption">
                Our office at Ordnance Yard, Upnor Road, Rochester
              </div>
            </div>
            <div className="why-copy">
              <div className="eyebrow">Why Future FG</div>
              <h2>A finance company that still deals with you directly.</h2>
              <p>
                We&apos;re based in Rochester, Kent, and we arrange
                business-purpose finance for companies and sole traders
                who&apos;d rather speak to the person making the decision
                than work through a call centre.
              </p>
              <div className="why-points">
                <div className="why-point">
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth={2}>
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  Direct contact throughout
                </div>
                <div className="why-point">
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth={2}>
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  Plain, fixed figures
                </div>
                <div className="why-point">
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth={2}>
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  Settlement figures on demand
                </div>
                <div className="why-point">
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth={2}>
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  Kent-based, UK-wide
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="wrap" id="portal">
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="portal-band">
            <div className="portal-inner">
              <div>
                <div className="eyebrow">For existing customers</div>
                <h2>
                  Check your settlement figure without picking up the phone.
                </h2>
                <p>
                  Log in to see your current balance, your up-to-date
                  settlement figure and our bank details — or apply for
                  finance on another asset using the details we already
                  hold.
                </p>
              </div>
              <div className="portal-actions">
                <Link href="/portal" className="btn btn-white">
                  Log in to your account
                </Link>
                <a href="#contact" className="btn btn-ghost">
                  Request by phone instead
                </a>
                <div className="portal-hint">
                  Portal access is being rolled out — call us if yours
                  isn&apos;t set up yet.
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="wrap" id="contact">
        <footer>
          <div className="footer-top">
            <div className="footer-brand">
              <div className="wordmark" style={{ marginBottom: 14 }}>
                <img src="/logo-icon.png" alt="Future FG" className="logo-mark" />
                <div>
                  FUTURE FG
                  <small>BUSINESS &amp; ASSET FINANCE SPECIALISTS</small>
                </div>
              </div>
              <p>
                Future F G Limited is a hire purchase and finance company
                based in Rochester, Kent, arranging business-purpose
                finance for vehicles, plant and equipment.
              </p>
            </div>
            <div className="footer-col">
              <h4>Contact</h4>
              <a href="tel:07525823547">07525 823547</a>
              <a href="mailto:olb@ffg.finance">olb@ffg.finance</a>
              <p>
                No. 9 Magazine B
                <br />
                Ordnance Yard, Upnor Road
                <br />
                Rochester, Kent, ME2 4UY
              </p>
            </div>
            <div className="footer-col">
              <h4>Funding</h4>
              <a href="#products">Hire Purchase</a>
              <a href="#products">Finance Lease</a>
              <a href="#products">Business Loan</a>
            </div>
            <div className="footer-col">
              <h4>Company</h4>
              <a href="#why">Why Future FG</a>
              <a href="#portal">Customer portal</a>
              <a href="#contact">Get in touch</a>
            </div>
          </div>
          <div className="footer-bottom">
            <div>&copy; 2026 Future F G Limited. Company No. 13707744.</div>
            <div>Registered in England &amp; Wales</div>
          </div>
        </footer>
      </div>

      {/* APPLY DRAWER */}
      <div
        className={`overlay ${drawerOpen ? "open" : ""}`}
        onClick={() => {
          setDrawerOpen(false);
          if (step === 4) resetDrawer();
        }}
      ></div>
      <div className={`drawer ${drawerOpen ? "open" : ""}`}>
        <div className="drawer-progress">
          <div
            className="fill"
            style={{ width: `${Math.min(step, 3) * 33.33}%` }}
          ></div>
        </div>
        <div className="drawer-head">
          <span className="step-lbl">
            {step <= 3 ? `Step ${step} of 3` : "Done"}
          </span>
          <button
            className="drawer-close"
            onClick={() => {
              setDrawerOpen(false);
              if (step === 4) resetDrawer();
            }}
          >
            &times;
          </button>
        </div>
        <div className="drawer-body">
          {step === 1 && (
            <>
              <h3>Tell us about the finance you need</h3>

              <div className="field-label">
                <span className="ok">&#10003;</span> How much would you like to
                borrow?
              </div>
              <div className="amount-row">
                <button className="amt-btn" onClick={() => stepAmount(-10000)}>
                  &minus;
                </button>
                <input type="text" value={formatAmount(amount)} readOnly />
                <button className="amt-btn" onClick={() => stepAmount(10000)}>
                  +
                </button>
              </div>
              <div className="amount-minmax">
                <span>Min. £10,000</span>
                <span>£1,000,000 Max.</span>
              </div>
              <div className="chip-row">
                {[10000, 25000, 50000, 100000, 250000, 500000].map((v) => (
                  <div className="chip" key={v} onClick={() => setAmount(v)}>
                    £{v / 1000}k
                  </div>
                ))}
              </div>

              <div className="field-label">
                <span className="ok">&#10003;</span> Business type
              </div>
              <div className="biz-toggle">
                <div
                  className={`biz-opt ${bizType === "ltd" ? "selected" : ""}`}
                  onClick={() => setBizType("ltd")}
                >
                  Limited Company
                </div>
                <div
                  className={`biz-opt ${bizType === "sole" ? "selected" : ""}`}
                  onClick={() => setBizType("sole")}
                >
                  Sole trader / Partnership
                </div>
              </div>

              <div className="field-label">Company name</div>
              <div className="company-field">
                <input
                  type="text"
                  placeholder="Start typing your company name"
                  value={companyQuery}
                  onChange={(e) => {
                    setCompanyQuery(e.target.value);
                    if (e.target.value !== companySelected) {
                      setCompanySelected("");
                      setCompanyNumber("");
                    }
                  }}
                  autoComplete="off"
                />
                <span className="search-ic">&#128269;</span>
              </div>
              <div
                className={`company-results ${
                  matches.length || searchLoading ? "show" : ""
                }`}
              >
                {searchLoading && (
                  <div className="company-result company-result-loading">
                    Searching Companies House…
                  </div>
                )}
                {!searchLoading &&
                  matches.map((c) => (
                    <div
                      className="company-result"
                      key={c.number}
                      onClick={() => {
                        setCompanySelected(c.name);
                        setCompanyNumber(c.number);
                        setCompanyQuery(c.name);
                        setMatches([]);
                      }}
                    >
                      {c.name}
                      <div className="num">
                        Company No. {c.number}
                        {c.status && c.status !== "active"
                          ? ` · ${c.status}`
                          : ""}
                      </div>
                    </div>
                  ))}
              </div>
              <div className="drawer-hint">
                {step1Valid
                  ? `Selected: ${companySelected} (Company No. ${companyNumber})`
                  : "We'll look this up via Companies House and confirm your registered details on the next step."}
              </div>

              <button
                className="drawer-cta"
                disabled={!step1Valid}
                onClick={() => step1Valid && setStep(2)}
              >
                Continue
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <h3>Tell us about the asset</h3>

              <div className="field-label">
                <span className="ok">&#10003;</span> Asset type
              </div>
              <div className="chip-row">
                {["Vehicle", "Plant & Equipment", "Commercial Vehicle", "Other"].map(
                  (t) => (
                    <div
                      className={`chip ${assetType === t ? "chip-selected" : ""}`}
                      key={t}
                      onClick={() => setAssetType(t)}
                    >
                      {t}
                    </div>
                  )
                )}
              </div>

              <div className="field-label">Asset description</div>
              <div className="company-field">
                <input
                  type="text"
                  placeholder="e.g. Ford Transit L3H3, or CAT 320 excavator"
                  value={assetDescription}
                  onChange={(e) => setAssetDescription(e.target.value)}
                  autoComplete="off"
                />
              </div>

              <div className="field-label">Condition</div>
              <div className="biz-toggle">
                <div
                  className={`biz-opt ${assetCondition === "new" ? "selected" : ""}`}
                  onClick={() => setAssetCondition("new")}
                >
                  New
                </div>
                <div
                  className={`biz-opt ${assetCondition === "used" ? "selected" : ""}`}
                  onClick={() => setAssetCondition("used")}
                >
                  Used
                </div>
              </div>

              <div className="field-label">Cost of asset (optional)</div>
              <div className="company-field">
                <input
                  type="number"
                  placeholder="£"
                  value={assetCost}
                  onChange={(e) => setAssetCost(e.target.value)}
                />
              </div>

              <div className="drawer-btn-row">
                <button className="drawer-cta-secondary" onClick={() => setStep(1)}>
                  Back
                </button>
                <button
                  className="drawer-cta"
                  disabled={!step2Valid}
                  onClick={() => step2Valid && setStep(3)}
                >
                  Continue
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h3>Your contact details</h3>

              <div className="field-label">Your name</div>
              <div className="company-field">
                <input
                  type="text"
                  placeholder="Full name"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  autoComplete="name"
                />
              </div>

              <div className="field-label">Email</div>
              <div className="company-field">
                <input
                  type="email"
                  placeholder="you@yourbusiness.co.uk"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>

              <div className="field-label">Phone</div>
              <div className="company-field">
                <input
                  type="tel"
                  placeholder="07…"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  autoComplete="tel"
                />
              </div>

              <div className="drawer-hint">
                {formatAmount(amount)} · {companySelected} · {assetType}:{" "}
                {assetDescription}
              </div>

              {submitError && (
                <div className="drawer-hint drawer-error">{submitError}</div>
              )}

              <div className="drawer-btn-row">
                <button className="drawer-cta-secondary" onClick={() => setStep(2)}>
                  Back
                </button>
                <button
                  className="drawer-cta"
                  disabled={!step3Valid || submitting}
                  onClick={submitApplication}
                >
                  {submitting ? "Submitting…" : "Submit application"}
                </button>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h3>Application received</h3>
              <p className="drawer-success-copy">
                Thanks, {contactName.split(" ")[0]} — we&apos;ve got your
                application for {formatAmount(amount)} of finance for{" "}
                {companySelected}. Someone from Future FG will be in touch
                shortly, usually within one working day.
              </p>
              <button
                className="drawer-cta"
                onClick={() => {
                  setDrawerOpen(false);
                  resetDrawer();
                }}
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
