// Route guard (Next 16's replacement for middleware). Runs before every page request.
//
// - Valid access_token cookie (EdDSA JWT, verified with the backend's public key) → continue.
// - Invalid/expired access token but a refresh_token cookie → ask the backend for new
//   tokens, pass its Set-Cookie headers to the browser, continue.
// - Otherwise → redirect to /login?next=<original path>.
//
// Skipped entirely in mock mode (NEXT_PUBLIC_API_MOCK != "false"), where there's no backend.

import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, verifyAccessToken } from "@/lib/auth/jwt";
import { safeNextPath } from "@/lib/auth/redirect";
import { TUNNEL_HEADERS } from "@/lib/api/tunnel";

const PUBLIC_PATHS = ["/login", "/register"];

/**
 * Pages anyone may open without signing in: invite links (they show a sign-up/log-in card to
 * signed-out visitors) and link-preview images. Link-preview bots never have cookies, so
 * redirecting these to /login would make every shared invite preview as the login page.
 */
function isOpenPath(pathname: string) {
  // Preview images exist only at the site root and on invites (Next may add a -<id> suffix).
  return pathname.startsWith("/invite/") || /^(\/invite\/[^/]+)?\/(opengraph|twitter)-image(-\w+)?$/.test(pathname);
}

async function refreshTokens(request: NextRequest): Promise<string[] | null> {
  const apiUrl = process.env.API_URL ?? "http://localhost:8080";
  try {
    const res = await fetch(`${apiUrl}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { cookie: request.headers.get("cookie") ?? "", ...TUNNEL_HEADERS },
      cache: "no-store",
    });
    return res.ok ? res.headers.getSetCookie() : null;
  } catch {
    return null;
  }
}

function withCookies(response: NextResponse, setCookies: string[]) {
  for (const cookie of setCookies) response.headers.append("set-cookie", cookie);
  return response;
}

export async function proxy(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_API_MOCK !== "false") return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.includes(pathname);
  const isOpen = isOpenPath(pathname);

  let claims;
  try {
    claims = await verifyAccessToken(request.cookies.get(ACCESS_TOKEN_COOKIE)?.value);
  } catch (error) {
    console.error("[proxy] Can't load the JWT public key (set JWT_PUBLIC_KEY or JWT_PUBLIC_KEY_PATH):", error);
    return isPublic || isOpen
      ? NextResponse.next()
      : new NextResponse("Server auth is misconfigured: JWT public key missing.", { status: 500 });
  }

  // Signed-in users don't need the login/register pages.
  if (isPublic) {
    if (!claims) return NextResponse.next();
    return NextResponse.redirect(new URL(safeNextPath(request.nextUrl.searchParams.get("next")), request.url));
  }

  if (claims) return NextResponse.next();

  if (request.cookies.has(REFRESH_TOKEN_COOKIE)) {
    const setCookies = await refreshTokens(request);
    if (setCookies) return withCookies(NextResponse.next(), setCookies);
  }

  if (isOpen) return NextResponse.next();

  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Pages only: skip the API proxy (/api/v1 → Go backend), Next internals and static files.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
