// @vitest-environment node
import { SignJWT, exportSPKI, generateKeyPair, type CryptoKey } from "jose";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetPublicKeyCache } from "@/lib/auth/jwt";
import { safeNextPath } from "@/lib/auth/redirect";
import { config, proxy } from "./proxy";

let privateKey: CryptoKey;
let publicPem: string;

beforeAll(async () => {
  const pair = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  privateKey = pair.privateKey;
  publicPem = await exportSPKI(pair.publicKey);
});

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_MOCK", "false");
  vi.stubEnv("JWT_PUBLIC_KEY", publicPem);
  vi.stubEnv("API_URL", "http://backend.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetPublicKeyCache();
});

const accessToken = (expiresIn: string | number = "15m") =>
  new SignJWT({ user_id: 1 }).setProtectedHeader({ alg: "EdDSA" }).setExpirationTime(expiresIn).sign(privateKey);

function request(path: string, cookies: Record<string, string> = {}) {
  const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  return new NextRequest(new URL(path, "http://localhost:3000"), { headers: cookie ? { cookie } : {} });
}

const redirectTarget = (res: Response) => {
  const location = res.headers.get("location");
  return location ? new URL(location).pathname + new URL(location).search : null;
};

describe("proxy route guard", () => {
  it("lets requests with a valid access token through", async () => {
    const res = await proxy(request("/markets/2", { access_token: await accessToken() }));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects signed-out visitors to login, remembering where they were going", async () => {
    const res = await proxy(request("/markets/2?tab=activity"));
    expect(res.status).toBe(307);
    expect(redirectTarget(res)).toBe("/login?next=%2Fmarkets%2F2%3Ftab%3Dactivity");
  });

  it("sends invite links through login too", async () => {
    const res = await proxy(request("/invite/HUD1X7Q2P"));
    expect(redirectTarget(res)).toBe("/login?next=%2Finvite%2FHUD1X7Q2P");
  });

  it("refreshes an expired access token and passes the new cookies to the browser", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 204,
        headers: [
          ["set-cookie", "access_token=new-access; Path=/; HttpOnly"],
          ["set-cookie", "refresh_token=new-refresh; Path=/; HttpOnly"],
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const expired = await accessToken(Math.floor(Date.now() / 1000) - 60);
    const res = await proxy(request("/", { access_token: expired, refresh_token: "old-refresh" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend.test/api/v1/auth/refresh",
      expect.objectContaining({ method: "POST", headers: { cookie: expect.stringContaining("refresh_token=old-refresh") } }),
    );
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.getSetCookie()).toEqual([
      "access_token=new-access; Path=/; HttpOnly",
      "refresh_token=new-refresh; Path=/; HttpOnly",
    ]);
  });

  it("redirects to login when the refresh is rejected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    const res = await proxy(request("/profile", { refresh_token: "revoked" }));
    expect(redirectTarget(res)).toBe("/login?next=%2Fprofile");
  });

  it("redirects to login when the backend is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const res = await proxy(request("/profile", { refresh_token: "whatever" }));
    expect(redirectTarget(res)).toBe("/login?next=%2Fprofile");
  });

  it("doesn't trust a forged token", async () => {
    const res = await proxy(request("/", { access_token: "eyJhbGciOiJub25lIn0.eyJ1c2VyX2lkIjoxfQ." }));
    expect(redirectTarget(res)).toBe("/login?next=%2F");
  });

  it("shows login/register to visitors but bounces signed-in users onward", async () => {
    expect((await proxy(request("/login"))).headers.get("x-middleware-next")).toBe("1");
    expect((await proxy(request("/register"))).headers.get("x-middleware-next")).toBe("1");

    const token = await accessToken();
    expect(redirectTarget(await proxy(request("/login", { access_token: token })))).toBe("/");
    expect(redirectTarget(await proxy(request("/login?next=/discover", { access_token: token })))).toBe("/discover");
  });

  it("fails loudly (500) on protected pages if the public key is missing", async () => {
    vi.stubEnv("JWT_PUBLIC_KEY", "");
    vi.stubEnv("JWT_PUBLIC_KEY_PATH", "keys/does-not-exist.pem");
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await proxy(request("/"))).status).toBe(500);
    expect((await proxy(request("/login"))).headers.get("x-middleware-next")).toBe("1");
  });

  it("does nothing in mock mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_MOCK", "true");
    expect((await proxy(request("/profile"))).headers.get("x-middleware-next")).toBe("1");
  });
});

describe("proxy matcher", () => {
  const pattern = new RegExp(`^${config.matcher[0].replace("/((?!", "/(?!").replace(").*)", ").*")}$`);
  const matches = (path: string) => pattern.test(path);

  it("covers pages", () => {
    for (const path of ["/", "/markets/2", "/invite/ABC", "/login"]) expect(matches(path)).toBe(true);
  });

  it("skips the API proxy, Next internals and static files", () => {
    for (const path of ["/api/v1/me", "/_next/static/chunk.js", "/_next/image", "/favicon.ico", "/logo.svg"]) {
      expect(matches(path)).toBe(false);
    }
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/discover", "/discover"],
    ["/markets/2?x=1", "/markets/2?x=1"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    [null, "/"],
  ])("%s -> %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});
