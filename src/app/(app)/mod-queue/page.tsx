"use client";

import Link from "next/link";
import { ErrorNote, Skeleton } from "@/components/ui";
import { useModQueue } from "@/hooks/use-me";
import { useCancelMarket, useResolveMarket } from "@/hooks/use-markets";
import { formatTimeLeft } from "@/lib/format";
import type { MarketSummary } from "@/types";

function PendingRow({ market }: { market: MarketSummary }) {
  const resolve = useResolveMarket(market.id);
  const cancel = useCancelMarket(market.id);
  const busy = resolve.isPending || cancel.isPending;

  return (
    <div className="flex flex-col gap-2 rounded-[14px] border-[1.5px] border-brand bg-brand-soft p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-brand-dark">{market.communityName}</div>
          <Link href={`/markets/${market.id}`} className="text-[15px] font-extrabold hover:text-brand">
            {market.title}
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {market.options.map((o) => (
            <button key={o.id} disabled={busy}
              onClick={() => confirm(`Resolve as "${o.text}"? This pays out immediately.`) && resolve.mutate({ winningOptionId: o.id })}
              className="cursor-pointer rounded-2xl bg-ink px-3.5 py-2 text-xs font-bold text-white hover:bg-ink/85 disabled:opacity-50">
              {o.text}
            </button>
          ))}
          <button disabled={busy}
            onClick={() => confirm("Nullify this market and refund every bet?") && cancel.mutate({})}
            className="cursor-pointer rounded-2xl border-[1.5px] border-no bg-white px-3.5 py-2 text-xs font-bold text-brand-dark disabled:opacity-50">
            Nullify
          </button>
        </div>
      </div>
      <ErrorNote error={resolve.error ?? cancel.error} />
    </div>
  );
}

export default function ModQueuePage() {
  const { data, isLoading } = useModQueue();

  return (
    <div className="mx-auto flex max-w-[800px] flex-col gap-6 px-4 pt-7 pb-16 sm:px-8">
      <div>
        <h1 className="text-2xl font-extrabold">Mod Queue</h1>
        <p className="mt-1 text-[13px] font-semibold text-muted">Markets you&apos;re the assigned moderator for.</p>
      </div>

      <section>
        <h2 className="mb-2.5 text-sm font-extrabold text-brand-dark">Needs resolution</h2>
        <div className="flex flex-col gap-2.5">
          {isLoading && <Skeleton className="h-20" />}
          {data?.pending.map((m) => <PendingRow key={m.id} market={m} />)}
          {data && data.pending.length === 0 && (
            <p className="text-[13px] font-semibold text-faint">Nothing waiting on you — nice.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-2.5 text-sm font-extrabold text-muted">Active — you moderate</h2>
        <div className="flex flex-col gap-2">
          {data?.active.map((m) => (
            <Link key={m.id} href={`/markets/${m.id}`}
              className="flex justify-between gap-3 rounded-[14px] border border-line bg-white px-4 py-3.5 hover:bg-ink/3">
              <span className="text-[13px] font-bold">{m.title}</span>
              <span className="flex-none text-xs font-semibold text-faint">{formatTimeLeft(m.deadline, m.status)}</span>
            </Link>
          ))}
          {data && data.active.length === 0 && (
            <p className="text-[13px] font-semibold text-faint">No open markets to watch.</p>
          )}
        </div>
      </section>
    </div>
  );
}
