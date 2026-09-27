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

  describe("search", () => {
    const search = async (text: string) => {
      const utils = renderWithClient(<HomePage />);
      await screen.findByText("BTC closes above $120k this Friday?"); // feed loaded
      await utils.user.type(screen.getByRole("searchbox", { name: "Search markets or communities" }), text);
      return utils;
    };
    const results = (name: string) => screen.findByRole("region", { name });

    it("finds any market the user can see, not just the ones on screen", async () => {
      await search("ints");

      const markets = await results("Matching markets");
      expect(within(markets).getByText("Total INTs thrown by our league this week > 5?")).toBeInTheDocument();
      expect(within(markets).queryByText("BTC closes above $120k this Friday?")).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Your friends are betting" })).not.toBeInTheDocument();
    });

    it("finds public communities you haven't joined, and their markets", async () => {
      await search("election");

      const communities = await results("Matching communities");
      const row = within(communities).getByRole("link", { name: /Election Junkies/ });
      expect(row).toHaveAttribute("href", "/communities/6");
      expect(within(row).getByText("Not joined")).toBeInTheDocument();
      expect(within(await results("Matching markets")).getByText("Who wins the mayoral primary?")).toBeInTheDocument();
    });

    it("finds your private communities, but never private ones you're not in", async () => {
      const { communities } = await import("@/lib/api/mock/db");
      communities.find((c) => c.id === 5)!.memberIds = [3, 4]; // Jordan leaves The Office Trivia Club
      communities.find((c) => c.id === 5)!.moderatorIds = [];
      await search("o");

      const found = await results("Matching communities");
      expect(within(found).getByRole("link", { name: /Crypto Degens Only/ })).toBeInTheDocument();
      expect(within(found).queryByText("Not joined", { selector: "a[href='/communities/3'] span" })).not.toBeInTheDocument();
      expect(within(found).queryByRole("link", { name: /The Office Trivia Club/ })).not.toBeInTheDocument();
      expect(within(await results("Matching markets")).queryByText(/that's what she said/)).not.toBeInTheDocument();
    });

    it("says when nothing matches, and clearing brings the feed back", async () => {
      const { user } = await search("zzzz");

      expect(await screen.findByText("Nothing matches “zzzz”. Try another word, or check the spelling.")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Clear search" }));
      expect(await screen.findByRole("heading", { name: "Your friends are betting" })).toBeInTheDocument();
      expect(screen.getByRole("searchbox")).toHaveValue("");
    });

    it("clears with Escape", async () => {
      const { user } = await search("crypto");
      await results("Matching communities");

      await user.keyboard("{Escape}");

      expect(await screen.findByRole("heading", { name: "Your friends are betting" })).toBeInTheDocument();
    });
  });
});
