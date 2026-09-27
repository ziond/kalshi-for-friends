// The mock API stands in for the Go backend, so these tests pin down the
// contract rules the UI relies on (docs/api-contract.md).

import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CommunityDetail,
  InvitePreview,
  MarketDetail,
  MarketSummary,
  Me,
  ModQueue,
  Paginated,
  PlacePositionResponse,
  Position,
  DailyBonusResponse,
} from "@/types";
import { communitiesApi, marketsApi, meApi } from "@/lib/api";
import { ApiError } from "../errors";

async function expectApiError(promise: Promise<unknown>, code: ApiError["code"]) {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe(code);
}

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

describe("current user & wallet", () => {
  it("returns the signed-in user with their balance", async () => {
    const me: Me = await meApi.get();
    expect(me.username).toBe("Jordan");
    expect(me.balance).toBe(4820);
  });

  it("adds the daily 1,000 points once and restarts the 24-hour timer", async () => {
    const before = await meApi.get();
    expect(Date.parse(before.nextDailyBonusAt)).toBeLessThanOrEqual(Date.now()); // demo user: ready now

    const claimed: DailyBonusResponse = await meApi.claimDailyBonus();

    expect(claimed).toMatchObject({ amount: 1000, balance: 4820 + 1000 });
    expect(Date.parse(claimed.nextDailyBonusAt) - Date.now()).toBeGreaterThan(24 * 3_600_000 - 5_000);
    const after = await meApi.get();
    expect(after).toMatchObject({ balance: 5820, nextDailyBonusAt: claimed.nextDailyBonusAt });
  });

  it("refuses a second claim within 24 hours and says when the next one opens", async () => {
    await meApi.claimDailyBonus();
    const error = await meApi.claimDailyBonus().then(() => null, (e: ApiError) => e);
    expect(error).toMatchObject({ status: 409, code: "DAILY_BONUS_NOT_READY", message: expect.stringMatching(/ready in 2[34]h/) });
    expect((await meApi.get()).balance).toBe(5820);
  });

  it("doesn't stack missed days", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      await meApi.claimDailyBonus();
      vi.setSystemTime(Date.now() + 3 * 24 * 3_600_000); // away for three days

      await meApi.claimDailyBonus();
      expect((await meApi.get()).balance).toBe(4820 + 2 * 1000); // one drop waiting, not three
      await expectApiError(meApi.claimDailyBonus(), "DAILY_BONUS_NOT_READY");
    } finally {
      vi.useRealTimers();
    }
  });

  it("no longer accepts free top-ups", async () => {
    const { mockRequest } = await import("./handlers");
    await expectApiError(mockRequest("POST", "/me/wallet/deposit", {}, { amount: 1000 }), "NOT_FOUND");
  });
});

describe("market feed", () => {
  it("returns the top private and public open markets by volume", async () => {
    const titles = (page: Paginated<MarketSummary>) => page.items.map((m) => m.title);

    const priv = await marketsApi.feed({ visibility: "PRIVATE", status: "OPEN", sort: "volume", limit: 3 });
    expect(titles(priv)).toEqual([
      "BTC closes above $120k this Friday?",
      "Will Jordan's team make the playoffs?",
      "Who says 'that's what she said' first tonight?",
    ]);

    const pub = await marketsApi.feed({ visibility: "PUBLIC", status: "OPEN", sort: "volume", limit: 3 });
    expect(titles(pub)).toEqual([
      "Who wins the mayoral primary?",
      "Opening weekend box office > $80M?",
      "Will it snow in NYC before Nov 1?",
    ]);
  });

  it("gives each market probabilities that sum to 1", async () => {
    const market = await marketsApi.get(6);
    const total = market.options.reduce((sum, o) => sum + o.probability, 0);
    expect(total).toBeCloseTo(1);
  });
});

