"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { ProbabilityChart } from "@/components/probability-chart";
import { BackLink, Button, Card, ErrorNote, Skeleton, cn } from "@/components/ui";
import { useCancelMarket, useMarket, useMarketActivity, usePlacePosition, useResolveMarket } from "@/hooks/use-markets";
import { formatPercent, formatPoints, formatRelative, formatTimeLeft } from "@/lib/format";
import type { ID, MarketDetail } from "@/types";

function ModeratorPanel({ market }: { market: MarketDetail }) {
  const resolve = useResolveMarket(market.id);
  const cancel = useCancelMarket(market.id);
  const busy = resolve.isPending || cancel.isPending;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-brand bg-brand-soft px-5 py-[18px]">
      <div className="text-sm font-extrabold text-brand-dark">This market has ended — you&apos;re the moderator</div>
      <p className="text-[13px] font-semibold text-muted">
        Validate the correct outcome, or nullify the market if it can&apos;t be resolved fairly. Bets settle
        immediately once you act.
      </p>
      <div className="flex flex-wrap gap-2.5">
        {market.options.map((o) => (
          <Button key={o.id} variant="dark" disabled={busy}
            onClick={() => confirm(`Resolve as "${o.text}"? This pays out immediately.`) && resolve.mutate({ winningOptionId: o.id })}>
            Validate: {o.text}
          </Button>
        ))}
        <Button variant="danger" disabled={busy}
          onClick={() => confirm("Nullify this market and refund every bet?") && cancel.mutate({})}>
          Nullify market
        </Button>
      </div>
      <ErrorNote error={resolve.error ?? cancel.error} />
    </div>
  );
}

function ResolvedBanner({ market }: { market: MarketDetail }) {
  const text =
    market.status === "CANCELLED"
      ? "This market was nullified — all bets refunded."
      : `Resolved: ${market.options.find((o) => o.id === market.settlement?.winningOptionId)?.text} — payouts settled.`;
  return (
    <div className="rounded-2xl border-[1.5px] border-yes bg-yes/10 px-5 py-4 text-sm font-extrabold text-yes-dark">
      {text}
    </div>
  );
}

function OutcomePicker({ market, selected, onSelect }: { market: MarketDetail; selected: ID | null; onSelect: (id: ID) => void }) {
  const disabled = !market.permissions.canBet;

  if (market.marketType === "BINARY") {
    const [yes, no] = market.options;
    const side = (option: typeof yes, isYes: boolean) => (
      <button
        key={option.id}
        disabled={disabled}
        onClick={() => onSelect(option.id)}
        aria-pressed={selected === option.id}
        className={cn(
          "flex flex-1 cursor-pointer flex-col gap-1 rounded-[14px] border-[1.5px] p-4 text-left transition-colors disabled:cursor-not-allowed",
          isYes ? "border-yes bg-yes/8 hover:bg-yes/15" : "border-no bg-no/6 hover:bg-no/12",
          selected === option.id && (isYes ? "bg-yes/20 ring-2 ring-yes" : "bg-no/15 ring-2 ring-no"),
        )}
      >
        <span className={cn("text-xs font-extrabold", isYes ? "text-yes" : "text-no")}>{option.text.toUpperCase()}</span>
        <span className="text-[26px] font-extrabold">{formatPercent(option.probability)}</span>
        <span className={cn("text-xs font-bold", isYes ? "text-yes-dark" : "text-brand-dark")}>Buy {option.text}</span>
      </button>
    );
    return <div className="flex gap-3">{side(yes, true)}{side(no, false)}</div>;
  }

  const rows = [...market.options].sort((a, b) => b.probability - a.probability);
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((o) => (
        <button
          key={o.id}
          disabled={disabled}
          onClick={() => onSelect(o.id)}
          aria-pressed={selected === o.id}
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-left hover:bg-ink/3 disabled:cursor-not-allowed",
            selected === o.id ? "border-brand bg-brand-soft" : "border-line",
          )}
        >
          <span className="flex-1 text-[13px] font-bold">{o.text}</span>
          <span className="h-2 flex-[2] overflow-hidden rounded-[5px] bg-ink/7">
            <span className="block h-full rounded-[5px] bg-brand" style={{ width: formatPercent(o.probability) }} />
          </span>
          <span className="w-10 text-right text-[13px] font-extrabold">{formatPercent(o.probability)}</span>
          <span className={cn("rounded-2xl px-3 py-1.5 text-xs font-bold text-white", selected === o.id ? "bg-brand" : "bg-ink")}>
            {selected === o.id ? "Selected" : "Bet"}
          </span>
        </button>
      ))}
    </div>
  );
}

