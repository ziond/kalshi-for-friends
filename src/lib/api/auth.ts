import type {
  DailyBonusResponse,
  ID,
  LoginRequest,
  Me,
  ModQueue,
  Paginated,
  PaginationParams,
  Position,
  PositionListParams,
  RegisterRequest,
  Transaction,
  UpdateMeRequest,
  UserProfile,
  UsernameLookup,
  Wallet,
} from "@/types";
import { api } from "./client";

export const authApi = {
  register: (body: RegisterRequest) => api.post<Me>("/auth/register", body),
  login: (body: LoginRequest) => api.post<Me>("/auth/login", body),
  /** Clears both auth cookies on the backend. */
  logout: () => api.post<void>("/auth/logout"),
  /** Swaps the refresh_token cookie for new access/refresh cookies. The client does this automatically on 401. */
  refresh: () => api.post<void>("/auth/refresh"),
};

export const meApi = {
  get: () => api.get<Me>("/me"),
  update: (body: UpdateMeRequest) => api.patch<Me>("/me", body),
  positions: (params?: PositionListParams) =>
    api.get<Paginated<Position>>("/me/positions", { query: { ...params } }),
  wallet: () => api.get<Wallet>("/me/wallet"),
  /** Claim the daily points; 409 DAILY_BONUS_NOT_READY before nextDailyBonusAt. */
  claimDailyBonus: () => api.post<DailyBonusResponse>("/me/daily-bonus"),
  modQueue: () => api.get<ModQueue>("/me/mod-queue"),
  transactions: (params?: PaginationParams) =>
    api.get<Paginated<Transaction>>("/me/transactions", { query: { ...params } }),
};

export const usersApi = {
  get: (userId: ID) => api.get<UserProfile>(`/users/${userId}`),
  /** { user: null } if nobody has that username. Errors mean "couldn't check", not "doesn't exist". */
  lookup: (username: string) => api.get<UsernameLookup>("/users/lookup", { query: { username } }),
};
