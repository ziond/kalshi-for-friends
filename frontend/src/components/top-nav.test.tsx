import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { navigation } from "@/test/navigation";
import { renderWithClient } from "@/test/render";
import { TopNav } from "./top-nav";

describe("TopNav", () => {
  it("shows the balance, highlights the current tab and counts pending mod work", async () => {
    navigation.pathname = "/discover";
    renderWithClient(<TopNav />);

    expect(await screen.findByText("4,820 pts")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Discover" })).toHaveClass("bg-ink");
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveClass("bg-ink");

    const modTab = screen.getByRole("link", { name: /Mod Queue/ });
    expect(await within(modTab).findByText("1")).toBeInTheDocument();
  });

  it("opens the create menu", async () => {
    const { user } = renderWithClient(<TopNav />);

    await user.click(screen.getByRole("button", { name: "+ Create" }));

    expect(screen.getByRole("link", { name: "New community" })).toHaveAttribute("href", "/communities/new");
    expect(screen.getByRole("link", { name: "New market" })).toHaveAttribute("href", "/markets/new");
  });
});
