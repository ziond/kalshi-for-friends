import type { MarketOption, PricePoint } from "@/types";
import { CHART_COLORS, formatPercent } from "@/lib/format";

const WIDTH = 520;
const HEIGHT = 130;
const Y_TICKS = [100, 75, 50, 25, 0];

function linePath(values: number[]) {
  const points = values.length > 1 ? values : [values[0] ?? 0.5, values[0] ?? 0.5];
  const step = WIDTH / (points.length - 1);
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(HEIGHT - p * HEIGHT).toFixed(1)}`)
    .join(" ");
}

function ageLabel(at: string) {
  const days = (Date.now() - Date.parse(at)) / 86_400_000;
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h ago`;
  return `${Number(days.toFixed(1))}d ago`.replace(".0d", "d");
}

/** "Probability over time" chart from the market detail screen. */
export function ProbabilityChart({ options, history }: { options: MarketOption[]; history: PricePoint[] }) {
  const lines = options.map((o, i) => ({
    option: o,
    color: CHART_COLORS[i % CHART_COLORS.length],
    d: linePath(history.map((point) => point.probabilities[o.id] ?? o.probability)),
  }));
  const first = history[0];
  const middle = history[Math.floor((history.length - 1) / 2)];

  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] bg-canvas px-4 pt-3.5 pb-2.5">
      <div className="text-xs font-extrabold text-muted">Probability over time</div>
      <svg viewBox="0 0 566 168" className="block h-[168px] w-full" role="img"
        aria-label="Probability of each outcome over time">
        <g transform="translate(38,8)">
          {Y_TICKS.map((v) => {
            const y = (HEIGHT * (100 - v)) / 100;
            return (
              <g key={v}>
                <line x1={0} y1={y} x2={WIDTH} y2={y} stroke="rgba(28,27,25,0.08)" />
                <text x={-8} y={y} dy={3.5} textAnchor="end" fontSize={10} fontWeight={700} fill="#A39C90">
                  {v}%
                </text>
              </g>
            );
          })}
          {lines.map((line) => (
            <path key={line.option.id} d={line.d} fill="none" stroke={line.color} strokeWidth={2.5}
              strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {first && (
            <>
              <text x={0} y={148} fontSize={10} fontWeight={700} fill="#A39C90">{ageLabel(first.at)}</text>
              {history.length > 2 && (
                <text x={WIDTH / 2} y={148} textAnchor="middle" fontSize={10} fontWeight={700} fill="#A39C90">
                  {ageLabel(middle.at)}
                </text>
              )}
              <text x={WIDTH} y={148} textAnchor="end" fontSize={10} fontWeight={700} fill="#A39C90">Now</text>
            </>
          )}
        </g>
      </svg>
      <div className="flex flex-wrap gap-3.5 pt-0.5">
        {lines.map((line) => (
          <div key={line.option.id} className="flex items-center gap-1.5 text-xs font-bold text-muted">
            <span className="inline-block size-[9px] rounded-full" style={{ background: line.color }} />
            {line.option.text} · {formatPercent(line.option.probability)}
          </div>
        ))}
      </div>
    </div>
  );
}
