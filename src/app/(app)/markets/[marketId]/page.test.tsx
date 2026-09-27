import { act, screen, within } from "@testing-library/react";
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
    await user.click(screen.getByRole("button", { name: "Stake 100 points" }));
    expect(screen.getByText("Stake 100 pts on Yes?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm stake" }));

    expect(await screen.findByText("Staked 100 pts on Yes.")).toBeInTheDocument();
    expect(screen.getByText("100 pts on Yes")).toBeInTheDocument(); // "Your stake" row
    expect(await screen.findByText("Jordan bet 100 pts on Yes")).toBeInTheDocument();
  });

  it("explains why a bet was rejected", async () => {
    const { user } = renderMarket(2); // Jordan already backs "Yes"
    await screen.findByRole("heading", { name: /BTC/ });

    await user.click(screen.getByRole("button", { name: /^NO/ }));
    await user.type(screen.getByLabelText("Points to wager"), "10");
    await user.click(screen.getByRole("button", { name: "Stake 10 points" }));
    await user.click(screen.getByRole("button", { name: "Confirm stake" }));

    expect(await screen.findByText('You already bet on "Yes"')).toBeInTheDocument();
  });

  it("lets you pick an outcome in a multiple-choice market", async () => {
    const { user } = renderMarket(3);
    await screen.findByRole("heading", { name: /that's what she said/ });

    const michael = screen.getByRole("button", { name: /Michael/ });
    await user.click(michael);
    expect(michael).toHaveAttribute("aria-pressed", "true");
    expect(within(michael).getByText(/Your selected outcome/)).toBeInTheDocument();
  });

  it("builds a stake with quick adds and MAX, and blocks stakes over the balance", async () => {
    const { user } = renderMarket(1);
    await screen.findByRole("heading", { name: /playoffs/ });
    expect(screen.getByRole("button", { name: "Pick an outcome first" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /YES/ }));
    await user.click(screen.getByRole("button", { name: "+50" }));
    await user.click(screen.getByRole("button", { name: "+25" }));
    expect(screen.getByLabelText("Points to wager")).toHaveValue(75);

    await screen.findByText("4,820 pts"); // balance loaded
    await user.click(screen.getByRole("button", { name: "MAX" }));
    expect(screen.getByLabelText("Points to wager")).toHaveValue(4820);
    expect(screen.getByRole("button", { name: /Stake 4,820 points/ })).toBeEnabled();

    await user.clear(screen.getByLabelText("Points to wager"));
    await user.type(screen.getByLabelText("Points to wager"), "5000");
    expect(screen.getByText("That's more than your balance.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stake 5,000 points" })).toBeDisabled();
  });

  it("lets you back out of the confirmation", async () => {
    const { user } = renderMarket(1);
    await screen.findByRole("heading", { name: /playoffs/ });

    await user.click(screen.getByRole("button", { name: /YES/ }));
    await user.type(screen.getByLabelText("Points to wager"), "40");
    await user.click(screen.getByRole("button", { name: "Stake 40 points" }));
    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.queryByRole("button", { name: "Confirm stake" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stake 40 points" })).toBeInTheDocument();
  });

  it("switches the chart range", async () => {
    const { user } = renderMarket(1);
    await screen.findByRole("heading", { name: /playoffs/ });

    const range = screen.getByRole("group", { name: "Chart range" });
    expect(within(range).getByRole("button", { name: "ALL" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(range).getByRole("button", { name: "1H" }));
    expect(within(range).getByRole("button", { name: "1H" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1h ago")).toBeInTheDocument();
  });

  it("celebrates a winning prediction once it resolves", async () => {
    const { markets, positions, ME } = await import("@/lib/api/mock/db");
    const priya = markets.find((m) => m.id === 9)!.options.find((o) => o.text === "Priya N.")!;
    priya.totalAmount += 100;
    positions.push({
      id: 999, marketId: 9, optionId: priya.id, userId: ME, amount: 100,
      createdAt: new Date().toISOString(), result: "PENDING", payout: null,
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = renderMarket(9);

    const panel = (await screen.findByText(/you're the moderator/)).parentElement!;
    await user.click(within(panel).getByRole("button", { name: "Validate: Priya N." }));
    await screen.findByText(/You picked Priya N\./);
    expect(screen.queryByRole("region", { name: "You called it" })).not.toBeInTheDocument(); // not until paid out

    await act(() => vi.advanceTimersByTimeAsync(5 * 60_000 + 1000));

    const card = await screen.findByRole("region", { name: "You called it" });
    expect(within(card).getByText("You literally called it.")).toBeInTheDocument();
    expect(within(card).getByText(/^\+[\d,]+ points$/)).toBeInTheDocument();
    expect(within(card).getByText("Winner")).toBeInTheDocument();
    expect(screen.getByText("Resolved: Priya N. — payouts settled.")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("hides betting and shows the moderator panel on an ended market you moderate", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user } = renderMarket(9);

    const panel = (await screen.findByText(/you're the moderator/)).parentElement!;
    expect(screen.queryByLabelText("Points to wager")).not.toBeInTheDocument();

    await user.click(within(panel).getByRole("button", { name: "Validate: Priya N." }));

    // Grace period: nothing paid yet, the moderator can still nullify.
    expect(await screen.findByText(/You picked Priya N\. — payouts go out in [45]:\d\d/)).toBeInTheDocument();
    expect(screen.getByText(/Picked as winner · payout pending/)).toBeInTheDocument();
    expect(screen.getAllByText("Paying out").length).toBeGreaterThan(0); // status pill and time line
    expect(screen.queryByText(/payouts settled/)).not.toBeInTheDocument();
    // The pick is final: no way to switch outcomes, only to nullify.
    expect(screen.queryByRole("button", { name: /^Validate:/ })).not.toBeInTheDocument();
    expect(screen.getByText(/The pick can't be changed/)).toBeInTheDocument();
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("You can't switch to another outcome afterwards"));

    await user.click(screen.getByRole("button", { name: "Nullify market" }));

    expect(await screen.findByText("This market was nullified — all bets refunded.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nullify market" })).not.toBeInTheDocument();
  });

  it("shows everyone else the pending payout with a countdown", async () => {
    const { markets } = await import("@/lib/api/mock/db");
    const row = markets.find((m) => m.id === 2)!; // moderated by someone else
    const now = Date.now();
    row.status = "PAYOUT_PENDING";
    row.settlement = {
      winningOptionId: row.options[0].id, resolvedById: row.moderatorId, resolvedAt: new Date(now).toISOString(),
      payoutAt: new Date(now + 5 * 60_000).toISOString(), paidOutAt: null, notes: null,
    };
    renderMarket(2);

    expect(await screen.findByText("Yes picked as the winner.")).toBeInTheDocument();
    expect(screen.getByText(/Payouts go out in [45]:\d\d — the moderator can still nullify until then\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nullify market" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Points to wager")).not.toBeInTheDocument();
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
