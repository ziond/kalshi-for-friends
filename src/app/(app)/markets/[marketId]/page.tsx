"use client";

import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRightIcon, CheckIcon, ClockIcon, CoinIcon, UsersIcon } from "@/components/icons";
import { ProbabilityChart } from "@/components/probability-chart";
import { WinningCard } from "@/components/winning-card";
import { Avatar, BackLink, Button, Card, CommunityChip, ErrorNote, ProbabilityBar, Skeleton, StatusPill, cn } from "@/components/ui";
import { isLive, useCancelMarket, useMarket, useMarketActivity, usePlacePosition, useResolveMarket, useSettlementSync } from "@/hooks/use-markets";
import { useMe } from "@/hooks/use-me";
import { useNow } from "@/hooks/use-now";
import { formatCountdown, formatPercent, formatPoints, formatRelative, formatTimeLeft, outcomeColor } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { PAYOUT_GRACE_MINUTES, type ID, type MarketDetail } from "@/types";

const QUICK_ADDS = [25, 50, 100];

/** "m:ss" until the payout; asks for fresh data once it's due so the payout shows up straight away. */
function usePayoutCountdown(market: MarketDetail) {
  const qc = useQueryClient();
  const payoutAt = market.status === "PAYOUT_PENDING" ? market.settlement?.payoutAt : undefined;
  const now = useNow(Boolean(payoutAt));
  const due = payoutAt ? Date.parse(payoutAt) <= now : false;

  useEffect(() => {
    if (due) qc.invalidateQueries({ queryKey: queryKeys.markets.detail(market.id) });
  }, [due, market.id, qc]);

  return { countdown: payoutAt ? formatCountdown(payoutAt, now) : "", due };
}

function winnerText(market: MarketDetail) {
  return market.options.find((o) => o.id === market.settlement?.winningOptionId)?.text;
}

