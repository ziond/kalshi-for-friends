import type { ID, ISODate, TransactionType } from "./common";

export interface Wallet {
  balance: number;
  updatedAt: ISODate;
}

/** MVP only: users top up their own balance with any amount. */
export interface DepositRequest {
  /** Whole points, 1 to MAX_DEPOSIT. */
  amount: number;
}

export const MAX_DEPOSIT = 1_000_000;

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
