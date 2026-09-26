import type {
  CommunityDetail,
  CommunityMember,
  CommunitySummary,
  CreateCommunityRequest,
  ID,
  InviteCodeResponse,
  JoinCommunityRequest,
  LeaderboardEntry,
  UpdateCommunityRequest,
  UpdateMemberRoleRequest,
} from "@/types";
import { api } from "./client";

export const communitiesApi = {
  list: () => api.get<CommunitySummary[]>("/communities"),
  create: (body: CreateCommunityRequest) => api.post<CommunityDetail>("/communities", body),
  join: (body: JoinCommunityRequest) => api.post<CommunityDetail>("/communities/join", body),
  get: (communityId: ID) => api.get<CommunityDetail>(`/communities/${communityId}`),
  update: (communityId: ID, body: UpdateCommunityRequest) =>
    api.patch<CommunityDetail>(`/communities/${communityId}`, body),
  rotateInviteCode: (communityId: ID) =>
    api.post<InviteCodeResponse>(`/communities/${communityId}/invite-code`),

  members: (communityId: ID) =>
    api.get<CommunityMember[]>(`/communities/${communityId}/members`),
  updateMemberRole: (communityId: ID, userId: ID, body: UpdateMemberRoleRequest) =>
    api.patch<CommunityMember>(`/communities/${communityId}/members/${userId}`, body),
  /** Kick a member, or leave when userId is the current user. */
  removeMember: (communityId: ID, userId: ID) =>
    api.delete(`/communities/${communityId}/members/${userId}`),

  leaderboard: (communityId: ID) =>
    api.get<LeaderboardEntry[]>(`/communities/${communityId}/leaderboard`),
};
