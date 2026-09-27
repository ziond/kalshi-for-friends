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

/** How long an invite code works after it's issued (community created or code regenerated). */
export const INVITE_LINK_MINUTES = 15;

export interface CommunityDetail extends CommunitySummary {
  creator: UserSummary;
  /** Only returned to MODERATOR/ADMIN; null for members. May already have expired. */
  inviteCode: string | null;
  /**
   * When inviteCode stops working (issued + INVITE_LINK_MINUTES); null when inviteCode is null.
   * Optional until every backend sends it: the UI then just says links last 15 minutes.
   */
  inviteExpiresAt?: ISODate | null;
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

/**
 * The minimum about an invite that anyone with the link may see, signed in or not: used for
 * link previews (Open Graph) and the signed-out invite page. Anyone with the code can join,
 * so this reveals nothing extra. No description, moderators or member list.
 */
export interface PublicInvite {
  inviteCode: string;
  community: Pick<CommunitySummary, "name" | "visibility" | "memberCount">;
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

/** GET /communities/discover */
export interface DiscoverParams {
  /** Search: community name or description contains this (case-insensitive). */
  q?: string;
}

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

/** POST /communities/:id/invite-code (ADMIN only). The previous code stops working. */
export interface InviteCodeResponse {
  inviteCode: string;
  /** Now + INVITE_LINK_MINUTES. Optional until every backend sends it. */
  inviteExpiresAt?: ISODate;
}
