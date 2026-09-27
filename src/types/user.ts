import type { ID, ISODate } from "./common";

export interface UserSummary {
  id: ID;
  username: string;
  avatarUrl: string | null;
}

export interface UserStats {
  predictionScore: number;
  totalPredictions: number;
  correctPredictions: number;
  /** correct / total, 0–1. Computed by the backend. */
  accuracy: number;
}

/** The logged-in user. */
export interface Me extends UserSummary, UserStats {
  email: string;
  /** Joined from wallets so the navbar needs a single call. */
  balance: number;
  /**
   * When the next daily bonus can be claimed; claimable once this is in the past.
   * signup + 24 hours at first, then last claim + 24 hours.
   */
  nextDailyBonusAt: ISODate;
  createdAt: ISODate;
}

export interface UserProfile extends UserSummary, UserStats {
  createdAt: ISODate;
}

// ---- requests ----

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * GET /users/lookup?username= — whether a username exists (case-insensitive), e.g. before
 * adding someone as a moderator. Always 200: `user` is null when there's no such user.
 */
export interface UsernameLookup {
  user: UserSummary | null;
}

export interface UpdateMeRequest {
  username?: string;
  avatarUrl?: string;
}
