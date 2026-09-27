// Invite links for people who aren't signed in, and their link previews.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getPublicInvite } from "@/lib/api/public-invite";
import { generateMetadata } from "./page";
import { SignedOutInvite } from "./signed-out-invite";

const metadataFor = (code: string) => generateMetadata({ params: Promise.resolve({ code }) } as PageProps<"/invite/[code]">);

describe("signed-out invite page", () => {
  it("shows what they're joining and lets them sign up or log in, coming back to the invite", async () => {
    render(<SignedOutInvite code="HUD1X7Q2P" result={await getPublicInvite("HUD1X7Q2P")} />);

    expect(screen.getByRole("heading", { name: "Fantasy Football Legends" })).toBeInTheDocument();
    expect(screen.getByText(/Private group · 24 members/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create an account to join" }))
      .toHaveAttribute("href", "/register?next=%2Finvite%2FHUD1X7Q2P");
    expect(screen.getByRole("link", { name: "I already have an account" }))
      .toHaveAttribute("href", "/login?next=%2Finvite%2FHUD1X7Q2P");
  });

  it("explains an invalid link", async () => {
    render(<SignedOutInvite code="BOGUS" result={await getPublicInvite("BOGUS")} />);

    expect(screen.getByRole("heading", { name: "That invite link isn't valid" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Create an account to join" })).not.toBeInTheDocument();
  });

  it("still invites them in when the group can't be looked up (API down)", () => {
    render(<SignedOutInvite code="HUD1X7Q2P" result={{ status: "unavailable" }} />);

    expect(screen.getByRole("heading", { name: "a group on called it." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create an account to join" }))
      .toHaveAttribute("href", "/register?next=%2Finvite%2FHUD1X7Q2P");
  });
});

describe("invite link preview", () => {
  it("names the group and its size in the title and description", async () => {
    const metadata = await metadataFor("HUD1X7Q2P");

    expect(metadata.title).toBe("Join Fantasy Football Legends on called it.");
    expect(metadata.description).toBe(
      "You're invited to a private group with 24 members. Make your predictions and prove you called it.");
    expect(metadata.openGraph).toMatchObject({ title: "Join Fantasy Football Legends on called it.", siteName: "called it." });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("falls back to a generic invitation for an unknown code", async () => {
    const metadata = await metadataFor("BOGUS");
    expect(metadata.title).toBe("You're invited to called it.");
  });
});
