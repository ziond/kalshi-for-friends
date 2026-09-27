"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { communitiesApi } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { ID } from "@/types";

export function useCommunities() {
  return useQuery({ queryKey: queryKeys.communities.list(), queryFn: communitiesApi.list });
}

export function useDiscoverCommunities() {
  return useQuery({ queryKey: queryKeys.communities.discover(), queryFn: communitiesApi.discover });
}

export function useCommunity(communityId: ID) {
  return useQuery({
    queryKey: queryKeys.communities.detail(communityId),
    queryFn: () => communitiesApi.get(communityId),
  });
}

export function useCommunityMembers(communityId: ID | undefined) {
  return useQuery({
    queryKey: queryKeys.communities.members(communityId ?? 0),
    queryFn: () => communitiesApi.members(communityId!),
    enabled: communityId !== undefined,
  });
}

export function useLeaderboard(communityId: ID) {
  return useQuery({
    queryKey: queryKeys.communities.leaderboard(communityId),
    queryFn: () => communitiesApi.leaderboard(communityId),
  });
}

export function useInvitePreview(inviteCode: string) {
  return useQuery({
    queryKey: queryKeys.communities.invite(inviteCode),
    queryFn: () => communitiesApi.invitePreview(inviteCode),
  });
}

/** Joining changes which communities and markets the user can see. */
function useInvalidateMembership() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.communities.all });
    qc.invalidateQueries({ queryKey: queryKeys.markets.all });
  };
}

export function useCreateCommunity() {
  const invalidate = useInvalidateMembership();
  return useMutation({ mutationFn: communitiesApi.create, onSuccess: invalidate });
}

export function useJoinCommunity() {
  const invalidate = useInvalidateMembership();
  return useMutation({ mutationFn: communitiesApi.join, onSuccess: invalidate });
}

export function useJoinByInvite() {
  const invalidate = useInvalidateMembership();
  return useMutation({ mutationFn: communitiesApi.joinByCode, onSuccess: invalidate });
}
