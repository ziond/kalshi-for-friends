// Community leaderboard: ranked by win rate, not net profit.

import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ME, positions, users } from "@/lib/api/mock/db";
import { navigation } from "@/test/navigation";
import { renderWithClient } from "@/test/render";
import CommunityPage from "./communities/[communityId]/page";
import LeaderboardPage from "./communities/[communityId]/leaderboard/page";

const uid = (name: string) => users.find((u) => u.username === name)!.id;

/** A settled bet in Fantasy Football Legends (community 1 has markets 1 and 7). */
function settled(userId: number, marketId: 1 | 7, won: boolean, amount: number, payout: number) {
  positions.push({
    id: 1000 + positions.length, marketId, optionId: 1, userId, amount,
    createdAt: new Date().toISOString(), result: won ? "WON" : "LOST", payout: won ? payout : 0,
  });
}

describe("Community leaderboard", () => {
  it("ranks members by win rate and lists those without settled calls separately", async () => {
    // Jordan: 1 of 2 but big profit. Sam: 2 of 2, small profit. Win rate beats profit.
    settled(ME, 1, true, 100, 900);
    settled(ME, 7, false, 50, 0);
    settled(uid("Sam K."), 1, true, 10, 20);
    settled(uid("Sam K."), 7, true, 10, 20);
    navigation.params = { communityId: "1" };
    renderWithClient(<LeaderboardPage />);

    const leader = await screen.findByRole("region", { name: "Top caller" });
    expect(within(leader).getByText(/Sam K\./)).toBeInTheDocument();
    expect(within(leader).getByText("100%")).toBeInTheDocument();
    expect(within(leader).getByText("Called 2 of 2 · +20 pts")).toBeInTheDocument();

    const rows = within(screen.getByRole("list", { name: "Rankings" })).getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText("Jordan")).toBeInTheDocument();
    expect(within(rows[0]).getByText("50%")).toBeInTheDocument();
    expect(within(rows[0]).getByText("+750 pts")).toBeInTheDocument();
    expect(await screen.findByText("You're #2 of 2 with a 50% win rate.")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Fantasy Football Legends" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Yet to call one" })).toBeInTheDocument();
  });

  it("explains an empty leaderboard", async () => {
    navigation.params = { communityId: "1" };
    renderWithClient(<LeaderboardPage />);

    expect(await screen.findByText(/No predictions have settled here yet/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Top caller" })).not.toBeInTheDocument();
  });

  it("is linked from the community page for members", async () => {
    navigation.params = { communityId: "1" };
    renderWithClient(<CommunityPage />);

    expect(await screen.findByRole("link", { name: "Leaderboard" })).toHaveAttribute("href", "/communities/1/leaderboard");
  });
});
