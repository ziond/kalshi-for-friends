import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { dailyBonus } from "@/lib/api/mock/db";
import { renderWithClient } from "@/test/render";
import { DailyBonusCard, PointsPill } from "./points-pill";

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

async function openPill() {
  const utils = renderWithClient(<PointsPill />);
  const pill = await screen.findByRole("button", { name: /^Balance 4,820 pts/ });
  await utils.user.click(pill);
  return { ...utils, pill };
}

describe("PointsPill", () => {
  it("lights up when the daily points are ready and claims them", async () => {
    const { user, pill } = await openPill(); // the demo user's bonus is already claimable
    expect(pill).toHaveAccessibleName("Balance 4,820 pts — daily 1,000 points ready to claim");

    await user.click(screen.getByRole("button", { name: "Claim 1,000 pts" }));

    expect(await screen.findByText("+1,000 pts added.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Balance 5,820 pts" })).toBeInTheDocument(); // no longer "ready"
    expect(screen.getByText(/^2[34]:\d\d:\d\d$/)).toBeInTheDocument(); // countdown to the next one
    expect(screen.queryByRole("button", { name: "Claim 1,000 pts" })).not.toBeInTheDocument();
  });

  it("shows a countdown instead of a claim button before the next drop", async () => {
    dailyBonus.nextAt = inHours(5);
    const { pill } = await openPill();

    expect(pill).toHaveAccessibleName("Balance 4,820 pts");
    expect(screen.getByText(/^[45]:\d\d:\d\d$/)).toBeInTheDocument();
    expect(screen.getByText(/They don't stack/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Claim 1,000 pts" })).not.toBeInTheDocument();
  });

  it("hides the daily bonus if the API doesn't report it yet", async () => {
    const { client } = renderWithClient(<PointsPill />);
    const pill = await screen.findByRole("button", { name: /^Balance 4,820 pts/ });
    client.setQueryData(["me", "profile"], (me: object) => ({ ...me, nextDailyBonusAt: undefined }));
    await userEvent.click(pill);

    expect(await screen.findByText("Your points")).toBeInTheDocument();
    expect(screen.queryByText("Daily points")).not.toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it("no longer offers free top-ups", async () => {
    await openPill();
    expect(screen.queryByLabelText(/custom amount/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+1,000" })).not.toBeInTheDocument();
  });
});

describe("DailyBonusCard", () => {
  it("appears on Home while the points are waiting and confirms the claim", async () => {
    const { user } = renderWithClient(<DailyBonusCard />);
    const card = await screen.findByRole("region", { name: "Daily points" });
    expect(within(card).getByText("Your daily 1,000 points are here")).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: "Claim 1,000 pts" }));

    expect(await screen.findByText("+1,000 pts added.")).toBeInTheDocument();
    expect(screen.getByText(/Your next drop is in 2[34]:/)).toBeInTheDocument();
  });

  it("stays hidden when nothing is waiting", async () => {
    dailyBonus.nextAt = inHours(3);
    renderWithClient(<><PointsPill /><DailyBonusCard /></>);
    await screen.findByRole("button", { name: "Balance 4,820 pts" });

    expect(screen.queryByRole("region", { name: "Daily points" })).not.toBeInTheDocument();
  });
});
