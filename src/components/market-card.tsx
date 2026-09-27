import Link from "next/link";
import type { MarketStatus, MarketSummary } from "@/types";
import { formatPercent, formatPoints, formatTimeLeft, outcomeColor } from "@/lib/format";
import { CheckIcon, ClockIcon, CoinIcon } from "./icons";
import { CommunityChip, ProbabilityBar, cn } from "./ui";

const STATUS_LABEL: Record<MarketStatus, string> = {
  OPEN: "Live market",
  LOCKED: "Awaiting result",
  RESOLVED: "Resolved",
  CANCELLED: "Nullified",
};

function StatusNote({ market }: { market: MarketSummary }) {
  if (market.status === "CANCELLED") {
    return <span className="text-faint">Nullified · refunded</span>;
  }
  if (market.status === "RESOLVED") {
    const winner = market.options.find((o) => o.isWinner);
    return <span className="text-live">Resolved: {winner?.text}</span>;
  }
  if (market.myStake) {
    const side = market.options.find((o) => o.id === market.myStake!.optionId)?.text;
    return (
      <span className="text-lime">
        Your stake: {market.myStake.amount} on {side}
      </span>
    );
  }
  return null;
}

export function MarketCard({ market }: { market: MarketSummary }) {
  const isBinary = market.marketType === "BINARY";
  const indexed = market.options.map((option, index) => ({ option, color: outcomeColor(market.marketType, index) }));
  const rows = isBinary ? indexed : [...indexed].sort((a, b) => b.option.probability - a.option.probability).slice(0, 3);
  const hidden = market.options.length - rows.length;

  return (
    <Link
      href={`/markets/${market.id}`}
      className="group flex flex-col gap-4 rounded-[22px] border border-line bg-surface p-5 transition-colors hover:border-faint/60"
    >
      <div className="flex items-center justify-between gap-3">
        <CommunityChip name={market.communityName} visibility={market.communityVisibility} />
        <span className="flex flex-none items-center gap-1.5 text-xs text-muted">
          <ClockIcon size={13} />
          {formatTimeLeft(market.deadline, market.status)}
        </span>
      </div>

      <div>
        <h3 className="text-lg leading-snug font-bold tracking-tight">{market.title}</h3>
        <div className="mt-1.5 text-[11px] font-medium tracking-[0.08em] text-faint uppercase">
          {isBinary ? "Yes / No" : "Multiple choice"} · {STATUS_LABEL[market.status]}
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-3">
        {rows.map(({ option, color }) => (
          <div key={option.id} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-1.5 font-medium">
                <span className="truncate">{option.text}</span>
                {option.isWinner && <CheckIcon size={14} className="flex-none text-live" />}
              </span>
              <span className="font-bold tabular-nums" style={{ color }}>{formatPercent(option.probability)}</span>
            </div>
            <ProbabilityBar value={option.probability} color={color} />
          </div>
        ))}
        {hidden > 0 && <div className="text-xs text-faint">+{hidden} more outcome{hidden > 1 ? "s" : ""}</div>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line pt-3.5 text-xs font-medium">
        <span className="flex items-center gap-1.5 text-muted">
          <CoinIcon size={13} className="text-faint" />
          {formatPoints(market.totalPool)} staked
        </span>
        <StatusNote market={market} />
      </div>

      <span className={cn(
        "flex items-center justify-center gap-1.5 rounded-xl bg-raised py-2.5 text-sm font-semibold transition-colors",
        "group-hover:bg-line",
      )}>
        View prediction <span aria-hidden>→</span>
      </span>
    </Link>
  );
}

export function MarketGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-4">{children}</div>;
}
