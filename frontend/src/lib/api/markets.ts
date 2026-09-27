import type {
  CancelMarketRequest,
  CreateMarketRequest,
  ID,
  MarketActivity,
  MarketDetail,
  MarketListParams,
  MarketSummary,
  Paginated,
  PaginationParams,
  PlacePositionRequest,
  PlacePositionResponse,
  ResolveMarketRequest,
} from "@/types";
import { api } from "./client";

export const marketsApi = {
  /** Home feed across all of the user's communities. */
  feed: (params?: MarketListParams) =>
    api.get<Paginated<MarketSummary>>("/markets", { query: { ...params } }),
  listByCommunity: (communityId: ID, params?: MarketListParams) =>
    api.get<Paginated<MarketSummary>>(`/communities/${communityId}/markets`, {
      query: { ...params },
    }),
  create: (communityId: ID, body: CreateMarketRequest) =>
    api.post<MarketDetail>(`/communities/${communityId}/markets`, body),
  get: (marketId: ID) => api.get<MarketDetail>(`/markets/${marketId}`),
  activity: (marketId: ID, params?: PaginationParams) =>
    api.get<Paginated<MarketActivity>>(`/markets/${marketId}/activity`, {
      query: { ...params },
    }),

  placePosition: (marketId: ID, body: PlacePositionRequest) =>
    api.post<PlacePositionResponse>(`/markets/${marketId}/positions`, body),
  resolve: (marketId: ID, body: ResolveMarketRequest) =>
    api.post<MarketDetail>(`/markets/${marketId}/resolve`, body),
  cancel: (marketId: ID, body: CancelMarketRequest) =>
    api.post<MarketDetail>(`/markets/${marketId}/cancel`, body),
};
