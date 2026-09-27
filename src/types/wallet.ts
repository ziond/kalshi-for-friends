import type { ID, ISODate, TransactionType } from "./common";

export interface Wallet {
  balance: number;
  updatedAt: ISODate;
}

/** Points every new account starts with (INITIAL_BONUS). */
export const SIGNUP_BONUS_POINTS = 1_000;

/** Points a user can claim once every 24 hours (DAILY_BONUS). Missed days don't stack. */
export const DAILY_BONUS_POINTS = 1_000;

/** POST /me/daily-bonus */
export interface DailyBonusResponse {
  /** Points added (DAILY_BONUS_POINTS). */
  amount: number;
  /** New wallet balance. */
  balance: number;
  /** When the next claim opens: now + 24 hours. */
  nextDailyBonusAt: ISODate;
}

export interface TransactionReference {
  type: "POSITION" | "MARKET";
  id: ID;
  /** Market title, for display. */
  label: string;
}

export interface Transaction {
  id: ID;
  /** Signed: -200 for a bet, +450 for a win. */
  amount: number;
  type: TransactionType;
  balanceAfter: number;
  reference: TransactionReference | null;
  createdAt: ISODate;
}
