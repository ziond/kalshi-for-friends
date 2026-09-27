// Server-side lookup of an invite's public details (link previews and the signed-out invite
// page). Calls the backend directly: there's no browser, so no /api/v1 rewrite and no cookies.

import { cache } from "react";
import type { PublicInvite } from "@/types";
import { ApiError } from "./errors";
import { mockRequest } from "./mock/handlers";
import { TUNNEL_HEADERS } from "./tunnel";

const USE_MOCK = process.env.NEXT_PUBLIC_API_MOCK !== "false";

/**
 * "invalid": the API says the code doesn't exist. "unavailable": we couldn't ask (API down, or
 * an older backend without the endpoint), so show a generic invitation rather than an error.
 */
export type PublicInviteResult =
  | { status: "ok"; invite: PublicInvite }
  | { status: "invalid" }
  | { status: "unavailable" };

/** Cached per request, so the page, its metadata and its image share one lookup. */
export const getPublicInvite = cache(async (code: string): Promise<PublicInviteResult> => {
  const path = `/public/invites/${encodeURIComponent(code)}`;
  try {
    if (USE_MOCK) return { status: "ok", invite: await mockRequest<PublicInvite>("GET", path, {}, undefined) };
    const apiUrl = process.env.API_URL ?? "http://localhost:8080";
    const res = await fetch(`${apiUrl}/api/v1${path}`, {
      headers: TUNNEL_HEADERS,
      // Member counts can lag a few minutes in previews; chat apps cache them anyway.
      next: { revalidate: 300 },
    });
    if (res.ok && (res.headers.get("content-type") ?? "").includes("application/json")) {
      return { status: "ok", invite: (await res.json()) as PublicInvite };
    }
    const body = res.status === 404 ? await res.json().catch(() => null) : null;
    return body?.error?.code === "INVALID_INVITE_CODE" ? { status: "invalid" } : { status: "unavailable" };
  } catch (error) {
    return error instanceof ApiError && error.code === "INVALID_INVITE_CODE"
      ? { status: "invalid" }
      : { status: "unavailable" };
  }
});

/** The invite if we have it, else null (invalid or unavailable). */
export const inviteOf = (result: PublicInviteResult) => (result.status === "ok" ? result.invite : null);
