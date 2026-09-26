import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { createElement, type AnchorHTMLAttributes } from "react";
import { afterEach, beforeEach, vi } from "vitest";
import { resetMockDb } from "@/lib/api/mock/db";
import { navigation } from "./navigation";

// next/navigation needs the App Router runtime; tests drive it through ./navigation.
vi.mock("next/navigation", () => ({
  useRouter: () => navigation.router,
  usePathname: () => navigation.pathname,
  useParams: () => navigation.params,
  useSearchParams: () => new URLSearchParams(),
}));

// Render links as plain anchors so tests can assert on href.
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) =>
    createElement("a", { href, ...props }, children),
}));

beforeEach(() => {
  resetMockDb();
  navigation.reset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
