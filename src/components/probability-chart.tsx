"use client";

import { useState } from "react";
import type { MarketOption, MarketType, PricePoint } from "@/types";
import { formatPercent, outcomeColor } from "@/lib/format";
import { cn } from "./ui";

const WIDTH = 520;
const HEIGHT = 130;
const Y_TICKS = [100, 75, 50, 25, 0];
const GRID = "#3A443C";
const LABEL = "#7F8A81";

type Range = "1H" | "24H" | "ALL";
const RANGE_MS: Record<Exclude<Range, "ALL">, number> = { "1H": 3_600_000, "24H": 86_400_000 };
const RANGE_LABEL: Record<Exclude<Range, "ALL">, string> = { "1H": "1h ago", "24H": "24h ago" };

/** Points inside the range, plus the one just before it so the line starts at the left edge. */
function sliceHistory(history: PricePoint[], range: Range): PricePoint[] {
  if (range === "ALL") return history;
  const since = Date.now() - RANGE_MS[range];
  const first = history.findIndex((p) => Date.parse(p.at) >= since);
  if (first === -1) return history.slice(-1); // nothing moved in range: flat at the latest value
  return history.slice(Math.max(0, first - 1));
}

function toXY(values: number[]) {
  const points = values.length > 1 ? values : [values[0] ?? 0.5, values[0] ?? 0.5];
  const step = WIDTH / (points.length - 1);
  return points.map((p, i) => [i * step, HEIGHT - p * HEIGHT] as const);
}

function linePath(xy: (readonly [number, number])[]) {
  return xy.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

function ageLabel(at: string) {
  const days = (Date.now() - Date.parse(at)) / 86_400_000;
  if (days < 1 / 24) return `${Math.max(1, Math.round(days * 1440))}m ago`;
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h ago`;
  return `${Number(days.toFixed(1))}d ago`.replace(".0d", "d");
}

/** "Probability history" card from the market detail screen. */
export function ProbabilityChart({
  options,
  history,
  marketType,
}: {
  options: MarketOption[];
  history: PricePoint[];
  marketType: MarketType;
}) {
  const [range, setRange] = useState<Range>("ALL");
  const points = sliceHistory(history, range);
  const leader = options.reduce((best, o) => (o.probability > best.probability ? o : best), options[0]);

  const lines = options.map((o, i) => {
    const xy = toXY(points.map((point) => point.probabilities[o.id] ?? o.probability));
    return { option: o, color: outcomeColor(marketType, i), xy, d: linePath(xy) };
  });
  // Draw the leading outcome last so it sits on top.
  const ordered = [...lines].sort((a, b) => (a.option.id === leader?.id ? 1 : 0) - (b.option.id === leader?.id ? 1 : 0));
  // Ranged views start at the range edge; ALL starts at the first recorded point.
  const leftLabel = range === "ALL" ? (points.length > 1 ? ageLabel(points[0].at) : null) : RANGE_LABEL[range];
  const middle = points[Math.floor((points.length - 1) / 2)];

  return (
    <section className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold tracking-tight">Probability history</h2>
        <div role="group" aria-label="Chart range" className="flex rounded-full bg-raised p-0.5 text-[11px] font-semibold">
          {(["1H", "24H", "ALL"] as const).map((r) => (
            <button key={r} type="button" onClick={() => setRange(r)} aria-pressed={range === r}
              className={cn("cursor-pointer rounded-full px-2.5 py-1 transition-colors",
                range === r ? "bg-line text-ink" : "text-muted hover:text-ink")}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <svg viewBox="0 0 566 168" className="block h-[168px] w-full" role="img"
        aria-label="Probability of each outcome over time">
        <g transform="translate(38,8)">
          {Y_TICKS.map((v) => {
            const y = (HEIGHT * (100 - v)) / 100;
            return (
              <g key={v}>
                <line x1={0} y1={y} x2={WIDTH} y2={y} stroke={GRID} strokeDasharray={v === 0 ? undefined : "3 5"} />
                <text x={-8} y={y} dy={3.5} textAnchor="end" fontSize={10} fontWeight={500} fill={LABEL}>
                  {v}%
                </text>
              </g>
            );
          })}
          {ordered.map((line) => {
            const [endX, endY] = line.xy[line.xy.length - 1];
            return (
              <g key={line.option.id}>
                <path d={line.d} fill="none" stroke={line.color} strokeWidth={2.5}
                  strokeLinecap="round" strokeLinejoin="round" />
                {line.option.id === leader?.id && <circle cx={endX} cy={endY} r={4.5} fill={line.color} />}
              </g>
            );
          })}
          {leftLabel && <text x={0} y={150} fontSize={10} fontWeight={500} fill={LABEL}>{leftLabel}</text>}
          {range === "ALL" && points.length > 2 && (
            <text x={WIDTH / 2} y={150} textAnchor="middle" fontSize={10} fontWeight={500} fill={LABEL}>
              {ageLabel(middle.at)}
            </text>
          )}
          <text x={WIDTH} y={150} textAnchor="end" fontSize={10} fontWeight={500} fill={LABEL}>Now</text>
        </g>
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {lines.map((line) => (
          <div key={line.option.id} className="flex items-center gap-1.5 text-[13px] text-muted">
            <span className="inline-block size-2.5 rounded-full" style={{ background: line.color }} />
            {line.option.text} · {formatPercent(line.option.probability)}
          </div>
        ))}
      </div>
    </section>
  );
}
