"use client";

import { useCallback, useEffect, useState } from "react";
import { adminHeaders } from "../AdminShell";

type Vehicle = {
  registration: string;
  description: string | null;
  capital_basis: string;
  status: string;
  rental_share: number;
  instalments_remaining: number;
  settlement_figure: number;
  settled_date: string | null;
  settled_amount: number | null;
  settled_instalments: number | null;
};

type Loaded = {
  tracked: boolean;
  monthly_instalment?: number;
  vehicles: Vehicle[];
};

type Done = {
  vehicles: string;
  figure: number;
  amount: number;
  difference: number;
  old_monthly: number;
  new_monthly: number;
  next_due: string | null;
  agreement_status: string;
};

const BASIS: Record<string, string> = {
  settlement_letter: "Funder letter",
  schedule_sheet: "Schedule",
  allocated_equal: "Estimated split",
  no_finance: "No finance",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function VehicleSettlement({
  agreementNumber,
  gbp,
  formatDate,
  onDone,
}: {
  agreementNumber: string;
  gbp: (n: number) => string;
  formatDate: (d: string | null) => string;
  onDone: () => void;
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [settledDate, setSettledDate] = useState(todayIso);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Done | null>(null);

  const load = useCallback(
    async (asOf: string) => {
      try {
        const res = await fetch(
          `/api/admin/vehicle-settlement?agreement=${encodeURIComponent(
            agreementNumber
          )}&as_of=${asOf}&_=${Date.now()}`,
          { headers: adminHeaders(), cache: "no-store" }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Could not load vehicles");
        setData(json);
      } catch (err: any) {
        setError(err.message || "Could not load vehicles");
      }
    },
    [agreementNumber]
  );

  useEffect(() => {
    load(settledDate);
  }, [load, settledDate]);

  if (!data || !data.tracked) return null;

  const active = data.vehicles.filter((v) => v.status === "active");
  const settled = data.vehicles.filter((v) => v.status === "settled");
  const chosen = active.filter((v) => picked.includes(v.registration));
  const figure =
    Math.round(chosen.reduce((s, v) => s + v.settlement_figure, 0) * 100) / 100;
  const share =
    Math.round(chosen.reduce((s, v) => s + v.rental_share, 0) * 100) / 100;
  const remainingMonthly =
    Math.round(
      (active
        .filter((v) => !picked.includes(v.registration))
        .reduce((s, v) => s + v.rental_share, 0)) * 100
    ) / 100;
  const payAmount = amount === "" ? figure : Number(amount);
  const estimated = chosen.some((v) => v.capital_basis === "allocated_equal");

  const toggle = (reg: string) => {
    setConfirming(false);
    setPicked((p) => (p.includes(reg) ? p.filter((r) => r !== reg) : [...p, reg]));
  };

  const settle = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/vehicle-settlement", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({
          agreement_number: agreementNumber,
          registrations: picked,
          amount: amount === "" ? null : amount,
          settled_date: settledDate,
          note,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not settle");
      setDone(json);
      setPicked([]);
      setAmount("");
      setNote("");
      setConfirming(false);
      await load(settledDate);
      onDone();
    } catch (err: any) {
      setError(err.message || "Could not settle");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="lookup-manual">
      <button
        type="button"
        className="lookup-manual-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Close vehicles" : "Vehicles & settlement"}
      </button>

      {done && (
        <div className="lookup-ok">
          Settled {done.vehicles}: {gbp(done.amount)} recorded
          {Math.abs(done.difference) >= 0.005
            ? ` (${gbp(Math.abs(done.difference))} ${
                done.difference > 0 ? "over" : "under"
              } the ${gbp(done.figure)} figure)`
            : ""}
          . Monthly changes from {gbp(done.old_monthly)} to{" "}
          {gbp(done.new_monthly)}
          {done.next_due
            ? ` — set the Direct Debit to ${gbp(done.new_monthly)} from ${formatDate(
                done.next_due
              )}.`
            : "."}
          {done.agreement_status === "settled" ? " Agreement is now fully settled." : ""}
        </div>
      )}

      {open && (
        <div className="lookup-manual-form">
          <p className="lookup-manual-help">
            Settlement figure = each vehicle's share of the rental × the
            instalments still to come after the date below (no rebate). Tick
            the vehicles being settled.
          </p>

          <div className="lookup-field">
            <label>Settlement date</label>
            <input
              type="date"
              value={settledDate}
              onChange={(e) => {
                setSettledDate(e.target.value);
                setConfirming(false);
              }}
            />
          </div>

          <div style={{ overflowX: "auto" }}>
            <style>{`.vs-table th,.vs-table td{padding:6px 14px;white-space:nowrap}.vs-table th:first-child,.vs-table td:first-child{padding-left:4px;padding-right:4px}.vs-table tbody tr{border-top:1px solid rgba(0,0,0,0.06)}`}</style>
            <table className="vs-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th></th>
                  <th>Reg</th>
                  <th>Basis</th>
                  <th style={{ textAlign: "right" }}>Monthly</th>
                  <th style={{ textAlign: "right" }}>Left</th>
                  <th style={{ textAlign: "right" }}>Settle at</th>
                </tr>
              </thead>
              <tbody>
                {active.map((v) => (
                  <tr key={v.registration}>
                    <td>
                      <input
                        type="checkbox"
                        checked={picked.includes(v.registration)}
                        onChange={() => toggle(v.registration)}
                        disabled={v.instalments_remaining === 0}
                      />
                    </td>
                    <td className="mono">{v.registration}</td>
                    <td>{BASIS[v.capital_basis] || v.capital_basis}</td>
                    <td className="mono" style={{ textAlign: "right" }}>
                      {gbp(v.rental_share)}
                    </td>
                    <td className="mono" style={{ textAlign: "right" }}>
                      {v.instalments_remaining}
                    </td>
                    <td className="mono" style={{ textAlign: "right" }}>
                      {gbp(v.settlement_figure)}
                    </td>
                  </tr>
                ))}
                {settled.map((v) => (
                  <tr key={v.registration} style={{ opacity: 0.55 }}>
                    <td></td>
                    <td className="mono">{v.registration}</td>
                    <td colSpan={3}>
                      Settled {formatDate(v.settled_date)}
                    </td>
                    <td className="mono" style={{ textAlign: "right" }}>
                      {v.settled_amount == null ? "" : gbp(v.settled_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {chosen.length > 0 && (
            <>
              <p className="lookup-manual-preview">
                {chosen.length} vehicle{chosen.length === 1 ? "" : "s"} ticked:
                settlement {gbp(figure)}. Monthly drops by {gbp(share)} to{" "}
                {gbp(remainingMonthly)}.
              </p>
              {estimated && (
                <div className="lookup-error">
                  One or more ticked vehicles has an estimated split of the
                  finance, not a funder figure — check before settling.
                </div>
              )}
              <div className="lookup-field">
                <label>Amount actually agreed (leave blank for {gbp(figure)})</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setConfirming(false);
                  }}
                  placeholder={String(figure)}
                />
              </div>
              <div className="lookup-field lookup-field-wide">
                <label>Note (optional)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Vans sold, customer paid by bank transfer"
                />
              </div>
              {!confirming ? (
                <button type="button" onClick={() => setConfirming(true)}>
                  Settle {chosen.length} vehicle{chosen.length === 1 ? "" : "s"}…
                </button>
              ) : (
                <button type="button" disabled={saving} onClick={settle}>
                  {saving
                    ? "Settling…"
                    : `Confirm: record ${gbp(payAmount)} on ${formatDate(settledDate)}`}
                </button>
              )}
            </>
          )}
          {error && <div className="lookup-error">{error}</div>}
        </div>
      )}
    </div>
  );
}
