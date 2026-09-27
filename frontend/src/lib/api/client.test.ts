// Real-backend mode of the API client: cookies, 401 → refresh → retry, and error mapping.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const unauthorized = () => json(401, { error: { code: "UNAUTHORIZED", message: "Token expired" } });

const assign = vi.fn();
let fetchMock: ReturnType<typeof vi.fn>;

async function loadClient() {
  vi.resetModules();
  return import("./client");
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_MOCK", "false");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  assign.mockReset();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { pathname: "/markets/2", search: "?tab=1", assign },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("api client (real backend)", () => {
  it("sends cookies and JSON to /api/v1", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    const { api } = await loadClient();

    await api.post("/markets/2/positions", { optionId: 3, amount: 10 });

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/markets/2/positions", expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ optionId: 3, amount: 10 }),
    }));
  });

  it("refreshes tokens after a 401 and retries the request once", async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(new Response(null, { status: 204 })) // refresh
      .mockResolvedValueOnce(json(200, { username: "Jordan" }));
    const { api } = await loadClient();

    await expect(api.get("/me")).resolves.toEqual({ username: "Jordan" });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/v1/me", "/api/v1/auth/refresh", "/api/v1/me"]);
    expect(assign).not.toHaveBeenCalled();
  });

  it("shares one refresh between simultaneous 401s", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/v1/auth/refresh" ? new Response(null, { status: 204 }) : unauthorized());
    const { api } = await loadClient();

    await Promise.allSettled([api.get("/me"), api.get("/me/wallet"), api.get("/communities")]);

    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/v1/auth/refresh")).toHaveLength(1);
  });

  it("sends the user to login when the refresh fails, keeping their place", async () => {
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(unauthorized());
    const { api, ApiError } = await loadClient();

    await expect(api.get("/me")).rejects.toBeInstanceOf(ApiError);
    expect(assign).toHaveBeenCalledWith("/login?next=%2Fmarkets%2F2%3Ftab%3D1");
  });

  it("doesn't try to refresh when login itself returns 401", async () => {
    fetchMock.mockResolvedValueOnce(json(401, { error: { code: "UNAUTHORIZED", message: "Wrong email or password" } }));
    const { api } = await loadClient();

    await expect(api.post("/auth/login", {})).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Wrong email or password" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
  });

  it("maps error bodies to ApiError with field details", async () => {
    fetchMock.mockResolvedValueOnce(json(400, {
      error: { code: "VALIDATION_ERROR", message: "Check the fields", fields: { title: "Required" } },
    }));
    const { api } = await loadClient();

    await expect(api.post("/communities/1/markets", {})).rejects.toMatchObject({
      status: 400, code: "VALIDATION_ERROR", fields: { title: "Required" },
    });
  });
});
