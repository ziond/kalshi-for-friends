import { vi } from "vitest";

/** Fake App Router state, reset before every test (see setup.ts). */
export const navigation = {
  pathname: "/",
  params: {} as Record<string, string>,
  router: createRouter(),
  reset() {
    this.pathname = "/";
    this.params = {};
    this.router = createRouter();
  },
};

function createRouter() {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  };
}
