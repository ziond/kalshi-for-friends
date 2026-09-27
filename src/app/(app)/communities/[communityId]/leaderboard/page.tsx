"use client";

import { useParams } from "next/navigation";
import { TrophyIcon } from "@/components/icons";
import { Avatar, BackLink, EmptyState, ErrorNote, Eyebrow, ProbabilityBar, Skeleton, cn } from "@/components/ui";
import { useCommunity, useLeaderboard } from "@/hooks/use-communities";
import { useMe } from "@/hooks/use-me";
import { formatPercent } from "@/lib/format";
import { rankByWinRate, type RankedEntry } from "@/lib/leaderboard";
import type { ID } from "@/types";

function signedPoints(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toLocaleString()} pts`;
}

function YouTag() {
  return <span className="rounded-full bg-lime/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-lime uppercase">You</span>;
}

/** The #1 spot, on the lime brand card. */
function LeaderCard({ entry, isMe }: { entry: RankedEntry; isMe: boolean }) {
  return (
    <section aria-label="Top caller" className="rounded-[26px] bg-lime p-6 text-on-lime sm:p-7">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-on-lime/10 px-3 py-1 text-xs font-semibold tracking-[0.08em] uppercase">
          #1 · Top caller
        </span>
        <TrophyIcon size={24} />
      </div>
      <div className="mt-5 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 truncate text-[28px] leading-tight font-bold tracking-tight sm:text-[32px]">
            {entry.user.username}
            {isMe && <span className="rounded-full bg-on-lime px-2 py-0.5 text-[10px] font-bold tracking-wide text-lime uppercase">You</span>}
          </div>
          <div className="mt-1 text-[15px] text-on-lime/75">
            Called {entry.correctPredictions} of {entry.totalPredictions} · {signedPoints(entry.netProfit)}
          </div>
        </div>
        <div className="flex-none text-right">
          <div className="text-[44px] leading-none font-extrabold tracking-tight tabular-nums sm:text-[56px]">
            {formatPercent(entry.winRate)}
          </div>
          <div className="mt-1 text-xs font-semibold tracking-[0.08em] text-on-lime/70 uppercase">Win rate</div>
        </div>
      </div>
    </section>
  );
}

function RankRow({ entry, isMe }: { entry: RankedEntry; isMe: boolean }) {
  return (
    <li className={cn("flex items-center gap-3.5 rounded-[18px] border bg-surface p-4",
      isMe ? "border-lime/50" : "border-line")}>
      <span className={cn("w-7 flex-none text-center text-lg font-bold tabular-nums",
        entry.rank <= 3 ? "text-ink" : "text-faint")}>
        {entry.rank}
      </span>
      <Avatar id={entry.user.id} name={entry.user.username} size={40} rounded="rounded-full" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 font-semibold">
          <span className="truncate">{entry.user.username}</span>
          {isMe && <YouTag />}
        </div>
        <div className="mt-0.5 text-[13px] text-muted">
          {entry.correctPredictions}/{entry.totalPredictions} called ·{" "}
          <span className={entry.netProfit > 0 ? "text-live" : entry.netProfit < 0 ? "text-no" : undefined}>
            {signedPoints(entry.netProfit)}
          </span>
        </div>
        <ProbabilityBar value={entry.winRate} color="var(--color-lime)" className="mt-2.5 h-1.5" />
      </div>
      <div className="flex-none text-right">
        <div className="text-2xl font-bold tabular-nums">{formatPercent(entry.winRate)}</div>
        <div className="text-[11px] tracking-wide text-faint uppercase">Win rate</div>
      </div>
    </li>
  );
}

export default function LeaderboardPage() {
  const communityId: ID = Number(useParams<{ communityId: string }>().communityId);
  const { data: community, error: communityError } = useCommunity(communityId);
  const { data: entries, error, isLoading } = useLeaderboard(communityId);
  const { data: me } = useMe();

  const { ranked, unranked } = rankByWinRate(entries ?? []);
  const [leader, ...rest] = ranked;
  const myEntry = ranked.find((e) => e.user.id === me?.id);

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-4 pt-6 pb-16 sm:px-6">
      <BackLink href={`/communities/${communityId}`}>Back to {community?.name ?? "community"}</BackLink>

      <header>
        <Eyebrow>Leaderboard</Eyebrow>
        <h1 className="mt-2 text-[32px] leading-tight font-bold tracking-tight sm:text-[40px]">
          {community?.name ?? " "}
        </h1>
        <p className="mt-1 text-[15px] text-muted">
          Ranked by win rate — the share of settled predictions each member got right.
        </p>
        {myEntry && (
          <p className="mt-3 text-sm font-semibold text-lime">
            You&apos;re #{myEntry.rank} of {ranked.length} with a {formatPercent(myEntry.winRate)} win rate.
          </p>
        )}
      </header>

      <ErrorNote error={error ?? communityError} />

      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-44" />
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[92px]" />)}
        </div>
      ) : entries && !leader ? (
        <EmptyState>
          No predictions have settled here yet. Once a market resolves, the sharpest callers show up here.
        </EmptyState>
      ) : leader ? (
        <>
          <LeaderCard entry={leader} isMe={leader.user.id === me?.id} />
          {rest.length > 0 && (
            <ol aria-label="Rankings" className="flex flex-col gap-2.5">
              {rest.map((e) => <RankRow key={e.user.id} entry={e} isMe={e.user.id === me?.id} />)}
            </ol>
          )}
        </>
      ) : null}

      {unranked.length > 0 && (
        <section aria-label="Yet to call one">
          <h2 className="mb-3 text-sm font-semibold text-muted">Yet to call one · {unranked.length}</h2>
          <div className="flex flex-wrap gap-2">
            {unranked.map((e) => (
              <span key={e.user.id} className="flex items-center gap-2 rounded-full bg-surface py-1 pr-3 pl-1 text-[13px]">
                <Avatar id={e.user.id} name={e.user.username} size={24} rounded="rounded-full" />
                {e.user.username}
                {e.user.id === me?.id && <YouTag />}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
