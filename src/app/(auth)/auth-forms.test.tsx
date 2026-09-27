import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { replacePage } from "@/lib/auth/navigate";
import { renderWithClient } from "@/test/render";
import { LoginForm } from "./login/login-form";
import { RegisterForm } from "./register/register-form";

vi.mock("@/lib/auth/navigate", () => ({ loadPage: vi.fn(), replacePage: vi.fn() }));

describe("Login", () => {
  it("does a full page load to the next path once logged in", async () => {
    const { user } = renderWithClient(<LoginForm nextPath="/markets/2" />);

    await user.type(screen.getByLabelText("Email"), "jordan@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(replacePage).toHaveBeenCalledWith("/markets/2"));
  });
});

describe("Register", () => {
  it("does a full page load to the home page once registered", async () => {
    const { user } = renderWithClient(<RegisterForm nextPath="/" />);

    await user.type(screen.getByLabelText("Username"), "newbie");
    await user.type(screen.getByLabelText("Email"), "newbie@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(replacePage).toHaveBeenCalledWith("/"));
  });
});
