import type {
  ID,
  LoginRequest,
  Me,
  Paginated,
  PaginationParams,
  Position,
  PositionListParams,
  RegisterRequest,
  Transaction,
  UpdateMeRequest,
  UserProfile,
  Wallet,
} from "@/types";
import { api } from "./client";

export const authApi = {
  register: (body: RegisterRequest) => api.post<Me>("/auth/register", body),
  login: (body: LoginRequest) => api.post<Me>("/auth/login", body),
  logout: () => api.post<void>("/auth/logout"),
};

export const meApi = {
  get: () => api.get<Me>("/me"),
  update: (body: UpdateMeRequest) => api.patch<Me>("/me", body),
  positions: (params?: PositionListParams) =>
    api.get<Paginated<Position>>("/me/positions", { query: { ...params } }),
  wallet: () => api.get<Wallet>("/me/wallet"),
  transactions: (params?: PaginationParams) =>
    api.get<Paginated<Transaction>>("/me/transactions", { query: { ...params } }),
};

export const usersApi = {
  get: (userId: ID) => api.get<UserProfile>(`/users/${userId}`),
};
