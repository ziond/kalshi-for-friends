import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { navigation } from "@/test/navigation";
import { renderWithClient } from "@/test/render";
import { BottomNav, TopNav } from "./top-nav";

describe("TopNav", () => {
  it("shows the balance, highlights the current tab and counts pending mod work", async () => {
    navigation.pathname = "/discover";
    renderWithClient(<TopNav />);

    expect(await screen.findByRole("button", { name: /Balance 4,820 pts/ })).toBeInTheDocument();
    const main = screen.getByRole("navigation", { name: "Main" });
    expect(within(main).getByRole("link", { name: "Discover" })).toHaveAttribute("aria-current", "page");
    expect(within(main).getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");

    const modTab = within(main).getByRole("link", { name: /Mod queue/ });
    expect(await within(modTab).findByText("1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Moderator queue, 1 pending" })).toHaveAttribute("href", "/mod-queue");
  });

  it("opens the create menu", async () => {
    const { user } = renderWithClient(<TopNav />);

    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByRole("link", { name: "New community" })).toHaveAttribute("href", "/communities/new");
    expect(screen.getByRole("link", { name: "New market" })).toHaveAttribute("href", "/markets/new");
  });
});

describe("BottomNav", () => {
  it("links the main sections and highlights the current one", () => {
    navigation.pathname = "/communities/3";
    renderWithClient(<BottomNav />);

    const links = within(screen.getByRole("navigation", { name: "Primary" })).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/", "/discover", "/markets/new", "/communities", "/profile"]);
    expect(screen.getByRole("link", { name: "Groups" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });
});