function ModeratorPanel({ market }: { market: MarketDetail }) {
  const resolve = useResolveMarket(market.id);
  const cancel = useCancelMarket(market.id);
  const { countdown, due } = usePayoutCountdown(market);
  const busy = resolve.isPending || cancel.isPending;
  const nullify = () =>
    confirm("Nullify this market and refund every bet? This can't be undone.") && cancel.mutate({});

  if (market.status === "PAYOUT_PENDING") {
    return (
      <div className="flex flex-col gap-3 rounded-[20px] border-2 border-orange/70 bg-orange/[0.07] p-5">
        <div className="text-base font-bold text-orange">
          You picked {winnerText(market)} — {due ? "paying out now…" : `payouts go out in ${countdown}`}
        </div>
        <p className="text-sm text-muted">
          The pick can&apos;t be changed. If it&apos;s wrong, nullify the market before the payout and everyone gets
          their points back. After the payout the result is final.
        </p>
        <div>
          <Button variant="danger" disabled={busy || due} onClick={nullify}>Nullify market</Button>
        </div>
        <ErrorNote error={cancel.error} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-[20px] border-2 border-lime/80 bg-lime/[0.06] p-5">
      <div className="text-base font-bold text-lime">This market has ended — you&apos;re the moderator</div>
      <p className="text-sm text-muted">
        Validate the correct outcome, or nullify the market if it can&apos;t be resolved fairly. Your pick is final:
        it can&apos;t be switched to another outcome. Payouts go out {PAYOUT_GRACE_MINUTES} minutes after you validate,
        and until then the only change you can make is to nullify. Nullifying refunds every bet straight away and
        can&apos;t be undone.
      </p>
      <div className="flex flex-wrap gap-2.5">
        {market.options.map((o) => (
          <Button key={o.id} disabled={busy}
            onClick={() =>
              confirm(`Pick "${o.text}" as the winner? You can't switch to another outcome afterwards. Payouts go out in ${PAYOUT_GRACE_MINUTES} minutes; until then you can only nullify the market.`) &&
              resolve.mutate({ winningOptionId: o.id })}>
            Validate: {o.text}
          </Button>
        ))}
        <Button variant="danger" disabled={busy} onClick={nullify}>Nullify market</Button>
      </div>
      <ErrorNote error={resolve.error ?? cancel.error} />
    </div>
  );
}

/** What everyone else sees during the grace period. */
function PayoutPendingBanner({ market }: { market: MarketDetail }) {
  const { countdown, due } = usePayoutCountdown(market);
  return (
    <div className="rounded-2xl border border-orange/40 bg-orange/10 px-5 py-4 text-sm">
      <span className="font-semibold text-orange">{winnerText(market)} picked as the winner. </span>
      <span className="text-muted">
        {due ? "Paying out now…" : `Payouts go out in ${countdown} — the moderator can still nullify until then.`}
      </span>
    </div>
  );
}

function ResolvedBanner({ market }: { market: MarketDetail }) {
  const cancelled = market.status === "CANCELLED";
  const text = cancelled
    ? "This market was nullified — all bets refunded."
    : `Resolved: ${market.options.find((o) => o.id === market.settlement?.winningOptionId)?.text} — payouts settled.`;
  return (
    <div className={cn("rounded-2xl border px-5 py-4 text-sm font-semibold",
      cancelled ? "border-line bg-raised text-muted" : "border-live/40 bg-live/10 text-live")}>
      {text}
    </div>
  );
}

/** Personal result once a market you bet on is resolved. */
function MyResult({ market }: { market: MarketDetail }) {
  if (market.status !== "RESOLVED" || !market.myStake) return null;
  const option = market.options.find((o) => o.id === market.myStake!.optionId)!;
  if (market.settlement?.winningOptionId === option.id) {
    return (
      <WinningCard question={market.title} prediction={option.text}
        points={market.myStake.potentialPayout - market.myStake.amount} />
    );
  }
  return (
    <Card className="flex flex-col gap-1 p-5">
      <div className="text-xs font-semibold tracking-[0.08em] text-faint uppercase">Prediction resolved</div>
      <div className="text-xl font-bold">Not this time.</div>
      <p className="text-sm text-muted">
        You backed {option.text} with {market.myStake.amount} pts. The receipts will come.
      </p>
    </Card>
  );
}

function OutcomePicker({ market, selected, onSelect }: { market: MarketDetail; selected: ID | null; onSelect: (id: ID) => void }) {
  const disabled = !market.permissions.canBet;
  const isBinary = market.marketType === "BINARY";
  const rows = market.options.map((option, index) => ({ option, color: outcomeColor(market.marketType, index) }));
  if (!isBinary) rows.sort((a, b) => b.option.probability - a.option.probability);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold tracking-tight">{disabled ? "Outcomes" : "Choose your prediction"}</h2>
      {rows.map(({ option, color }) => {
        const isSelected = selected === option.id;
        const isMine = market.myStake?.optionId === option.id;
        const isPicked = market.status === "PAYOUT_PENDING" && market.settlement?.winningOptionId === option.id;
        return (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(option.id)}
            aria-pressed={isSelected}
            className={cn(
              "flex flex-col gap-3 rounded-[18px] border bg-surface p-4 text-left transition-colors sm:px-5",
              disabled ? "cursor-default" : "cursor-pointer hover:bg-raised",
              isSelected ? "border-lime bg-raised ring-1 ring-lime" : "border-line",
            )}
          >
            <span className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-3">
                <span className="size-3 flex-none rounded-full" style={{ background: color }} />
                <span className="truncate text-lg font-semibold">{isBinary ? option.text.toUpperCase() : option.text}</span>
                {option.isWinner && <CheckIcon size={18} className="flex-none text-live" />}
              </span>
              <span className="text-2xl font-bold tabular-nums" style={{ color }}>{formatPercent(option.probability)}</span>
            </span>
            <ProbabilityBar value={option.probability} color={color} />
            {isPicked && (
              <span className="text-xs font-bold tracking-[0.06em] text-orange uppercase">
                Picked as winner · payout pending{isMine ? " · your pick" : ""}
              </span>
            )}
            {isSelected && !disabled ? (
              <span className="flex items-center gap-1.5 text-xs font-bold tracking-[0.06em] text-lime uppercase">
                <CheckIcon size={14} strokeWidth={3} /> Your selected outcome
              </span>
            ) : isMine ? (
              <span className="text-xs font-semibold tracking-[0.06em] text-muted uppercase">
                Your stake · {market.myStake!.amount} pts
              </span>
            ) : null}
          </button>
        );
      })}
    </section>
  );
}

