import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { navigation } from "@/test/navigation";
import { renderWithClient } from "@/test/render";
import MarketPage from "./page";

function renderMarket(id: number) {
  navigation.params = { marketId: String(id) };
  return renderWithClient(<MarketPage />);
}

describe("Market page", () => {
  it("shows the market, its odds, chart and info", async () => {
    renderMarket(1);

    expect(await screen.findByRole("heading", { name: "Will Jordan's team make the playoffs?" })).toBeInTheDocument();
    expect(screen.getByText("Fantasy Football Legends")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /probability/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /YES\s*58%/ })).toBeInTheDocument();
    expect(screen.getByText("Sam K.", { selector: "span" })).toBeInTheDocument();
    expect(await screen.findByText("Sam K. bet 150 pts on Yes")).toBeInTheDocument();
  });

  it("places a bet on the chosen outcome", async () => {
    const { user } = renderMarket(1);
    await screen.findByRole("heading", { name: /playoffs/ });

    await user.click(screen.getByRole("button", { name: /YES/ }));
    await user.type(screen.getByLabelText("Points to wager"), "100");
    await user.click(screen.getByRole("button", { name: "Place bet" }));

    expect(await screen.findByText("Bet placed — 100 pts on Yes.")).toBeInTheDocument();
    expect(screen.getByText("100 pts on Yes")).toBeInTheDocument(); // "Your stake" row
    expect(await screen.findByText("Jordan bet 100 pts on Yes")).toBeInTheDocument();
  });

  it("explains why a bet was rejected", async () => {
    const { user } = renderMarket(2); // Jordan already backs "Yes"
    await screen.findByRole("heading", { name: /BTC/ });

    await user.click(screen.getByRole("button", { name: /^NO/ }));
    await user.type(screen.getByLabelText("Points to wager"), "10");
    await user.click(screen.getByRole("button", { name: "Place bet" }));

    expect(await screen.findByText('You already bet on "Yes"')).toBeInTheDocument();
  });

  it("lets you pick an outcome in a multiple-choice market", async () => {
    const { user } = renderMarket(3);
    await screen.findByRole("heading", { name: /that's what she said/ });

    const michael = screen.getByRole("button", { name: /Michael/ });
    await user.click(michael);
    expect(michael).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Points to wager")).toHaveAttribute("placeholder", "Points on Michael");
  });

  it("hides betting and shows the moderator panel on an ended market you moderate", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user } = renderMarket(9);

    const panel = (await screen.findByText(/you're the moderator/)).parentElement!;
    expect(screen.queryByRole("button", { name: "Place bet" })).not.toBeInTheDocument();

    await user.click(within(panel).getByRole("button", { name: "Validate: Priya N." }));

    expect(await screen.findByText("Resolved: Priya N. — payouts settled.")).toBeInTheDocument();
    expect(screen.queryByText(/you're the moderator/)).not.toBeInTheDocument();
  });

  it("nullifies a market and refunds bets", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user } = renderMarket(9);

    await user.click(await screen.findByRole("button", { name: "Nullify market" }));

    expect(await screen.findByText("This market was nullified — all bets refunded.")).toBeInTheDocument();
  });

  it("does nothing if the moderator cancels the confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { user } = renderMarket(9);

    await user.click(await screen.findByRole("button", { name: "Nullify market" }));

    expect(screen.getByText(/you're the moderator/)).toBeInTheDocument();
  });

  it("shows an error for a private market you can't see", async () => {
    const { communities, markets } = await import("@/lib/api/mock/db");
    markets.push({ ...markets[0], id: 99, communityId: 6 });
    communities.find((c) => c.id === 6)!.visibility = "PRIVATE";

    renderMarket(99);
    expect(await screen.findByText("This community is invite-only")).toBeInTheDocument();
  });
});
