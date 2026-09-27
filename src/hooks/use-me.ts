"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi, meApi } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { LIVE_POLL_MS } from "./use-markets";
import type { Me, PositionListParams } from "@/types";

export function useMe() {
  return useQuery({ queryKey: queryKeys.me.profile(), queryFn: meApi.get });
}

export function useWallet() {
  return useQuery({ queryKey: queryKeys.me.wallet(), queryFn: meApi.wallet });
}

export function useTransactions() {
  return useQuery({
    queryKey: queryKeys.me.transactions(),
    queryFn: () => meApi.transactions(),
  });
}

export function useMyPositions(params?: PositionListParams) {
  return useQuery({
    queryKey: queryKeys.me.positions(params),
    queryFn: () => meApi.positions(params),
  });
}

export function useModQueue() {
  return useQuery({
    queryKey: queryKeys.me.modQueue(),
    queryFn: meApi.modQueue,
    // Keep countdowns honest while a payout is pending (it may be paid out or nullified).
    refetchInterval: (query) => (query.state.data?.payoutPending.length ? LIVE_POLL_MS : false),
  });
}

export function useClaimDailyBonus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: meApi.claimDailyBonus,
    onSuccess: ({ balance, nextDailyBonusAt }) => {
      qc.setQueryData<Me>(queryKeys.me.profile(), (me) => (me ? { ...me, balance, nextDailyBonusAt } : me));
      qc.invalidateQueries({ queryKey: queryKeys.me.wallet() });
      qc.invalidateQueries({ queryKey: queryKeys.me.transactions() });
    },
    // Claimed elsewhere (another tab or device): pick up the real balance and next time.
    onError: () => qc.invalidateQueries({ queryKey: queryKeys.me.profile() }),
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (me) => qc.setQueryData(queryKeys.me.profile(), me),
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: authApi.register,
    onSuccess: (me) => qc.setQueryData(queryKeys.me.profile(), me),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => qc.clear(),
  });
}
