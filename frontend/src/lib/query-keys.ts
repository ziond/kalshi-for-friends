import type { ID, MarketListParams, PositionListParams } from "@/types";

// Hierarchical keys so related queries can be invalidated together,
// e.g. invalidateQueries({ queryKey: queryKeys.markets.all }).
export const queryKeys = {
  me: {
    all: ["me"] as const,
    profile: () => [...queryKeys.me.all, "profile"] as const,
    wallet: () => [...queryKeys.me.all, "wallet"] as const,
    transactions: () => [...queryKeys.me.all, "transactions"] as const,
    modQueue: () => [...queryKeys.me.all, "mod-queue"] as const,
    positions: (params?: PositionListParams) =>
      [...queryKeys.me.all, "positions", params ?? {}] as const,
  },
  users: {
    detail: (userId: ID) => ["users", userId] as const,
  },
  communities: {
    all: ["communities"] as const,
    list: () => [...queryKeys.communities.all, "list"] as const,
    discover: () => [...queryKeys.communities.all, "discover"] as const,
    invite: (inviteCode: string) => [...queryKeys.communities.all, "invite", inviteCode] as const,
    detail: (communityId: ID) => [...queryKeys.communities.all, communityId] as const,
    members: (communityId: ID) =>
      [...queryKeys.communities.detail(communityId), "members"] as const,
    leaderboard: (communityId: ID) =>
      [...queryKeys.communities.detail(communityId), "leaderboard"] as const,
  },
  markets: {
    all: ["markets"] as const,
    feed: (params?: MarketListParams) =>
      [...queryKeys.markets.all, "feed", params ?? {}] as const,
    byCommunity: (communityId: ID, params?: MarketListParams) =>
      [...queryKeys.markets.all, "community", communityId, params ?? {}] as const,
    detail: (marketId: ID) => [...queryKeys.markets.all, "detail", marketId] as const,
    activity: (marketId: ID) =>
      [...queryKeys.markets.detail(marketId), "activity"] as const,
  },
};
