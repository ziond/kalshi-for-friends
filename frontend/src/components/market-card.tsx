import Link from "next/link";
import type { MarketSummary } from "@/types";
import { formatPercent, formatPoints, formatTimeLeft } from "@/lib/format";
import { cn } from "./ui";

function StatusNote({ market }: { market: MarketSummary }) {
  if (market.status === "CANCELLED") {
    return <span className="text-faint">Nullified · refunded</span>;
  }
  if (market.status === "RESOLVED") {
    const winner = market.options.find((o) => o.isWinner);
    return <span className="text-yes">Resolved: {winner?.text}</span>;
  }
  if (market.myStake) {
    const side = market.options.find((o) => o.id === market.myStake!.optionId)?.text;
    return (
      <span className="text-brand">
        You: {market.myStake.amount} on {side}
      </span>
    );
  }
  return null;
}

export function MarketCard({ market }: { market: MarketSummary }) {
  const isBinary = market.marketType === "BINARY";
  const yes = market.options[0];
  const topOutcomes = [...market.options].sort((a, b) => b.probability - a.probability).slice(0, 3);
  const isPrivate = market.communityVisibility === "PRIVATE";

  return (
    <Link
      href={`/markets/${market.id}`}
      className="flex min-h-[200px] flex-col gap-3.5 rounded-2xl border border-line bg-white p-4 transition-shadow hover:shadow-[0_6px_20px_rgba(28,27,25,0.08)]"
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "truncate rounded-[14px] px-2.5 py-1 text-[11px] font-bold",
            isPrivate ? "bg-private/12 text-private" : "bg-yes/12 text-yes",
          )}
        >
          {market.communityName}
        </span>
        <span className="flex-none text-[11px] font-bold text-faint">
          {formatTimeLeft(market.deadline, market.status)}
        </span>
      </div>

      <h3 className="text-[15px] font-extrabold leading-snug">{market.title}</h3>

      {isBinary ? (
        <div className="mt-auto flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[26px] font-extrabold leading-none">{formatPercent(yes.probability)}</span>
            <span className="text-xs font-bold text-muted">chance of Yes</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-no/20">
            <div className="h-full rounded-full bg-yes" style={{ width: formatPercent(yes.probability) }} />
          </div>
        </div>
      ) : (
        <div className="mt-auto flex flex-col gap-1.5">
          {topOutcomes.map((o) => (
            <div key={o.id} className="flex items-center gap-2 text-xs font-bold">
              <span className="w-20 truncate">{o.text}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/7">
                <div className="h-full rounded-full bg-brand" style={{ width: formatPercent(o.probability) }} />
              </div>
              <span className="w-9 text-right font-extrabold">{formatPercent(o.probability)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-ink/6 pt-2.5 text-[11px] font-bold text-faint">
        <span>{formatPoints(market.totalPool)} volume</span>
        <StatusNote market={market} />
      </div>
    </Link>
  );
}

export function MarketGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">{children}</div>;
}
