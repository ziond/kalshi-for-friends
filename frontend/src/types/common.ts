// Shared primitives. Mirrors docs/api-contract.md — keep in sync with the Go structs.

export type ID = number;

/** ISO-8601 UTC timestamp string, e.g. "2026-09-26T20:00:00Z". */
export type ISODate = string;

export type Role = "MEMBER" | "MODERATOR" | "ADMIN";

export type MarketType = "BINARY" | "MULTIPLE_CHOICE";

export type MarketStatus = "OPEN" | "LOCKED" | "RESOLVED" | "CANCELLED";

export type TransactionType =
  | "INITIAL_BONUS"
  | "PLACE_POSITION"
  | "WIN_REWARD"
  | "LOSS"
  | "REFUND";

export type PositionResult = "PENDING" | "WON" | "LOST" | "REFUNDED";

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export interface PaginationParams {
  cursor?: string;
  limit?: number;
}

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INSUFFICIENT_FUNDS"
  | "MARKET_CLOSED"
  | "ALREADY_MEMBER"
  | "INVALID_INVITE_CODE"
  | "OPTION_SWITCH_NOT_ALLOWED";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    fields?: Record<string, string>;
  };
}
