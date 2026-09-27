import type {
  CommunityDetail,
  CommunityMember,
  CommunitySummary,
  CreateCommunityRequest,
  DiscoverParams,
  ID,
  InviteCodeResponse,
  InvitePreview,
  JoinCommunityRequest,
  LeaderboardEntry,
  UpdateCommunityRequest,
  UpdateMemberRoleRequest,
} from "@/types";
import { api } from "./client";

export const communitiesApi = {
  /** Communities the current user belongs to. */
  list: () => api.get<CommunitySummary[]>("/communities"),
  /** All public communities, joined or not. */
  discover: (params?: DiscoverParams) =>
    api.get<CommunitySummary[]>("/communities/discover", { query: { ...params } }),
  create: (body: CreateCommunityRequest) => api.post<CommunityDetail>("/communities", body),
  /** Join a private community with an invite code. */
  joinByCode: (body: JoinCommunityRequest) =>
    api.post<CommunityDetail>("/communities/join", body),
  /** Join a public community directly. */
  join: (communityId: ID) => api.post<CommunityDetail>(`/communities/${communityId}/join`),
  invitePreview: (inviteCode: string) =>
    api.get<InvitePreview>(`/invites/${encodeURIComponent(inviteCode)}`),
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
