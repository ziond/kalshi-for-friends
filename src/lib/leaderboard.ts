import type { LeaderboardEntry } from "@/types";

/** Share of settled predictions that were right, 0–1. Derived from the counts so it can't drift from them. */
export function winRate(entry: Pick<LeaderboardEntry, "correctPredictions" | "totalPredictions">): number {
  return entry.totalPredictions ? entry.correctPredictions / entry.totalPredictions : 0;
}

export interface RankedEntry extends LeaderboardEntry {
  winRate: number;
}

/**
 * Re-ranks a community leaderboard by win rate (the API ranks by net profit).
 * Ties on win rate go to whoever has more correct calls, then more net profit.
 * Members with the same win rate and correct calls share a rank ("1, 2, 2, 4").
 * Members with no settled predictions are returned separately as `unranked`.
 */
export function rankByWinRate(entries: LeaderboardEntry[]): { ranked: RankedEntry[]; unranked: LeaderboardEntry[] } {
  const ranked = entries
    .filter((e) => e.totalPredictions > 0)
    .map((e) => ({ ...e, winRate: winRate(e) }))
    .sort((a, b) =>
      b.winRate - a.winRate ||
      b.correctPredictions - a.correctPredictions ||
      b.netProfit - a.netProfit ||
      a.user.username.localeCompare(b.user.username));

  ranked.forEach((e, i) => {
    const prev = ranked[i - 1];
    e.rank = prev && prev.winRate === e.winRate && prev.correctPredictions === e.correctPredictions ? prev.rank : i + 1;
  });

  const unranked = entries
    .filter((e) => e.totalPredictions === 0)
    .sort((a, b) => a.user.username.localeCompare(b.user.username));
  return { ranked, unranked };
}
