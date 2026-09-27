// Live updates on the market page (MVP polling).

import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PointsPill } from "@/components/points-pill";
import { LIVE_POLL_MS } from "@/hooks/use-markets";
import { marketsApi } from "@/lib/api";
import { markets, positions, users } from "@/lib/api/mock/db";
import { mockRequest } from "@/lib/api/mock/handlers";
import { queryKeys } from "@/lib/query-keys";
import { navigation } from "@/test/navigation";
import { renderWithClient } from "@/test/render";
import MarketPage from "./page";

const uid = (name: string) => users.find((u) => u.username === name)!.id;
const nextPoll = () => act(() => vi.advanceTimersByTimeAsync(LIVE_POLL_MS));

/** The market page plus the nav's balance pill, which keeps the current user query active. */
function renderMarket(id: number) {
  navigation.params = { marketId: String(id) };
  return renderWithClient(<><PointsPill /><MarketPage /></>);
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Market page live updates", () => {
  it("shows another member's bet and the new odds within one poll", async () => {
    renderMarket(1);
    expect(await screen.findByRole("button", { name: /YES\s*58%/ })).toBeInTheDocument();

    // Sam bets from another device: 5,000 on Yes.
    const yes = markets.find((m) => m.id === 1)!.options[0];
    yes.totalAmount += 5000;
    positions.push({
      id: 5000, marketId: 1, optionId: yes.id, userId: uid("Sam K."), amount: 5000,
      createdAt: new Date().toISOString(), result: "PENDING", payout: null,
    });
    await nextPoll();

    expect(await screen.findByRole("button", { name: /YES\s*84%/ })).toBeInTheDocument();
    expect(await screen.findByText("Sam K. bet 5000 pts on Yes")).toBeInTheDocument();
  });

  it("picks up a resolution made elsewhere, then the payout, and refreshes the user's data", async () => {
    const { client } = renderMarket(9); // LOCKED, waiting on the moderator
    await screen.findByText(/you're the moderator/);
    await screen.findByRole("button", { name: /Balance 4,820 pts/ });
    const meUpdates = () => client.getQueryState(queryKeys.me.profile())!.dataUpdateCount;
    const before = meUpdates();

    const priya = markets.find((m) => m.id === 9)!.options.find((o) => o.text === "Priya N.")!;
    await mockRequest("POST", "/markets/9/resolve", {}, { winningOptionId: priya.id }); // e.g. from another tab
    await nextPoll();

    // The pick shows up within one poll; the payout follows when the grace period ends.
    expect(await screen.findByText(/You picked Priya N\./)).toBeInTheDocument();
    expect(screen.queryByText(/you're the moderator/)).not.toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(5 * 60_000));

    expect(await screen.findByText("Resolved: Priya N. — payouts settled.")).toBeInTheDocument();
    await vi.waitFor(() => expect(meUpdates()).toBeGreaterThan(before)); // balance and stats refetched
  });

  it("stops polling once a market is settled", async () => {
    const priya = markets.find((m) => m.id === 9)!.options.find((o) => o.text === "Priya N.")!;
    await mockRequest("POST", "/markets/9/resolve", {}, { winningOptionId: priya.id });
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 1000); // grace period over: paid out on the next read
    const gets = vi.spyOn(marketsApi, "get");
    const activity = vi.spyOn(marketsApi, "activity");

    renderMarket(9);
    await screen.findByText("Resolved: Priya N. — payouts settled.");
    const before = { gets: gets.mock.calls.length, activity: activity.mock.calls.length };

    await nextPoll();
    await nextPoll();

    expect(gets.mock.calls.length).toBe(before.gets);
    expect(activity.mock.calls.length).toBe(before.activity);
  });
});
