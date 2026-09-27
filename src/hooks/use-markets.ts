"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { marketsApi } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type {
  CancelMarketRequest,
  CreateMarketRequest,
  ID,
  Me,
  MarketDetail,
  MarketListParams,
  MarketStatus,
  PlacePositionRequest,
  ResolveMarketRequest,
} from "@/types";

export function useMarketFeed(params?: MarketListParams) {
  return useQuery({
    queryKey: queryKeys.markets.feed(params),
    queryFn: () => marketsApi.feed(params),
  });
}

export function useCommunityMarkets(communityId: ID, params?: MarketListParams) {
  return useQuery({
    queryKey: queryKeys.markets.byCommunity(communityId, params),
    queryFn: () => marketsApi.listByCommunity(communityId, params),
  });
}

// MVP "real time": while a market can still change (bets on OPEN, a moderator's call on
// LOCKED), its page polls. React Query pauses polling while the tab is hidden and refetches
// on focus. Swap for a push channel (WebSocket/SSE) after the MVP.
export const LIVE_POLL_MS = 5_000;

export function isLive(status: MarketStatus | undefined) {
  return status === "OPEN" || status === "LOCKED";
}

export function useMarket(marketId: ID) {
  return useQuery({
    queryKey: queryKeys.markets.detail(marketId),
    queryFn: () => marketsApi.get(marketId),
    refetchInterval: (query) => (isLive(query.state.data?.status) ? LIVE_POLL_MS : false),
  });
}

export function useMarketActivity(marketId: ID, { live = false }: { live?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.markets.activity(marketId),
    queryFn: () => marketsApi.activity(marketId),
    refetchInterval: live ? LIVE_POLL_MS : false,
  });
}

/**
 * When polling shows a market has just been resolved or nullified (by someone else), refresh
 * what that changes for this user: balance, positions, feeds and the community leaderboard.
 */
export function useSettlementSync(market: Pick<MarketDetail, "id" | "status" | "communityId">) {
  const qc = useQueryClient();
  const previous = useRef(market.status);

  useEffect(() => {
    const was = previous.current;
    previous.current = market.status;
    if (isLive(was) && !isLive(market.status)) {
      qc.invalidateQueries({ queryKey: queryKeys.me.all });
      qc.invalidateQueries({ queryKey: queryKeys.communities.leaderboard(market.communityId) });
      qc.invalidateQueries({
        queryKey: queryKeys.markets.all,
        // The detail query is already fresh: it's what reported the change.
        predicate: (q) => q.queryKey[1] !== "detail" || q.queryKey[2] !== market.id,
      });
    }
  }, [market.status, market.id, market.communityId, qc]);
}

export function useCreateMarket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ communityId, body }: { communityId: ID; body: CreateMarketRequest }) =>
      marketsApi.create(communityId, body),
    onSuccess: (market) => {
      qc.setQueryData(queryKeys.markets.detail(market.id), market);
      qc.invalidateQueries({ queryKey: queryKeys.markets.all });
      qc.invalidateQueries({ queryKey: queryKeys.communities.all });
      qc.invalidateQueries({ queryKey: queryKeys.me.modQueue() });
    },
  });
}

export function usePlacePosition(marketId: ID) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PlacePositionRequest) => marketsApi.placePosition(marketId, body),
    onSuccess: ({ market, balance }) => {
      // The response carries the updated market and balance, so write them
      // straight into the cache instead of refetching.
      qc.setQueryData(queryKeys.markets.detail(marketId), market);
      qc.setQueryData<Me>(queryKeys.me.profile(), (me) => (me ? { ...me, balance } : me));
      qc.invalidateQueries({ queryKey: queryKeys.markets.activity(marketId) });
      qc.invalidateQueries({ queryKey: queryKeys.me.all });
    },
  });
}

function useSettleMarket<T>(
  marketId: ID,
  settle: (marketId: ID, body: T) => ReturnType<typeof marketsApi.get>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: T) => settle(marketId, body),
    onSuccess: (market) => {
      qc.setQueryData(queryKeys.markets.detail(marketId), market);
      qc.invalidateQueries({ queryKey: queryKeys.markets.all });
      qc.invalidateQueries({ queryKey: queryKeys.me.all });
      qc.invalidateQueries({ queryKey: queryKeys.communities.leaderboard(market.communityId) });
    },
  });
}

export function useResolveMarket(marketId: ID) {
  return useSettleMarket<ResolveMarketRequest>(marketId, marketsApi.resolve);
}

export function useCancelMarket(marketId: ID) {
  return useSettleMarket<CancelMarketRequest>(marketId, marketsApi.cancel);
}
