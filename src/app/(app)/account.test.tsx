// Mod Queue, create market and profile screens.

import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { markets } from "@/lib/api/mock/db";
import { navigation } from "@/test/navigation";
import { renderWithClient } from "@/test/render";
import { CreateMarketForm } from "./markets/new/create-market-form";
import ModQueuePage from "./mod-queue/page";
import ProfilePage from "./profile/page";

describe("Mod Queue", () => {
  it("lists pending and active markets and resolves one", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user } = renderWithClient(<ModQueuePage />);

    const pending = await screen.findByRole("region", { name: "Needs resolution" });
    expect(await within(pending).findByRole("link", { name: "Trivia champion crowned tonight" })).toBeInTheDocument();

    await user.click(within(pending).getByRole("button", { name: "Sam K." }));

    expect(await within(pending).findByText("All caught up.")).toBeInTheDocument();
    expect(within(pending).getByRole("link", { name: /Back to your communities/ })).toHaveAttribute("href", "/communities");
    expect(markets.find((m) => m.id === 9)!.status).toBe("RESOLVED");

    await user.click(screen.getByRole("button", { name: "Active markets" }));
    const active = screen.getByRole("region", { name: "Active markets" });
    expect(within(active).getByText("Who says 'that's what she said' first tonight?")).toBeInTheDocument();
  });
});

describe("Create market", () => {
  const tomorrow = () => {
    const d = new Date(Date.now() + 86_400_000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16); // datetime-local format
  };

  it("creates a multiple-choice market in a private community with a chosen moderator", async () => {
    const { user } = renderWithClient(<CreateMarketForm initialCommunityId={1} />);

    const moderator = await screen.findByLabelText(/Choose a moderator/);
    await waitFor(() => expect(within(moderator).getAllByRole("option").length).toBeGreaterThan(1));

    await user.type(screen.getByLabelText("Market question"), "Who scores first?");
    await user.click(screen.getByRole("button", { name: "Multiple outcomes" }));
    await user.type(screen.getByLabelText("Outcome 1"), "Priya");
    await user.type(screen.getByLabelText("Outcome 2"), "Sam");
    await user.click(screen.getByRole("button", { name: "Remove outcome 3" }));
    await user.selectOptions(moderator, "Sam K.");
    await user.type(screen.getByLabelText("Closes"), tomorrow());
    await user.click(screen.getByRole("button", { name: "Create market" }));

    await waitFor(() => expect(navigation.router.push).toHaveBeenCalledWith("/markets/11"));
    expect(markets.at(-1)).toMatchObject({
      title: "Who scores first?",
      communityId: 1,
      moderatorId: 2,
      options: [expect.objectContaining({ text: "Priya" }), expect.objectContaining({ text: "Sam" })],
    });
  });

  it("uses the community's moderators for public communities", async () => {
    renderWithClient(<CreateMarketForm initialCommunityId={2} />);

    expect(await screen.findByText("Priya N.", { selector: "strong" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Choose a moderator/)).not.toBeInTheDocument();
  });

  it("shows validation errors from the API", async () => {
    const { user } = renderWithClient(<CreateMarketForm initialCommunityId={1} />);
    await screen.findByLabelText(/Choose a moderator/);

    await user.type(screen.getByLabelText("Market question"), "Who?");
    await user.click(screen.getByRole("button", { name: "Multiple outcomes" }));
    await user.type(screen.getByLabelText("Outcome 1"), "Only one");
    await user.type(screen.getByLabelText("Closes"), tomorrow());
    await user.click(screen.getByRole("button", { name: "Create market" }));

    expect(await screen.findByText("Add 2–10 outcomes")).toBeInTheDocument();
    expect(navigation.router.push).not.toHaveBeenCalled();
  });
});

describe("Profile", () => {
  it("shows communities with roles, open positions and bet history", async () => {
    renderWithClient(<ProfilePage />);

    expect(await screen.findByRole("heading", { name: "Jordan" })).toBeInTheDocument();

    const communities = screen.getByRole("heading", { name: "Your communities" }).closest("section")!;
    expect(within(await within(communities).findByRole("link", { name: /Fantasy Football Legends/ })).getByText("Creator")).toBeInTheDocument();
    expect(within(within(communities).getByRole("link", { name: /Office Trivia/ })).getByText("Moderator")).toBeInTheDocument();

    const open = screen.getByRole("heading", { name: "Open positions" }).closest("section")!;
    expect(await within(open).findByText("Yes · 200 pts")).toBeInTheDocument();

    const history = screen.getByRole("heading", { name: "Bet history" }).closest("section")!;
    expect(await within(history).findAllByText(/Awaiting resolution/)).toHaveLength(2);
  });

  it("logs out and goes to the login page", async () => {
    const { user } = renderWithClient(<ProfilePage />);

    await user.click(screen.getByRole("button", { name: "Log out" }));

    await waitFor(() => expect(navigation.router.push).toHaveBeenCalledWith("/login"));
  });
});
