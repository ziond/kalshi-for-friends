"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { communitiesApi } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { ID } from "@/types";

export function useCommunities() {
  return useQuery({ queryKey: queryKeys.communities.list(), queryFn: communitiesApi.list });
}

export function useCommunity(communityId: ID) {
  return useQuery({
    queryKey: queryKeys.communities.detail(communityId),
    queryFn: () => communitiesApi.get(communityId),
  });
}

export function useCommunityMembers(communityId: ID) {
  return useQuery({
    queryKey: queryKeys.communities.members(communityId),
    queryFn: () => communitiesApi.members(communityId),
  });
}

export function useLeaderboard(communityId: ID) {
  return useQuery({
    queryKey: queryKeys.communities.leaderboard(communityId),
    queryFn: () => communitiesApi.leaderboard(communityId),
  });
}

export function useCreateCommunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: communitiesApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.communities.all }),
  });
}

export function useJoinCommunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: communitiesApi.join,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.communities.all });
      qc.invalidateQueries({ queryKey: queryKeys.markets.all });
    },
  });
}
