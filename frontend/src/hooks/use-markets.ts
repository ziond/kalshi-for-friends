"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { marketsApi } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type {
  CancelMarketRequest,
  CreateMarketRequest,
  ID,
  Me,
  MarketListParams,
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

export function useMarket(marketId: ID) {
  return useQuery({
    queryKey: queryKeys.markets.detail(marketId),
    queryFn: () => marketsApi.get(marketId),
  });
}

export function useMarketActivity(marketId: ID) {
  return useQuery({
    queryKey: queryKeys.markets.activity(marketId),
    queryFn: () => marketsApi.activity(marketId),
  });
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
