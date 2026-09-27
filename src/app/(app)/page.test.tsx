import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithClient } from "@/test/render";
import HomePage from "./page";

function section(title: string) {
  return screen.getByRole("heading", { name: title }).closest("section")!;
}

describe("Home page", () => {
  it("greets the user and lists their communities", async () => {
    renderWithClient(<HomePage />);

    expect(screen.getByRole("heading", { name: "What's the word?" })).toBeInTheDocument();
    expect(await screen.findByText(/, Jordan/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Create a market/ })).toHaveAttribute("href", "/markets/new");
    const sidebar = screen.getByRole("complementary");
    expect(await within(sidebar).findByRole("link", { name: /Crypto Degens Only/ })).toHaveAttribute("href", "/communities/3");
    expect(within(sidebar).queryByRole("link", { name: /Election Junkies/ })).not.toBeInTheDocument(); // not joined
  });

  it("shows trending private and public markets", async () => {
    renderWithClient(<HomePage />);

    const priv = section("Your friends are betting");
    expect(await within(priv).findByText("BTC closes above $120k this Friday?")).toBeInTheDocument();
    expect(within(priv).queryByText("Who wins the mayoral primary?")).not.toBeInTheDocument();

    const pub = section("Trending in public communities");
    expect(await within(pub).findByText("Who wins the mayoral primary?")).toBeInTheDocument();
  });

  it("filters markets by search", async () => {
    const { user } = renderWithClient(<HomePage />);
    await screen.findByText("BTC closes above $120k this Friday?");

    await user.type(screen.getByPlaceholderText("Search markets or communities"), "snow");

    expect(screen.queryByText("BTC closes above $120k this Friday?")).not.toBeInTheDocument();
    expect(screen.getByText("Will it snow in NYC before Nov 1?")).toBeInTheDocument();
    expect(within(section("Your friends are betting")).getByText("No markets match your search.")).toBeInTheDocument();
  });
});
