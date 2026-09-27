import type {
  ID,
  ISODate,
  MarketStatus,
  MarketType,
  PaginationParams,
  PositionResult,
  Visibility,
} from "./common";
import type { UserSummary } from "./user";

export interface MarketOption {
  id: ID;
  text: string;
  totalAmount: number;
  positionCount: number;
  /** totalAmount / market pool, 0–1 (even split when the pool is empty). */
  probability: number;
  /** null until the market is resolved. */
  isWinner: boolean | null;
}

/** The current user's stake in a market. */
export interface MyStake {
  optionId: ID;
  amount: number;
  potentialPayout: number;
}

export interface MarketSummary {
  id: ID;
  communityId: ID;
  communityName: string;
  communityVisibility: Visibility;
  title: string;
  marketType: MarketType;
  status: MarketStatus;
  deadline: ISODate;
  totalPool: number;
  participantCount: number;
  options: MarketOption[];
  creator: UserSummary;
  /** Who validates the outcome once the market closes. */
  moderator: UserSummary;
  /** null if the current user hasn't bet. */
  myStake: MyStake | null;
  /** When payouts go (or went) out: set once the moderator picks a winner, otherwise null. */
  payoutAt: ISODate | null;
}

/** Minutes between the moderator picking a winner and the payout. They can still nullify until then. */
export const PAYOUT_GRACE_MINUTES = 5;

export interface Settlement {
  winningOptionId: ID;
  resolvedBy: UserSummary;
  /** When the moderator picked the winner. */
  resolvedAt: ISODate;
  /** resolvedAt + PAYOUT_GRACE_MINUTES. */
  payoutAt: ISODate;
  /** null during the grace period (status PAYOUT_PENDING). */
  paidOutAt: ISODate | null;
  notes: string | null;
}

export interface MarketPermissions {
  canBet: boolean;
  canResolve: boolean;
  canCancel: boolean;
}

/** One point on the "probability over time" chart. */
export interface PricePoint {
  at: ISODate;
  /** optionId -> probability (0–1). */
  probabilities: Record<ID, number>;
}

export interface MarketDetail extends MarketSummary {
  description: string | null;
  settlement: Settlement | null;
  /** Oldest first. The last point matches the options' current probabilities. */
  history: PricePoint[];
  createdAt: ISODate;
  updatedAt: ISODate;
  permissions: MarketPermissions;
}

/** One entry in a market's activity feed, e.g. "Sarah put 150 on John". */
export interface MarketActivity {
  /** Position id. */
  id: ID;
  user: UserSummary;
  optionId: ID;
  optionText: string;
  amount: number;
  createdAt: ISODate;
}

export interface Position {
  id: ID;
  market: Pick<MarketSummary, "id" | "communityId" | "title" | "status" | "deadline">;
  optionId: ID;
  optionText: string;
  amount: number;
  result: PositionResult;
  /** Set once the market is resolved or cancelled. */
  payout: number | null;
  /** At current odds, while PENDING. */
  potentialPayout: number;
  createdAt: ISODate;
}

// ---- requests ----

export interface MarketListParams extends PaginationParams {
  status?: MarketStatus;
  /** Feed only: PRIVATE = my private communities, PUBLIC = all public communities. */
  visibility?: Visibility;
  sort?: "volume" | "newest";
  /** Search: market title or community name contains this (case-insensitive). */
  q?: string;
}

/** Markets the current user is the assigned moderator for. */
export interface ModQueue {
  /** Closed (LOCKED) and waiting for a resolve/cancel decision. */
  pending: MarketSummary[];
  /** Winner picked, inside the grace period (PAYOUT_PENDING); can still be nullified. */
  payoutPending: MarketSummary[];
  /** Still OPEN. */
  active: MarketSummary[];
}

export interface PositionListParams extends PaginationParams {
  status?: "open" | "settled";
}

export interface CreateMarketRequest {
  title: string;
  description?: string;
  marketType: MarketType;
  /** Must be in the future. */
  deadline: ISODate;
  /** Required for MULTIPLE_CHOICE (2–10). Ignored for BINARY — backend creates YES/NO. */
  options?: string[];
  /** Defaults to the creator. Must be a MODERATOR/ADMIN of the community. */
  moderatorId?: ID;
}

export interface PlacePositionRequest {
  optionId: ID;
  /** 1 <= amount <= balance */
  amount: number;
}

export interface PlacePositionResponse {
  position: Position;
  market: MarketDetail;
  balance: number;
}

export interface ResolveMarketRequest {
  winningOptionId: ID;
  notes?: string;
}

export interface CancelMarketRequest {
  reason?: string;
}
