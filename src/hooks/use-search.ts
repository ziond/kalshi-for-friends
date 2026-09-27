"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { marketsApi } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { matchesSearch } from "@/lib/search";
import type { CommunitySummary, ID, MarketSummary } from "@/types";
import { useCommunities, useDiscoverCommunities } from "./use-communities";

export const SEARCH_MARKET_LIMIT = 12;

/** `value`, but only once it has stopped changing for `ms` (so typing doesn't fire a request per key). */
export function useDebouncedValue<T>(value: T, ms = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/**
 * Home search. Markets are searched on the server (GET /markets?q=), so any market the user can
 * see is found, not just the ones on screen. Communities are the user's own (including private
 * ones) plus public ones from Discover (?q=). Results are also matched here, so they're right
 * even from an API that ignores `q`.
 */
export function useSearch(query: string) {
  const q = query.trim();
  const enabled = q.length > 0;
  const params = { q, limit: SEARCH_MARKET_LIMIT };

  const markets = useQuery({
    queryKey: queryKeys.markets.feed(params),
    queryFn: () => marketsApi.feed(params),
    enabled,
  });
  const mine = useCommunities();
  const discovered = useDiscoverCommunities({ q }, { enabled });

  const communities = useMemo(() => {
    const seen = new Set<ID>();
    const found: CommunitySummary[] = [];
    for (const c of [...(mine.data ?? []), ...(discovered.data ?? [])]) {
      if (seen.has(c.id) || !matchesSearch(`${c.name} ${c.description ?? ""}`, q)) continue;
      seen.add(c.id);
      found.push(c);
    }
    return found;
  }, [mine.data, discovered.data, q]);

  const marketResults = useMemo(
    () => (markets.data?.items ?? []).filter((m: MarketSummary) => matchesSearch(`${m.title} ${m.communityName}`, q)),
    [markets.data, q],
  );

  return {
    markets: marketResults,
    /** More markets match than were loaded. */
    moreMarkets: Boolean(markets.data?.nextCursor),
    communities,
    isLoading: enabled && (markets.isPending || discovered.isPending || mine.isPending),
    error: markets.error ?? discovered.error,
  };
}
