/** Only same-site paths are allowed for ?next=, so it can't send users to another site. */
export function safeNextPath(value: string | null | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}

export function loginUrl(nextPath: string): string {
  return `/login?next=${encodeURIComponent(nextPath)}`;
}
