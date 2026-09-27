import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MarketSummary } from "@/types";
import { MarketCard } from "./market-card";

const user = (id: number, username: string) => ({ id, username, avatarUrl: null });

function makeMarket(overrides: Partial<MarketSummary> = {}): MarketSummary {
  return {
    id: 42,
    communityId: 1,
    communityName: "Fantasy Football Legends",
    communityVisibility: "PRIVATE",
    title: "Will Jordan's team make the playoffs?",
    marketType: "BINARY",
    status: "OPEN",
    deadline: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    totalPool: 3200,
    participantCount: 12,
    options: [
      { id: 1, text: "Yes", totalAmount: 1856, positionCount: 7, probability: 0.58, isWinner: null },
      { id: 2, text: "No", totalAmount: 1344, positionCount: 5, probability: 0.42, isWinner: null },
    ],
    creator: user(1, "Jordan"),
    moderator: user(2, "Sam K."),
    myStake: null,
    ...overrides,
  };
}

describe("MarketCard", () => {
  it("links to the market and shows its community, title, odds and volume", () => {
    render(<MarketCard market={makeMarket()} />);

    expect(screen.getByRole("link")).toHaveAttribute("href", "/markets/42");
    expect(screen.getByText("Fantasy Football Legends")).toBeInTheDocument();
    expect(screen.getByText("Will Jordan's team make the playoffs?")).toBeInTheDocument();
    expect(screen.getByText("58%")).toBeInTheDocument();
    expect(screen.getByText("3.2k pts staked")).toBeInTheDocument();
    expect(screen.getByText("3d left")).toBeInTheDocument();
  });

  it("shows the user's stake", () => {
    render(<MarketCard market={makeMarket({ myStake: { optionId: 1, amount: 200, potentialPayout: 344 } })} />);
    expect(screen.getByText("Your stake: 200 on Yes")).toBeInTheDocument();
  });

  it("shows the winner once resolved", () => {
    const market = makeMarket({ status: "RESOLVED" });
    market.options[1].isWinner = true;
    render(<MarketCard market={market} />);
    expect(screen.getByText("Resolved: No")).toBeInTheDocument();
  });

  it("shows the top three outcomes of a multiple-choice market", () => {
    const market = makeMarket({
      marketType: "MULTIPLE_CHOICE",
      options: ["Torres", "Blake", "Nguyen", "Write-in"].map((text, i) => ({
        id: i + 1, text, totalAmount: 0, positionCount: 0, probability: [0.4, 0.3, 0.2, 0.1][i], isWinner: null,
      })),
    });
    render(<MarketCard market={market} />);

    expect(screen.getByText("Torres")).toBeInTheDocument();
    expect(screen.getByText("Nguyen")).toBeInTheDocument();
    expect(screen.queryByText("Write-in")).not.toBeInTheDocument();
  });
});
