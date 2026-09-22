"use client";

import { useId, useState } from "react";
import type {
  FiguresDashboard,
  IncomePoint,
  MixSlice,
} from "../../../lib/figures-dashboard";
import {
  SERIES_COLLECTIONS,
  SERIES_NET_CASH,
  SERIES_NEW_LENDING,
} from "../../../lib/figures-dashboard";

export const gbp0 = (n: number) => {
  const v = Math.round(Number(n || 0));
  // The minus belongs outside the symbol: -£62,658, never £-62,658.
  return `${v < 0 ? "-" : ""}£${Math.abs(v).toLocaleString("en-GB")}`;
};

export const gbpCompact = (n: number) => {
  const v = Number(n || 0);
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${v < 0 ? "-" : ""}£${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${v < 0 ? "-" : ""}£${Math.round(abs / 1_000)}K`;
  return `${v < 0 ? "-" : ""}£${Math.round(abs)}`;
};

/** Ticks that step 1/2/5 x 10^n, so the axis lands on readable numbers. */
function niceTicks(min: number, max: number, count = 4) {
  const span = max - min || 1;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) || mag * 10;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= max + step / 2; t += step) ticks.push(t);
  return ticks;
}

/* ------------------------------------------------------------------ */
/* Income and lending                                                  */
/* ------------------------------------------------------------------ */

export function IncomeChart({ points }: { points: IncomePoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();

  const W = 760;
  const H = 260;
  const PAD = { top: 16, right: 12, bottom: 30, left: 56 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const stackTops = points.map((p) => p.collections + p.new_lending);
  const lows = points.map((p) => p.net_cash);
  const rawMax = Math.max(...stackTops, ...lows, 0);
  const rawMin = Math.min(...lows, 0);
  const ticks = niceTicks(rawMin, rawMax);
  const yMin = Math.min(...ticks, rawMin);
  const yMax = Math.max(...ticks, rawMax);

  const y = (v: number) => PAD.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
  const band = plotW / points.length;
  const barW = Math.min(26, band * 0.52);
  const cx = (i: number) => PAD.left + band * i + band / 2;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${cx(i).toFixed(1)},${y(p.net_cash).toFixed(1)}`)
    .join(" ");

  const active = hover != null ? points[hover] : null;

  return (
    <div className="fig-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Monthly collections, new lending and net cash"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          {/* Keeps the rounded bar tops from rounding the baseline too. */}
          <clipPath id={`${clipId}-plot`}>
            <rect x={PAD.left} y={PAD.top - 4} width={plotW} height={plotH + 4} />
          </clipPath>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line
              className="fig-grid"
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
            />
            <text className="fig-axis" x={PAD.left - 10} y={y(t) + 4} textAnchor="end">
              {gbpCompact(t)}
            </text>
          </g>
        ))}
        <line
          className="fig-zero"
          x1={PAD.left}
          x2={W - PAD.right}
          y1={y(0)}
          y2={y(0)}
        />

        <g clipPath={`url(#${clipId}-plot)`}>
          {points.map((p, i) => {
            const base = y(0);
            const collH = Math.abs(base - y(p.collections));
            const lendH = Math.abs(y(p.collections) - y(p.collections + p.new_lending));
            const on = hover === i;
            return (
              <g key={p.key} opacity={hover == null || on ? 1 : 0.45}>
                {/* New lending sits on top; 2px gap keeps the segments apart. */}
                {p.new_lending > 0 && (
                  <rect
                    x={cx(i) - barW / 2}
                    y={y(p.collections + p.new_lending)}
                    width={barW}
                    height={Math.max(0, lendH - 2)}
                    rx={4}
                    fill={SERIES_NEW_LENDING}
                  />
                )}
                {p.collections > 0 && (
                  <rect
                    x={cx(i) - barW / 2}
                    y={y(p.collections)}
                    width={barW}
                    height={collH + 4}
                    rx={4}
                    fill={SERIES_COLLECTIONS}
                  />
                )}
              </g>
            );
          })}
        </g>

        <path className="fig-line" d={linePath} stroke={SERIES_NET_CASH} />
        {points.map((p, i) => (
          <circle
            key={p.key}
            cx={cx(i)}
            cy={y(p.net_cash)}
            r={hover === i ? 5.5 : 4}
            fill={SERIES_NET_CASH}
            stroke="#fff"
            strokeWidth={2}
          />
        ))}

        {points.map((p, i) => (
          <text
            key={p.key}
            className={`fig-axis ${hover === i ? "on" : ""}`}
            x={cx(i)}
            y={H - 10}
            textAnchor="middle"
          >
            {p.label}
          </text>
        ))}

        {/* Hit targets are the full band, not the bar. */}
        {points.map((p, i) => (
          <rect
            key={p.key}
            x={PAD.left + band * i}
            y={PAD.top}
            width={band}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>

      <div className="fig-legend">
        <span><i style={{ background: SERIES_COLLECTIONS }} />Collections</span>
        <span><i style={{ background: SERIES_NEW_LENDING }} />New lending</span>
        <span><i className="dot" style={{ background: SERIES_NET_CASH }} />Net cash</span>
      </div>

      {active && (
        <div
          className={`fig-tip ${hover! > points.length / 2 ? "left" : "right"}`}
          role="status"
        >
          <b>{active.label}</b>
          <span><i style={{ background: SERIES_COLLECTIONS }} />Collections <em>{gbp0(active.collections)}</em></span>
          <span><i style={{ background: SERIES_NEW_LENDING }} />New lending <em>{gbp0(active.new_lending)}</em></span>
          <span><i className="dot" style={{ background: SERIES_NET_CASH }} />Net cash <em>{gbp0(active.net_cash)}</em></span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Forecast                                                            */
/* ------------------------------------------------------------------ */

export function ForecastChart({
  forecast,
}: {
  forecast: FiguresDashboard["forecast"];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const gradId = useId();
  const points = forecast.points;
  if (points.length < 2) return null;

  const W = 700;
  const H = 230;
  const PAD = { top: 16, right: 14, bottom: 28, left: 56 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const values = points.map((p) => p.value);
  const ticks = niceTicks(0, Math.max(...values));
  const yMax = Math.max(...ticks);
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * plotW;
  const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;

  // One label every six months keeps the axis readable over four years.
  const labelEvery = 6;
  const active = hover != null ? points[hover] : null;

  return (
    <div className="fig-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Projected book value"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES_COLLECTIONS} stopOpacity="0.26" />
            <stop offset="100%" stopColor={SERIES_COLLECTIONS} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line className="fig-grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="fig-axis" x={PAD.left - 10} y={y(t) + 4} textAnchor="end">
              {gbpCompact(t)}
            </text>
          </g>
        ))}

        <path d={area} fill={`url(#${gradId})`} />
        <path className="fig-line" d={line} stroke={SERIES_COLLECTIONS} />

        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text key={p.month} className="fig-axis" x={x(i)} y={H - 9} textAnchor="middle">
              {p.label}
            </text>
          ) : null
        )}

        {active && (
          <>
            <line
              className="fig-crosshair"
              x1={x(hover!)}
              x2={x(hover!)}
              y1={PAD.top}
              y2={PAD.top + plotH}
            />
            <circle
              cx={x(hover!)}
              cy={y(active.value)}
              r={5.5}
              fill={SERIES_COLLECTIONS}
              stroke="#fff"
              strokeWidth={2}
            />
          </>
        )}

        <rect
          x={PAD.left}
          y={PAD.top}
          width={plotW}
          height={plotH}
          fill="transparent"
          onMouseMove={(e) => {
            const box = (e.target as SVGRectElement).getBoundingClientRect();
            const ratio = (e.clientX - box.left) / box.width;
            setHover(
              Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))))
            );
          }}
        />
      </svg>

      {active && (
        <div
          className={`fig-tip ${hover! > points.length / 2 ? "left" : "right"}`}
          role="status"
        >
          <b>{active.label}</b>
          <span>Projected book <em>{gbp0(active.value)}</em></span>
        </div>
      )}

      <p className="fig-assumption">
        Run-off plus reinvestment: assumes the {gbp0(forecast.monthly_collections)} a
        month currently collected is lent again at the book&apos;s blended yield of{" "}
        {forecast.assumed_yield}%. A projection, not contracted business.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Portfolio mix                                                       */