describe("placing a position", () => {
  it("debits the wallet, grows the pool and records history", async () => {
    const before = await marketsApi.get(2);
    const yes = before.options[0];

    const res: PlacePositionResponse = await marketsApi.placePosition(2, { optionId: yes.id, amount: 100 });

    expect(res.balance).toBe(4720);
    expect(res.market.totalPool).toBe(before.totalPool + 100);
    expect(res.market.options[0].probability).toBeGreaterThan(yes.probability);
    expect(res.market.history).toHaveLength(before.history.length + 1);
    expect(res.market.myStake).toMatchObject({ optionId: yes.id, amount: 300 });
  });

  it("won't let you switch sides once you've bet", async () => {
    const market = await marketsApi.get(2); // Jordan already backs "Yes"
    await expectApiError(marketsApi.placePosition(2, { optionId: market.options[1].id, amount: 10 }), "OPTION_SWITCH_NOT_ALLOWED");
  });

  it("rejects bets larger than the balance", async () => {
    const market = await marketsApi.get(1);
    await expectApiError(marketsApi.placePosition(1, { optionId: market.options[0].id, amount: 999_999 }), "INSUFFICIENT_FUNDS");
  });

  it("rejects bets on closed markets", async () => {
    const market = await marketsApi.get(9);
    expect(market.status).toBe("LOCKED");
    expect(market.permissions.canBet).toBe(false);
    await expectApiError(marketsApi.placePosition(9, { optionId: market.options[0].id, amount: 5 }), "MARKET_CLOSED");
  });
});

describe("moderation", () => {
  it("lists markets the user moderates", async () => {
    const queue: ModQueue = await meApi.modQueue();
    expect(queue.pending.map((m) => m.id)).toEqual([9]);
    expect(queue.active.map((m) => m.id)).toEqual([3]);
  });

  it("only lets the assigned moderator resolve", async () => {
    const market = await marketsApi.get(7); // moderated by Sam K.
    expect(market.permissions.canResolve).toBe(false);
    await expectApiError(marketsApi.resolve(7, { winningOptionId: market.options[0].id }), "FORBIDDEN");
  });

  it("picks a winner and starts the grace period without paying anyone", async () => {
    const market = await marketsApi.get(9);
    const picked: MarketDetail = await marketsApi.resolve(9, { winningOptionId: market.options[0].id });

    expect(picked.status).toBe("PAYOUT_PENDING");
    expect(picked.options.map((o) => o.isWinner)).toEqual([null, null, null]); // not final yet
    expect(Date.parse(picked.settlement!.payoutAt) - Date.parse(picked.settlement!.resolvedAt)).toBe(5 * 60_000);
    expect(picked.settlement!.paidOutAt).toBeNull();
    expect(picked.payoutAt).toBe(picked.settlement!.payoutAt);
    expect(picked.permissions).toMatchObject({ canResolve: false, canCancel: true });

    const queue = await meApi.modQueue();
    expect(queue.pending).toHaveLength(0);
    expect(queue.payoutPending.map((m) => m.id)).toEqual([9]);
  });

  describe("grace period", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    /** Jordan backs "Yes" (200 pts) on market 2, which Mina moderates; let Jordan moderate it once closed. */
    async function closedMarketWithMyStake() {
      const { markets } = await import("./db");
      const row = markets.find((m) => m.id === 2)!;
      row.moderatorId = 1;
      row.deadline = new Date(Date.now() - 1000).toISOString();
      return marketsApi.get(2);
    }

    const skipGracePeriod = () => vi.setSystemTime(Date.now() + 5 * 60_000 + 1000);

    it("pays winners from the whole pool once it ends", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const market = await closedMarketWithMyStake();
      const expected = market.myStake!.potentialPayout;

      await marketsApi.resolve(2, { winningOptionId: market.options[0].id });
      expect((await meApi.get()).balance).toBe(4820); // nothing paid during the grace period

      skipGracePeriod();
      expect((await meApi.get()).balance).toBe(4820 + expected); // paid on the next request, any endpoint
      const settled: Paginated<Position> = await meApi.positions({ status: "settled" });
      expect(settled.items.find((p) => p.market.id === 2)).toMatchObject({ result: "WON", payout: expected });
      const resolved = await marketsApi.get(2);
      expect(resolved.status).toBe("RESOLVED");
      expect(resolved.options.map((o) => o.isWinner)).toEqual([true, false]);
      expect(resolved.settlement!.paidOutAt).not.toBeNull();
      expect(resolved.permissions.canCancel).toBe(false);
    });

    it("lets the moderator nullify before the payout, refunding everyone for good", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const market = await closedMarketWithMyStake();
      await marketsApi.resolve(2, { winningOptionId: market.options[0].id });

      const cancelled = await marketsApi.cancel(2, {});
      expect(cancelled.status).toBe("CANCELLED");
      expect(cancelled.settlement).toBeNull();
      expect((await meApi.get()).balance).toBe(4820 + 200);

      skipGracePeriod(); // the old payout time passes: nothing happens
      expect((await meApi.get()).balance).toBe(4820 + 200);
      expect((await marketsApi.get(2)).status).toBe("CANCELLED");
      await expectApiError(marketsApi.resolve(2, { winningOptionId: market.options[0].id }), "MARKET_CLOSED");
    });

    it("never lets the moderator switch the pick; they can only nullify", async () => {
      const market = await marketsApi.get(9);
      await marketsApi.resolve(9, { winningOptionId: market.options[0].id });

      for (const option of market.options) { // another outcome, or the same one again
        const error = await marketsApi.resolve(9, { winningOptionId: option.id }).then(() => null, (e: ApiError) => e);
        expect(error).toMatchObject({ code: "MARKET_CLOSED", message: "A winner has already been picked. You can only nullify this market" });
      }
      const stillPending = await marketsApi.get(9);
      expect(stillPending.settlement!.winningOptionId).toBe(market.options[0].id);
      expect(stillPending.permissions).toMatchObject({ canResolve: false, canCancel: true });
      expect((await marketsApi.cancel(9, {})).status).toBe("CANCELLED");
    });

    it("doesn't allow nullifying after the payout", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const market = await marketsApi.get(9);
      await marketsApi.resolve(9, { winningOptionId: market.options[0].id });
      skipGracePeriod();
      await expectApiError(marketsApi.cancel(9, {}), "MARKET_CLOSED");
    });
  });

  it("refunds everyone when a market is nullified", async () => {
    const { markets } = await import("./db");
    markets.find((m) => m.id === 8)!.moderatorId = 1; // Jordan has 100 on "No"

    const cancelled = await marketsApi.cancel(8, {});
    expect(cancelled.status).toBe("CANCELLED");
    expect((await meApi.get()).balance).toBe(4820 + 100);
  });
});

