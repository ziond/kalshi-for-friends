"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CheckCheckIcon, ChevronRightIcon, ClockIcon, CoinIcon } from "@/components/icons";
import { CommunityChip, ErrorNote, Segmented, Skeleton } from "@/components/ui";
import { useModQueue } from "@/hooks/use-me";
import { useNow } from "@/hooks/use-now";
import { useCancelMarket, useResolveMarket } from "@/hooks/use-markets";
import { formatCountdown, formatPoints, formatTimeLeft, outcomeColor } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import type { MarketSummary } from "@/types";

type Tab = "pending" | "active";

function PendingCard({ market }: { market: MarketSummary }) {
  const resolve = useResolveMarket(market.id);
  const cancel = useCancelMarket(market.id);
  const busy = resolve.isPending || cancel.isPending;

  return (
    <article className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <CommunityChip name={market.communityName} visibility={market.communityVisibility} />
        <span className="flex flex-none items-center gap-1.5 text-xs text-muted">
          <CoinIcon size={13} /> {formatPoints(market.totalPool)} at stake
        </span>
      </div>
      <Link href={`/markets/${market.id}`} className="text-lg leading-snug font-bold tracking-tight hover:text-lime">
        {market.title}
      </Link>
      <div>
        <div className="mb-2.5 text-xs font-semibold tracking-[0.08em] text-faint uppercase">Pick the winning outcome</div>
        <div className="flex flex-wrap gap-2">
          {market.options.map((o, i) => (
            <button key={o.id} disabled={busy}
              onClick={() => confirm(`Resolve as "${o.text}"? This pays out immediately.`) && resolve.mutate({ winningOptionId: o.id })}
              className="flex cursor-pointer items-center gap-2 rounded-full bg-raised px-4 py-2.5 text-sm font-semibold hover:bg-line disabled:opacity-45">
              <span className="size-2.5 rounded-full" style={{ background: outcomeColor(market.marketType, i) }} />
              {o.text}
            </button>
          ))}
          <button disabled={busy}
            onClick={() => confirm("Nullify this market and refund every bet?") && cancel.mutate({})}
            className="cursor-pointer rounded-full border border-no/60 px-4 py-2.5 text-sm font-semibold text-no hover:bg-no/10 disabled:opacity-45">
            Nullify
          </button>
        </div>
      </div>
      <ErrorNote error={resolve.error ?? cancel.error} />
    </article>
  );
}

/** Winner picked; payouts go out when the countdown ends unless the moderator nullifies first. */
function PayoutPendingCard({ market }: { market: MarketSummary }) {
  const qc = useQueryClient();
  const cancel = useCancelMarket(market.id);
  const now = useNow();
  const due = market.payoutAt ? Date.parse(market.payoutAt) <= now : false;

  useEffect(() => {
    if (due) qc.invalidateQueries({ queryKey: queryKeys.me.modQueue() });
  }, [due, qc]);

  return (
    <article className="flex flex-col gap-3 rounded-[20px] border border-orange/40 bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <CommunityChip name={market.communityName} visibility={market.communityVisibility} />
        <span className="flex-none text-xs font-semibold text-orange tabular-nums">
          {due || !market.payoutAt ? "Paying out now…" : `Payout in ${formatCountdown(market.payoutAt, now)}`}
        </span>
      </div>
      <Link href={`/markets/${market.id}`} className="text-lg leading-snug font-bold tracking-tight hover:text-lime">
        {market.title}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted">Winner picked (final). You can only nullify until the payout.</span>
        <button disabled={cancel.isPending || due}
          onClick={() => confirm("Nullify this market and refund every bet? This can't be undone.") && cancel.mutate({})}
          className="cursor-pointer rounded-full border border-no/60 px-4 py-2.5 text-sm font-semibold text-no hover:bg-no/10 disabled:opacity-45">
          Nullify
        </button>
      </div>
      <ErrorNote error={cancel.error} />
    </article>
  );
}

function ActiveRow({ market }: { market: MarketSummary }) {
  return (
    <Link href={`/markets/${market.id}`}
      className="flex items-center gap-4 rounded-[18px] border border-line bg-surface p-4 transition-colors hover:border-faint/60">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="font-semibold">{market.title}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <CommunityChip name={market.communityName} visibility={market.communityVisibility} />
          <span className="flex items-center gap-1.5"><ClockIcon size={13} />{formatTimeLeft(market.deadline, market.status)}</span>
        </span>
      </div>
      <ChevronRightIcon size={18} className="flex-none text-lime" />
    </Link>
  );
}

function CaughtUp({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-14 text-center">
      <div className="flex size-[88px] items-center justify-center rounded-[22px] bg-lime/15">
        <CheckCheckIcon size={30} className="text-lime" />
      </div>
      <p className="mt-6 text-2xl font-bold tracking-tight">{title}</p>
      <p className="mt-2.5 max-w-[340px] text-[15px] leading-relaxed text-muted">{body}</p>
      <Link href="/communities"
        className="mt-6 flex items-center gap-2 rounded-2xl border border-lime/40 px-6 py-3.5 text-[15px] font-semibold text-lime hover:bg-lime/10">
        Back to your communities <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

export default function ModQueuePage() {
  const { data, isLoading } = useModQueue();
  const [tab, setTab] = useState<Tab>("pending");
  const pending = data?.pending ?? [];
  const payoutPending = data?.payoutPending ?? [];
  const active = data?.active ?? [];

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-4 pt-7 pb-16 sm:px-6">
      <header>
        <h1 className="text-[32px] leading-tight font-bold tracking-tight sm:text-[40px]">Mod queue</h1>
        <p className="mt-1 text-[15px] text-muted">Your markets. Your call.</p>
      </header>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "pending", label: `Needs resolution${pending.length ? ` · ${pending.length}` : ""}`, ariaLabel: "Needs resolution" },
          { value: "active", label: `Active markets${active.length ? ` · ${active.length}` : ""}`, ariaLabel: "Active markets" },
        ]}
      />

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : tab === "pending" ? (
        <section aria-label="Needs resolution" className="flex flex-col gap-3">
          {pending.map((m) => <PendingCard key={m.id} market={m} />)}
          {payoutPending.length > 0 && (
            <>
              <h2 className="mt-3 text-sm font-semibold text-muted">Paying out soon · {payoutPending.length}</h2>
              {payoutPending.map((m) => <PayoutPendingCard key={m.id} market={m} />)}
            </>
          )}
          {data && pending.length === 0 && payoutPending.length === 0 && (
            <CaughtUp title="All caught up."
              body="No predictions need your decision right now. Enjoy the peace while it lasts." />
          )}
        </section>
      ) : (
        <section aria-label="Active markets" className="flex flex-col gap-2.5">
          {active.map((m) => <ActiveRow key={m.id} market={m} />)}
          {data && active.length === 0 && (
            <CaughtUp title="Nothing live."
              body="None of the markets you moderate are open right now. Start one and let the debates begin." />
          )}
        </section>
      )}
    </div>
  );
}
