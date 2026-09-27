// @vitest-environment node
import { SignJWT, exportSPKI, generateKeyPair, type CryptoKey } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadPublicKey, resetPublicKeyCache, verifyAccessToken } from "./jwt";

let privateKey: CryptoKey;
let publicPem: string;

beforeAll(async () => {
  const pair = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  privateKey = pair.privateKey;
  publicPem = await exportSPKI(pair.publicKey);
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetPublicKeyCache();
});

function sign(claims: Record<string, unknown>, { expiresIn = "15m" as string | number, key = privateKey } = {}) {
  return new SignJWT(claims).setProtectedHeader({ alg: "EdDSA" }).setIssuedAt().setExpirationTime(expiresIn).sign(key);
}

describe("verifyAccessToken", () => {
  it("accepts a valid EdDSA token and returns the user id", async () => {
    vi.stubEnv("JWT_PUBLIC_KEY", publicPem.replace(/\n/g, "\\n"));
    const claims = await verifyAccessToken(await sign({ user_id: 42 }));
    expect(claims?.userId).toBe(42);
    expect(claims?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("accepts a numeric-string user_id", async () => {
    vi.stubEnv("JWT_PUBLIC_KEY", publicPem);
    expect((await verifyAccessToken(await sign({ user_id: "7" })))?.userId).toBe(7);
  });

  it.each([
    ["missing", undefined],
    ["not a JWT", "abc.def.ghi"],
  ])("rejects a %s token", async (_, token) => {
    vi.stubEnv("JWT_PUBLIC_KEY", publicPem);
    expect(await verifyAccessToken(token)).toBeNull();
  });

  it("rejects an expired token", async () => {
    vi.stubEnv("JWT_PUBLIC_KEY", publicPem);
    const token = await sign({ user_id: 1 }, { expiresIn: Math.floor(Date.now() / 1000) - 60 });
    expect(await verifyAccessToken(token)).toBeNull();
  });

  it("rejects a token signed with a different key", async () => {
    vi.stubEnv("JWT_PUBLIC_KEY", publicPem);
    const other = await generateKeyPair("EdDSA", { crv: "Ed25519" });
    expect(await verifyAccessToken(await sign({ user_id: 1 }, { key: other.privateKey }))).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    vi.stubEnv("JWT_PUBLIC_KEY", publicPem);
    const [header, , signature] = (await sign({ user_id: 1 })).split(".");
    const forged = Buffer.from(JSON.stringify({ user_id: 2, exp: 9_999_999_999 })).toString("base64url");
    expect(await verifyAccessToken(`${header}.${forged}.${signature}`)).toBeNull();
  });

  it("rejects unsigned (alg: none) tokens", async () => {
    vi.stubEnv("JWT_PUBLIC_KEY", publicPem);
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = `${b64({ alg: "none", typ: "JWT" })}.${b64({ user_id: 1, exp: 9_999_999_999 })}.`;
    expect(await verifyAccessToken(unsigned)).toBeNull();
  });

  it.each([
    ["no user_id", {}],
    ["a zero user_id", { user_id: 0 }],
    ["a non-numeric user_id", { user_id: "abc" }],
  ])("rejects a token with %s", async (_, claims) => {
    vi.stubEnv("JWT_PUBLIC_KEY", publicPem);
    expect(await verifyAccessToken(await sign(claims))).toBeNull();
  });

  it("throws, rather than rejecting the token, when the key can't be loaded", async () => {
    vi.stubEnv("JWT_PUBLIC_KEY", "");
    vi.stubEnv("JWT_PUBLIC_KEY_PATH", "keys/does-not-exist.pem");
    await expect(verifyAccessToken("anything")).rejects.toThrow();
    // A failed load isn't cached: fixing the config works without a restart.
    vi.stubEnv("JWT_PUBLIC_KEY", publicPem);
    await expect(loadPublicKey()).resolves.toBeDefined();
  });
});
