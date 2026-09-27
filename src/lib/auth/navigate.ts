// Full page loads for auth transitions (login, register, logout).
//
// A client-side router.push isn't enough here: the route guard (src/proxy.ts) decides
// between the app and /login from the auth cookies, and the client router can reuse a
// redirect it cached before the cookies changed, e.g. "/" -> "/login" from before
// logging in. A real navigation makes the guard see the new cookies every time.

/** Replace the current page (so Back doesn't return to the login form). */
export function replacePage(path: string) {
  window.location.replace(path);
}

/** Load a page as a new history entry. */
export function loadPage(path: string) {
  window.location.assign(path);
}
