// Server-side JWT verification for the Go backend's access tokens.
// Tokens are signed with EdDSA (Ed25519); we verify with the backend's public key.
// Used by src/proxy.ts — never import this into client components.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { importSPKI, jwtVerify } from "jose";

export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";

const ALGORITHM = "EdDSA";
const DEFAULT_KEY_PATH = "public.pem";

export interface AccessTokenClaims {
  userId: number;
  expiresAt: Date;
}

type PublicKey = Awaited<ReturnType<typeof importSPKI>>;
let cachedKey: Promise<PublicKey> | null = null;

/**
 * Loads the backend's public key once: JWT_PUBLIC_KEY (PEM text, "\n" escapes allowed)
 * wins over JWT_PUBLIC_KEY_PATH (default keys/public.pem, relative to frontend/).
 */
export function loadPublicKey(): Promise<PublicKey> {
  cachedKey ??= (async () => {
    const inline = process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, "\n");
    const pem = inline || (await readFile(path.resolve(process.cwd(), process.env.JWT_PUBLIC_KEY_PATH || DEFAULT_KEY_PATH), "utf8"));
    return importSPKI(pem, ALGORITHM);
  })();
  // Don't cache a failure (e.g. the key file hasn't been added yet).
  cachedKey.catch(() => (cachedKey = null));
  return cachedKey;
}

/** For tests: forget the cached key so a different one can be loaded. */
export function resetPublicKeyCache() {
  cachedKey = null;
}

/**
 * Returns the claims if the token is a valid, unexpired EdDSA-signed access token
 * carrying a user_id; otherwise null. Only EdDSA is accepted, so tokens signed
 * with "none" or a different algorithm are rejected.
 *
 * Throws if the public key can't be loaded — a misconfiguration, not a bad token.
 */
export async function verifyAccessToken(token: string | undefined, key?: PublicKey): Promise<AccessTokenClaims | null> {
  // Load the key even without a token, so a missing key is reported on the first request.
  const publicKey = key ?? (await loadPublicKey());
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, publicKey, { algorithms: [ALGORITHM] });
    const userId = Number(payload.user_id);
    if (!Number.isSafeInteger(userId) || userId <= 0 || payload.exp === undefined) return null;
    return { userId, expiresAt: new Date(payload.exp * 1000) };
  } catch {
    return null;
  }
}
