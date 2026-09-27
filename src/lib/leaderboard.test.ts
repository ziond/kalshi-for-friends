import { describe, expect, it } from "vitest";
import type { LeaderboardEntry } from "@/types";
import { rankByWinRate, winRate } from "./leaderboard";

let nextId = 1;
function entry(username: string, correct: number, total: number, netProfit = 0): LeaderboardEntry {
  return {
    rank: 0,
    user: { id: nextId++, username, avatarUrl: null },
    netProfit,
    correctPredictions: correct,
    totalPredictions: total,
    accuracy: 0, // ignored: win rate is derived from the counts
  };
}

const names = (entries: { user: { username: string } }[]) => entries.map((e) => e.user.username);

describe("rankByWinRate", () => {
  it("orders by win rate, not net profit", () => {
    const { ranked } = rankByWinRate([entry("Rich", 2, 5, 900), entry("Sharp", 4, 5, 100), entry("Mid", 3, 5, 500)]);
    expect(names(ranked)).toEqual(["Sharp", "Mid", "Rich"]);
    expect(ranked.map((e) => e.rank)).toEqual([1, 2, 3]);
    expect(ranked[0].winRate).toBe(0.8);
  });

  it("breaks win-rate ties by correct calls, then net profit", () => {
    const { ranked } = rankByWinRate([entry("Few", 1, 2, 50), entry("Many", 5, 10, 10), entry("ManyRicher", 5, 10, 90)]);
    expect(names(ranked)).toEqual(["ManyRicher", "Many", "Few"]);
  });

  it("gives identical records the same rank", () => {
    const { ranked } = rankByWinRate([entry("A", 3, 4), entry("B", 3, 4, 20), entry("C", 1, 4)]);
    expect(ranked.map((e) => e.rank)).toEqual([1, 1, 3]);
  });

  it("keeps members without settled predictions out of the ranking", () => {
    const { ranked, unranked } = rankByWinRate([entry("Zed", 0, 0), entry("Pro", 1, 1), entry("Amy", 0, 0)]);
    expect(names(ranked)).toEqual(["Pro"]);
    expect(names(unranked)).toEqual(["Amy", "Zed"]);
  });
});

describe("winRate", () => {
  it("is 0 with no settled predictions", () => {
    expect(winRate({ correctPredictions: 0, totalPredictions: 0 })).toBe(0);
    expect(winRate({ correctPredictions: 3, totalPredictions: 4 })).toBe(0.75);
  });
});