describe("communities", () => {
  it("lists public communities in Discover, with membership", async () => {
    const discover = await communitiesApi.discover();
    expect(discover.map((c) => [c.name, c.myRole])).toEqual([
      ["Election Junkies", null],
      ["Movie Box Office Bets", "MEMBER"],
      ["NYC Weather Watchers", "MEMBER"],
    ]);
  });

  it("joins a public community directly but not twice", async () => {
    const joined = await communitiesApi.join(6);
    expect(joined.myRole).toBe("MEMBER");
    await expectApiError(communitiesApi.join(6), "ALREADY_MEMBER");
  });

  it("previews and accepts invite codes", async () => {
    const preview: InvitePreview = await communitiesApi.invitePreview("HUD1X7Q2P");
    expect(preview.community.name).toBe("Fantasy Football Legends");
    await expectApiError(communitiesApi.invitePreview("NOPE"), "INVALID_INVITE_CODE");
  });

  it("creates a private community with the creator as admin and an invite code", async () => {
    const created: CommunityDetail = await communitiesApi.create({ name: "Test Crew", visibility: "PRIVATE" });
    expect(created.myRole).toBe("ADMIN");
    expect(created.inviteCode).toBeTruthy();
    expect((await communitiesApi.list()).map((c) => c.id)).toContain(created.id);
  });
});

describe("public invite details", () => {
  it("returns only name, visibility and member count, without signing in", async () => {
    const { mockRequest } = await import("./handlers");
    const invite = await mockRequest("GET", "/public/invites/HUD1X7Q2P", {}, undefined);
    expect(invite).toEqual({
      inviteCode: "HUD1X7Q2P",
      community: { name: "Fantasy Football Legends", visibility: "PRIVATE", memberCount: 24 },
    });
  });

  it("rejects an invalid code", async () => {
    const { mockRequest } = await import("./handlers");
    await expectApiError(mockRequest("GET", "/public/invites/BOGUS", {}, undefined), "INVALID_INVITE_CODE");
  });
});

describe("creating a market", () => {
  it("rejects a deadline in the past", async () => {
    await expectApiError(
      marketsApi.create(1, { title: "Too late", marketType: "BINARY", deadline: inDays(-1) }),
      "VALIDATION_ERROR",
    );
  });

  it("needs at least two non-empty outcomes for multiple choice", async () => {
    await expectApiError(
      marketsApi.create(1, { title: "Who?", marketType: "MULTIPLE_CHOICE", options: ["Only one", " "], deadline: inDays(1) }),
      "VALIDATION_ERROR",
    );
  });

  it("creates YES/NO options for binary markets, split evenly", async () => {
    const market = await marketsApi.create(1, { title: "Rain tomorrow?", marketType: "BINARY", deadline: inDays(1) });
    expect(market.options.map((o) => [o.text, o.probability])).toEqual([["Yes", 0.5], ["No", 0.5]]);
    expect(market.status).toBe("OPEN");
  });
});
