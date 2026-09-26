import type { ID, ISODate, Role } from "./common";
import type { UserSummary } from "./user";

export interface CommunitySummary {
  id: ID;
  name: string;
  description: string | null;
  memberCount: number;
  openMarketCount: number;
  myRole: Role;
  createdAt: ISODate;
}

export interface CommunityDetail extends CommunitySummary {
  creator: UserSummary;
  /** Only returned to MODERATOR/ADMIN; null for members. */
  inviteCode: string | null;
}

export interface CommunityMember {
  user: UserSummary;
  role: Role;
  joinedAt: ISODate;
}

export interface LeaderboardEntry {
  rank: number;
  user: UserSummary;
  /** Winnings minus stakes, within this community only. */
  netProfit: number;
  correctPredictions: number;
  totalPredictions: number;
  accuracy: number;
}

// ---- requests ----

export interface CreateCommunityRequest {
  name: string;
  description?: string;
}

export interface UpdateCommunityRequest {
  name?: string;
  description?: string;
}

export interface JoinCommunityRequest {
  inviteCode: string;
}

export interface UpdateMemberRoleRequest {
  role: Role;
}

export interface InviteCodeResponse {
  inviteCode: string;
}