function StakePanel({ market, selected }: { market: MarketDetail; selected: ID | null }) {
  const place = usePlacePosition(market.id);
  const { data: me } = useMe();
  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const balance = me?.balance ?? 0;
  const selectedOption = market.options.find((o) => o.id === selected);

  const value = Number(amount);
  const hasAmount = amount !== "" && Number.isInteger(value) && value >= 1;
  const overBalance = hasAmount && me !== undefined && value > balance;
  const canSubmit = Boolean(selectedOption) && hasAmount && !overBalance && !place.isPending;

  // Parimutuel estimate at current odds, matching how the backend pays winners.
  const estimate = selectedOption && hasAmount
    ? Math.floor(
        ((market.myStake?.optionId === selectedOption.id ? market.myStake.amount : 0) + value) *
          (market.totalPool + value) / (selectedOption.totalAmount + value),
      )
    : 0;

  const setStake = (next: number) => {
    setConfirming(false);
    place.reset();
    setAmount(String(Math.max(0, Math.min(next, balance || next))));
  };

  const submit = () => {
    if (!selectedOption || !canSubmit) return;
    place.mutate({ optionId: selectedOption.id, amount: value }, {
      onSuccess: () => setAmount(""),
      onSettled: () => setConfirming(false),
    });
  };

  const label = !selectedOption
    ? "Pick an outcome first"
    : hasAmount
      ? `Stake ${value.toLocaleString()} point${value === 1 ? "" : "s"}`
      : "Enter your stake";

  return (
    <Card className="flex flex-col gap-4 p-5">
      <h2 className="text-lg font-bold tracking-tight">Stake your points</h2>
      <label className="flex items-center gap-3 rounded-2xl border border-transparent bg-raised px-5 py-4 focus-within:border-lime/70">
        <input
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setConfirming(false);
            place.reset();
          }}
          placeholder="0"
          aria-label="Points to wager"
          className="w-full min-w-0 bg-transparent text-3xl font-semibold tabular-nums outline-none placeholder:text-faint"
        />
        <span className="text-lg font-bold text-lime">PTS</span>
      </label>
      <div className="grid grid-cols-4 gap-2">
        {QUICK_ADDS.map((n) => (
          <button key={n} type="button" onClick={() => setStake((hasAmount ? value : 0) + n)}
            className="cursor-pointer rounded-xl bg-raised py-2.5 text-sm font-semibold hover:bg-line">
            +{n}
          </button>
        ))}
        <button type="button" onClick={() => setStake(balance)} disabled={!balance}
          className="cursor-pointer rounded-xl bg-raised py-2.5 text-sm font-semibold hover:bg-line disabled:opacity-45">
          MAX
        </button>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted">Available balance</span>
        <span className={cn("font-semibold tabular-nums", overBalance && "text-no")}>{balance.toLocaleString()} pts</span>
      </div>
      {overBalance && <p className="text-xs font-semibold text-no">That&apos;s more than your balance.</p>}

      {confirming && selectedOption ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-lime/50 bg-lime/[0.06] p-4">
          <div>
            <div className="font-semibold">Stake {value.toLocaleString()} pts on {selectedOption.text}?</div>
            <div className="mt-0.5 text-sm text-muted">
              If it wins you&apos;d get about {estimate.toLocaleString()} pts back at current odds.
            </div>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1 rounded-xl py-3 text-sm" onClick={submit} disabled={!canSubmit}>
              {place.isPending ? "Staking…" : "Confirm stake"}
            </Button>
            <Button variant="secondary" className="rounded-xl px-5 py-3 text-sm" onClick={() => setConfirming(false)}
              disabled={place.isPending}>
              Back
            </Button>
          </div>
        </div>
      ) : (
        <Button className="flex items-center justify-center gap-1.5 rounded-2xl py-4 text-base" disabled={!canSubmit}
          onClick={() => setConfirming(true)}>
          {label} {canSubmit && <ArrowUpRightIcon size={18} />}
        </Button>
      )}

      <ErrorNote error={place.error} />
      {place.isSuccess && (
        <p className="text-sm font-semibold text-live">
          Staked {place.data.position.amount} pts on {place.data.position.optionText}.
        </p>
      )}
      <p className="text-center text-xs text-faint">Virtual points only · No real-money wagering</p>
    </Card>
  );
}

