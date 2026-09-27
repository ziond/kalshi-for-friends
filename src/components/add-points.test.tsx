import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithClient } from "@/test/render";
import { AddPoints } from "./add-points";

const balance = (pts: string) => screen.findByRole("button", { name: `Balance ${pts} pts — add points` });

async function openPopover() {
  const utils = renderWithClient(<AddPoints />);
  await balance("4,820");
  await utils.user.click(screen.getByRole("button", { name: /add points/i }));
  return utils;
}

describe("AddPoints", () => {
  it("adds a quick amount and updates the balance", async () => {
    const { user } = await openPopover();

    await user.click(screen.getByRole("button", { name: "+1,000" }));

    expect(await screen.findByText("Added 1,000 pts.")).toBeInTheDocument();
    expect(await balance("5,820")).toHaveTextContent("5,820");
  });

  it("adds a custom amount", async () => {
    const { user } = await openPopover();

    await user.type(screen.getByLabelText("Custom amount of points"), "250");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await balance("5,070")).toBeInTheDocument();
  });

  it("disables Add for invalid amounts", async () => {
    const { user } = await openPopover();
    const input = screen.getByLabelText("Custom amount of points");
    const add = screen.getByRole("button", { name: "Add" });

    expect(add).toBeDisabled();
    await user.type(input, "0");
    expect(add).toBeDisabled();
    await user.clear(input);
    await user.type(input, "2000000");
    expect(add).toBeDisabled();
  });
});
