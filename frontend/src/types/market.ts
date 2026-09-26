import type {
  ID,
  ISODate,
  MarketStatus,
  MarketType,
  PaginationParams,
  PositionResult,
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
  title: string;
  marketType: MarketType;
  status: MarketStatus;
  deadline: ISODate;
  totalPool: number;
  participantCount: number;
  options: MarketOption[];
  creator: UserSummary;
  /** null if the current user hasn't bet. */
  myStake: MyStake | null;
}

export interface Settlement {
  winningOptionId: ID;
  resolvedBy: UserSummary;
  resolvedAt: ISODate;
  notes: string | null;
}

export interface MarketPermissions {
  canBet: boolean;
  canResolve: boolean;
  canCancel: boolean;
}

export interface MarketDetail extends MarketSummary {
  description: string | null;
  moderator: UserSummary;
  settlement: Settlement | null;
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
