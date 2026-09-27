import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithClient } from "@/test/render";
import { AddPoints } from "./add-points";

async function openPopover() {
  const utils = renderWithClient(<AddPoints />);
  await screen.findByText("4,820 pts");
  await utils.user.click(screen.getByRole("button", { name: /add points/i }));
  return utils;
}

describe("AddPoints", () => {
  it("adds a quick amount and updates the balance", async () => {
    const { user } = await openPopover();

    await user.click(screen.getByRole("button", { name: "+1,000" }));

    expect(await screen.findByText("Added 1,000 pts.")).toBeInTheDocument();
    expect(screen.getByText("5,820 pts")).toBeInTheDocument();
  });

  it("adds a custom amount", async () => {
    const { user } = await openPopover();

    await user.type(screen.getByLabelText("Custom amount of points"), "250");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("5,070 pts")).toBeInTheDocument();
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
