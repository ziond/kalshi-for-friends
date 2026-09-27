import type { ID, ISODate, Role, Visibility } from "./common";
import type { UserSummary } from "./user";

export interface CommunitySummary {
  id: ID;
  name: string;
  description: string | null;
  visibility: Visibility;
  memberCount: number;
  openMarketCount: number;
  /** Community-level moderators (they resolve markets in public communities). */
  moderators: UserSummary[];
  /** null when the current user isn't a member (e.g. in Discover). */
  myRole: Role | null;
  createdAt: ISODate;
}

export interface CommunityDetail extends CommunitySummary {
  creator: UserSummary;
  /** Only returned to MODERATOR/ADMIN; null for members. */
  inviteCode: string | null;
}

/** What someone sees on an invite link before joining. */
export interface InvitePreview {
  inviteCode: string;
  community: Pick<
    CommunitySummary,
    "id" | "name" | "description" | "visibility" | "memberCount" | "moderators"
  >;
  alreadyMember: boolean;
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
  visibility: Visibility;
  /** Public communities only: usernames to make MODERATOR. The creator is always ADMIN. */
  moderatorUsernames?: string[];
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