function RecentActivity({ marketId, live }: { marketId: ID; live: boolean }) {
  const { data } = useMarketActivity(marketId, { live });
  if (!data?.items.length) return null;
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="text-lg font-bold tracking-tight">Recent activity</h2>
      <div className="flex flex-col">
        {data.items.slice(0, 8).map((a) => (
          <div key={a.id} className="flex items-center gap-3 border-b border-line py-2.5 text-sm last:border-b-0">
            <Avatar id={a.user.id} name={a.user.username} size={28} rounded="rounded-full" />
            <span className="min-w-0 flex-1 text-muted">{a.user.username} bet {a.amount} pts on {a.optionText}</span>
            <span className="flex-none text-xs text-faint">{formatRelative(a.createdAt)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function MarketInfo({ market }: { market: MarketDetail }) {
  const myOption = market.options.find((o) => o.id === market.myStake?.optionId);
  return (
    <Card className="flex flex-col gap-3.5 p-5">
      <h2 className="text-lg font-bold tracking-tight">Market info</h2>
      <div className="flex flex-col gap-2.5 text-sm">
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
      <p className="rounded-xl bg-raised p-3 text-xs leading-normal text-muted">
        Resolution rule: the assigned moderator validates the real-world outcome once the market closes. Bets
        pay out automatically based on their call, or are refunded if nullified.
      </p>
    </Card>
  );
}

function MarketView({ market }: { market: MarketDetail }) {
  // Default to the side the user already backed; they can only add to it.
  const [selected, setSelected] = useState<ID | null>(market.myStake?.optionId ?? null);
  const settled = market.status === "RESOLVED" || market.status === "CANCELLED";
  useSettlementSync(market);

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-4 pt-6 pb-16 sm:px-6">
      <BackLink href={`/communities/${market.communityId}`}>Back to {market.communityName}</BackLink>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-7">
        <div className="flex min-w-0 flex-col gap-5">
          <header className="flex flex-col gap-3 border-b border-line pb-6">
            <div className="flex items-center justify-between gap-3">
              <CommunityChip name={market.communityName} visibility={market.communityVisibility} />
              {market.status === "OPEN" ? <StatusPill tone="live">Live</StatusPill>
                : market.status === "LOCKED" ? <StatusPill tone="muted">Closed</StatusPill>
                : market.status === "PAYOUT_PENDING" ? <StatusPill tone="orange">Paying out</StatusPill>
                : market.status === "CANCELLED" ? <StatusPill tone="no">Nullified</StatusPill>
                : <StatusPill tone="muted">Resolved</StatusPill>}
            </div>
            <h1 className="text-[28px] leading-tight font-bold tracking-tight sm:text-4xl">{market.title}</h1>
            {market.description && <p className="text-[15px] leading-normal text-muted">{market.description}</p>}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted">
              <span className="flex items-center gap-1.5"><ClockIcon size={15} />{formatTimeLeft(market.deadline, market.status)}</span>
              <span className="flex items-center gap-1.5"><CoinIcon size={14} />{formatPoints(market.totalPool)}</span>
              <span className="flex items-center gap-1.5"><UsersIcon size={15} />{market.participantCount} predicting</span>
            </div>
          </header>

          {(market.permissions.canResolve || market.permissions.canCancel)
            ? <ModeratorPanel market={market} />
            : market.status === "PAYOUT_PENDING" && <PayoutPendingBanner market={market} />}
          {settled && <ResolvedBanner market={market} />}
          <MyResult market={market} />
          <OutcomePicker market={market} selected={selected} onSelect={setSelected} />
        </div>

        <aside className="flex flex-col gap-5 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {market.permissions.canBet && <StakePanel market={market} selected={selected} />}
          <MarketInfo market={market} />
        </aside>

        <div className="flex min-w-0 flex-col gap-5">
          <ProbabilityChart options={market.options} history={market.history} marketType={market.marketType} />
          <RecentActivity marketId={market.id} live={isLive(market.status)} />
        </div>
      </div>
    </div>
  );
}

export default function MarketPage() {
  const marketId = Number(useParams<{ marketId: string }>().marketId);
  const { data: market, error, isLoading } = useMarket(marketId);

  if (isLoading) {
    return <div className="mx-auto max-w-[1180px] px-4 pt-7 sm:px-6"><Skeleton className="h-96" /></div>;
  }
  if (!market) {
    return <div className="mx-auto max-w-[1180px] px-4 pt-7 sm:px-6"><ErrorNote error={error} /></div>;
  }
  return <MarketView key={market.id} market={market} />;
}
