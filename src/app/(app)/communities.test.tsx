// Community flows: Discover, the community page, creating one, and invite links.

import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usersApi } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { navigation } from "@/test/navigation";
import { renderWithClient } from "@/test/render";
import CommunitiesPage from "./communities/page";
import CreateCommunityPage from "./communities/new/page";
import CommunityPage from "./communities/[communityId]/page";
import DiscoverPage from "./discover/page";
import { InviteView } from "../invite/[code]/invite-view";

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

  it("shows how long the invite link lasts and lets the creator get a new one", async () => {
    navigation.params = { communityId: "1" };
    const { user } = renderWithClient(<CommunityPage />);
    await user.click(await screen.findByRole("button", { name: "Invite people" }));
    const dialog = screen.getByRole("dialog");

    expect(within(dialog).getByText(/Links work for 15 minutes/)).toBeInTheDocument();
    expect(within(dialog).getByRole("status")).toHaveTextContent(/^Expires in 1[45]:\d\d$/);

    await user.click(within(dialog).getByRole("button", { name: "Get a new link" }));

    await waitFor(() => expect(within(dialog).getByRole("textbox")).not.toHaveValue(`${window.location.origin}/invite/HUD1X7Q2P`));
    expect(within(dialog).getByRole("status")).toHaveTextContent(/New link ready\. The old one no longer works\./);
    const { mockRequest } = await import("@/lib/api/mock/handlers");
    await expect(mockRequest("GET", "/public/invites/HUD1X7Q2P", {}, undefined)).rejects.toMatchObject({ code: "INVALID_INVITE_CODE" });
  });

  it("marks an expired link, blocks copying it, and replaces it", async () => {
    const { communities } = await import("@/lib/api/mock/db");
    communities.find((c) => c.id === 1)!.inviteExpiresAt = new Date(Date.now() - 1000).toISOString();
    navigation.params = { communityId: "1" };
    const { user } = renderWithClient(<CommunityPage />);
    await user.click(await screen.findByRole("button", { name: "Invite people" }));
    const dialog = screen.getByRole("dialog");

    expect(within(dialog).getByRole("status")).toHaveTextContent("This link has expired.");
    expect(within(dialog).getByRole("button", { name: "Copy" })).toBeDisabled();
    expect(within(dialog).queryByRole("link", { name: /Preview what invitees see/ })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Get a new link" }));

    expect(await within(dialog).findByText(/^1[45]:\d\d$/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Copy" })).toBeEnabled();
  });

  it("doesn't let moderators replace the link, and tells them who can", async () => {
    const { communities } = await import("@/lib/api/mock/db");
    communities.find((c) => c.id === 5)!.inviteExpiresAt = new Date(Date.now() - 1000).toISOString(); // Jordan moderates
    navigation.params = { communityId: "5" };
    const { user } = renderWithClient(<CommunityPage />);
    await user.click(await screen.findByRole("button", { name: "Invite people" }));
    const dialog = screen.getByRole("dialog");

    expect(within(dialog).queryByRole("button", { name: "Get a new link" })).not.toBeInTheDocument();
    expect(within(dialog).getByText("Ask the community's creator for a new link.")).toBeInTheDocument();
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
    await user.type(screen.getByPlaceholderText("Add username…"), "sam k.{Enter}");
    expect(await screen.findByText("Sam K.")).toBeInTheDocument(); // found: shown as stored
    expect(screen.getByRole("button", { name: "Remove sam k." })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create community" }));

    await waitForPush("/communities/7");
    const { communities } = await import("@/lib/api/mock/db");
    expect(communities.at(-1)).toMatchObject({ name: "Board Game Night", visibility: "PUBLIC", moderatorIds: [1, 2] });
  });

  it("flags a username that doesn't exist and won't create until it's fixed", async () => {
    const { user } = renderWithClient(<CreateCommunityPage />);
    await user.type(screen.getByLabelText("Community name"), "Board Game Night");

    await user.type(screen.getByPlaceholderText("Add username…"), "Nobody Here{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("No user called “Nobody Here”. Check the spelling or remove them.");
    expect(screen.getByText("· not found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create community" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Remove Nobody Here" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create community" })).toBeEnabled();
  });

  it("explains instead of adding yourself or a duplicate", async () => {
    const { user, client } = renderWithClient(<CreateCommunityPage />);
    const input = screen.getByPlaceholderText("Add username…");
    await waitFor(() => expect(client.getQueryState(queryKeys.me.profile())?.status).toBe("success"));

    await user.type(input, "jordan{Enter}"); // the signed-in user
    expect(await screen.findByText("You're a moderator automatically.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove jordan" })).not.toBeInTheDocument();

    await user.type(input, "Sam K.{Enter}");
    await user.type(input, "SAM K.{Enter}");
    expect(screen.getByText("SAM K. is already on the list.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(1);
  });

  it("shows the server's rejection next to the moderators when the lookup can't run", async () => {
    vi.spyOn(usersApi, "lookup").mockRejectedValue(new Error("Route not found")); // e.g. an older API
    const { user } = renderWithClient(<CreateCommunityPage />);
    await user.type(screen.getByLabelText("Community name"), "Board Game Night");
    await user.type(screen.getByPlaceholderText("Add username…"), "Ghost{Enter}");

    const create = screen.getByRole("button", { name: "Create community" });
    await waitFor(() => expect(create).toBeEnabled()); // unverified: the server decides
    await user.click(create);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unknown username: Ghost");
    expect(navigation.router.push).not.toHaveBeenCalled();
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
    const { user } = renderWithClient(<InviteView code="HUD3X7Q2P" />);

    expect(await screen.findByRole("heading", { name: "Crypto Degens Only" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Accept & join" }));

    await waitForPush("/communities/3");
  });

  it("tells members they've already joined", async () => {
    renderWithClient(<InviteView code="HUD1X7Q2P" />);

    expect(await screen.findByRole("link", { name: /already a member/ })).toHaveAttribute("href", "/communities/1");
  });

  it("rejects an invalid code", async () => {
    renderWithClient(<InviteView code="BOGUS" />);

    expect(await screen.findByText("That invite link isn't valid")).toBeInTheDocument();
  });
});
