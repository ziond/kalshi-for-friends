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

export interface UpdateMeRequest {
  username?: string;
  avatarUrl?: string;
}
