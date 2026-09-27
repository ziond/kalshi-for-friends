"use client";

import { useQueries } from "@tanstack/react-query";
import { usersApi } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/**
 * "found": a user has this username. "missing": nobody does. "unverified": the lookup failed
 * (e.g. an API without GET /users/lookup), so we can't tell; the server still checks on submit.
 */
export type UsernameStatus = "checking" | "found" | "missing" | "unverified";

export interface UsernameCheck {
  name: string;
  status: UsernameStatus;
  /** The username as stored (e.g. "Sam K." for "sam k."), once found. */
  canonical?: string;
}

/** Checks each username exists, one cached lookup per name. */
export function useUsernameChecks(names: string[]): UsernameCheck[] {
  const results = useQueries({
    queries: names.map((name) => ({
      queryKey: queryKeys.users.lookup(name),
      queryFn: () => usersApi.lookup(name.trim()),
      retry: false,
      staleTime: 60_000,
    })),
  });
  return names.map((name, i) => {
    const r = results[i];
    if (r.isPending) return { name, status: "checking" };
    if (r.isError) return { name, status: "unverified" };
    return r.data.user ? { name, status: "found", canonical: r.data.user.username } : { name, status: "missing" };
  });
}