function BetForm({ market }: { market: MarketDetail }) {
  const place = usePlacePosition(market.id);
  // Default to the side the user already backed; they can only add to it.
  const [selected, setSelected] = useState<ID | null>(market.myStake?.optionId ?? null);
  const [amount, setAmount] = useState("");
  const selectedOption = market.options.find((o) => o.id === selected);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    place.mutate({ optionId: selected, amount: Number(amount) }, { onSuccess: () => setAmount("") });
  };

  return (
    <>
      <OutcomePicker market={market} selected={selected} onSelect={setSelected} />
      {market.permissions.canBet && (
        <form onSubmit={submit} className="flex flex-col gap-2 rounded-xl bg-canvas px-3.5 py-3">
          <div className="flex items-center gap-2.5">
            <input
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={selectedOption ? `Points on ${selectedOption.text}` : "Pick an outcome, then wager"}
              aria-label="Points to wager"
              className="min-w-0 flex-1 rounded-[10px] border border-ink/15 bg-white px-3 py-2 text-[13px] font-bold outline-none focus:border-brand"
            />
            <Button type="submit" className="rounded-[10px] px-[18px] font-extrabold whitespace-nowrap"
              disabled={!selected || !amount || place.isPending}>
              {place.isPending ? "Placing…" : "Place bet"}
            </Button>
          </div>
          <ErrorNote error={place.error} />
          {place.isSuccess && (
            <p className="text-xs font-bold text-yes-dark">
              Bet placed — {place.data.position.amount} pts on {place.data.position.optionText}.
            </p>
          )}
        </form>
      )}
    </>
  );
}

function RecentActivity({ marketId }: { marketId: ID }) {
  const { data } = useMarketActivity(marketId);
  if (!data?.items.length) return null;
  return (
    <div>
      <div className="mb-2 text-[13px] font-extrabold text-muted">Recent activity</div>
      <div className="flex flex-col gap-2">
        {data.items.slice(0, 8).map((a) => (
          <div key={a.id} className="flex justify-between border-b border-ink/6 pb-1.5 text-xs font-semibold text-muted">
            <span>{a.user.username} bet {a.amount} pts on {a.optionText}</span>
            <span className="text-faint">{formatRelative(a.createdAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-faint">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

export default function MarketPage() {
  const marketId = Number(useParams<{ marketId: string }>().marketId);
  const { data: market, error, isLoading } = useMarket(marketId);

  if (isLoading) {
    return <div className="mx-auto max-w-[1000px] px-4 pt-7 sm:px-8"><Skeleton className="h-96" /></div>;
  }
  if (!market) {
    return <div className="mx-auto max-w-[1000px] px-4 pt-7 sm:px-8"><ErrorNote error={error} /></div>;
  }

  const isPrivate = market.communityVisibility === "PRIVATE";
  const myOption = market.options.find((o) => o.id === market.myStake?.optionId);

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-5 px-4 pt-7 pb-16 sm:px-8">
      <BackLink href={`/communities/${market.communityId}`}>Back to {market.communityName}</BackLink>

      {market.permissions.canResolve && <ModeratorPanel market={market} />}
      {(market.status === "RESOLVED" || market.status === "CANCELLED") && <ResolvedBanner market={market} />}

      <Card className="grid gap-7 p-6 md:grid-cols-[1.6fr_1fr]">
        <div className="flex min-w-0 flex-col gap-[18px]">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className={cn("rounded-[14px] px-2.5 py-1 text-[11px] font-bold",
                isPrivate ? "bg-private/12 text-private" : "bg-yes/12 text-yes")}>
                {market.communityName}
              </span>
              <span className="text-xs font-bold text-faint">{formatTimeLeft(market.deadline, market.status)}</span>
            </div>
            <h1 className="text-[22px] leading-tight font-extrabold">{market.title}</h1>
            {market.description && (
              <p className="mt-2 text-[13px] leading-normal font-semibold text-muted">{market.description}</p>
            )}
          </div>

          <ProbabilityChart options={market.options} history={market.history} />
          <BetForm key={market.id} market={market} />
          <RecentActivity marketId={market.id} />
        </div>

        <aside className="flex flex-col gap-3.5 border-line md:border-l md:pl-6">
          <div className="text-[13px] font-extrabold text-muted">Market info</div>
          <div className="flex flex-col gap-2.5 text-[13px] font-semibold">
            <InfoRow label="Volume" value={formatPoints(market.totalPool)} />
            <InfoRow label="Closes" value={new Date(market.deadline).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} />
            <InfoRow label="Moderator" value={market.moderator.username} />
            <InfoRow label="Created by" value={market.creator.username} />
            {market.myStake && myOption && (
              <>
                <InfoRow label="Your stake" value={`${market.myStake.amount} pts on ${myOption.text}`} />
                <InfoRow label="If it wins" value={`${market.myStake.potentialPayout.toLocaleString()} pts`} />
              </>
            )}
          </div>
          <p className="rounded-[10px] bg-canvas p-3 text-xs leading-normal font-semibold text-faint">
            Resolution rule: the assigned moderator validates the real-world outcome once the market closes. Bets
            pay out automatically based on their call, or are refunded if nullified.
          </p>
        </aside>
      </Card>
    </div>
  );
}
