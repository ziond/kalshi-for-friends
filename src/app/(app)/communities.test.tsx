// Community flows: Discover, the community page, creating one, and invite links.

import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { navigation } from "@/test/navigation";
import { renderWithClient } from "@/test/render";
import CommunitiesPage from "./communities/page";
import CreateCommunityPage from "./communities/new/page";
import CommunityPage from "./communities/[communityId]/page";
import DiscoverPage from "./discover/page";
import InvitePage from "./invite/[code]/page";

const waitForPush = (path: string) =>
  waitFor(() => expect(navigation.router.push).toHaveBeenCalledWith(path));

function card(name: string) {
  return screen.getByRole("link", { name }).closest("article") as HTMLElement;
}

describe("Discover", () => {
  it("lists public communities and joins one", async () => {
    const { user } = renderWithClient(<DiscoverPage />);
    await screen.findByRole("link", { name: "Election Junkies" });

    expect(within(card("Movie Box Office Bets")).getByRole("button", { name: "Joined ✓" })).toBeDisabled();

    await user.click(within(card("Election Junkies")).getByRole("button", { name: "Join" }));
    expect(await within(card("Election Junkies")).findByRole("button", { name: "Joined ✓" })).toBeInTheDocument();
  });
});

describe("Groups page", () => {
  it("lists the communities you belong to with your role", async () => {
    renderWithClient(<CommunitiesPage />);

    const own = await screen.findByRole("link", { name: /Fantasy Football Legends/ });
    expect(own).toHaveAttribute("href", "/communities/1");
    expect(within(own).getByText("Creator")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Election Junkies/ })).not.toBeInTheDocument(); // not joined
    expect(screen.getByRole("link", { name: "+ New community" })).toHaveAttribute("href", "/communities/new");
  });
});

describe("Community page", () => {
  it("shows a private community you created, with its markets and invite link", async () => {
    navigation.params = { communityId: "1" };
    const { user } = renderWithClient(<CommunityPage />);

    expect(await screen.findByRole("heading", { name: "Fantasy Football Legends" })).toBeInTheDocument();
    expect(screen.getByText("Private")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+ New market" })).toHaveAttribute("href", "/markets/new?community=1");
    expect(await screen.findByText("Will Jordan's team make the playoffs?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Invite people" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("textbox")).toHaveValue(`${window.location.origin}/invite/HUD1X7Q2P`);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lets non-members join a public community", async () => {
    navigation.params = { communityId: "6" };
    const { user } = renderWithClient(<CommunityPage />);

    await user.click(await screen.findByRole("button", { name: "Join community" }));

    expect(await screen.findByRole("link", { name: "+ New market" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join community" })).not.toBeInTheDocument();
  });
});

describe("Create community", () => {
  it("creates a public community with extra moderators", async () => {
    const { user } = renderWithClient(<CreateCommunityPage />);

    await user.type(screen.getByLabelText("Community name"), "Board Game Night");
    await user.type(screen.getByPlaceholderText("Add username…"), "Sam K.{Enter}");
    expect(screen.getByRole("button", { name: "Sam K. ×" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create community" }));

    await waitForPush("/communities/7");
    const { communities } = await import("@/lib/api/mock/db");
    expect(communities.at(-1)).toMatchObject({ name: "Board Game Night", visibility: "PUBLIC", moderatorIds: [1, 2] });
  });

  it("switches to private and hides the moderator picker", async () => {
    const { user } = renderWithClient(<CreateCommunityPage />);

    await user.click(screen.getByRole("button", { name: "Private — invite only" }));

    expect(screen.queryByPlaceholderText("Add username…")).not.toBeInTheDocument();
    expect(screen.getByText(/pick a moderator for each market/)).toBeInTheDocument();
  });
});

describe("Invite link", () => {
  it("joins a private community from an invite", async () => {
    const { communities } = await import("@/lib/api/mock/db");
    communities.find((c) => c.id === 3)!.memberIds = [5, 6]; // Jordan not a member yet
    communities.find((c) => c.id === 3)!.creatorId = 5;
    navigation.params = { code: "HUD3X7Q2P" };
    const { user } = renderWithClient(<InvitePage />);

    expect(await screen.findByRole("heading", { name: "Crypto Degens Only" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Accept & join" }));

    await waitForPush("/communities/3");
  });

  it("tells members they've already joined", async () => {
    navigation.params = { code: "HUD1X7Q2P" };
    renderWithClient(<InvitePage />);

    expect(await screen.findByRole("link", { name: /already a member/ })).toHaveAttribute("href", "/communities/1");
  });

  it("rejects an invalid code", async () => {
    navigation.params = { code: "BOGUS" };
    renderWithClient(<InvitePage />);

    expect(await screen.findByText("That invite link isn't valid")).toBeInTheDocument();
  });
});