/* ------------------------------------------------------------------ */

export function MixDonut({ slices, total }: { slices: MixSlice[]; total: number }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!slices.length || total <= 0) return null;

  const size = 190;
  const r = 72;
  const stroke = 26;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  // A 2px gap of surface between neighbouring arcs.
  const gap = 2;

  let offset = 0;
  const arcs = slices.map((s) => {
    const len = (s.value / total) * circumference;
    const arc = { ...s, len: Math.max(0, len - gap), offset };
    offset += len;
    return arc;
  });

  return (
    <div className="fig-donut-wrap">
      <div className="fig-donut">
        <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Total lent by agreement type">
          <g transform={`rotate(-90 ${c} ${c})`}>
            {arcs.map((a, i) => (
              <circle
                key={a.key}
                cx={c}
                cy={c}
                r={r}
                fill="none"
                stroke={a.colour}
                strokeWidth={hover === i ? stroke + 4 : stroke}
                strokeDasharray={`${a.len} ${circumference - a.len}`}
                strokeDashoffset={-a.offset}
                strokeLinecap="butt"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            ))}
          </g>
          <text className="fig-donut-value" x={c} y={c - 2} textAnchor="middle">
            {gbpCompact(total)}
          </text>
          <text className="fig-donut-label" x={c} y={c + 16} textAnchor="middle">
            Total lent
          </text>
        </svg>
      </div>
      <ul className="fig-donut-key">
        {slices.map((s, i) => (
          <li
            key={s.key}
            className={hover === i ? "on" : ""}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <i style={{ background: s.colour }} />
            <span className="k">{s.label}</span>
            <span className="v">{gbp0(s.value)}</span>
            <span className="p">{s.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
