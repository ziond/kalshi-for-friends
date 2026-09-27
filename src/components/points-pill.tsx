"use client";

import { useEffect, useRef, useState } from "react";
import { useClaimDailyBonus, useMe } from "@/hooks/use-me";
import { useNow } from "@/hooks/use-now";
import { formatCountdown } from "@/lib/format";
import { DAILY_BONUS_POINTS } from "@/types";
import { CoinIcon, GiftIcon } from "./icons";
import { Button, ErrorNote, cn } from "./ui";

const BONUS = DAILY_BONUS_POINTS.toLocaleString();

/**
 * The daily 1,000 points: whether they're claimable now, a countdown otherwise, and the claim.
 * `tickMs` sets how often the countdown re-renders (every second only where it's on screen).
 */
export function useDailyBonus(tickMs = 1000) {
  const { data: me } = useMe();
  const claim = useClaimDailyBonus();
  // Unknown until /me includes nextDailyBonusAt (e.g. an older backend): show no bonus UI then.
  const nextAt = me?.nextDailyBonusAt && !Number.isNaN(Date.parse(me.nextDailyBonusAt)) ? me.nextDailyBonusAt : null;
  const now = useNow(Boolean(nextAt), tickMs);
  const ready = nextAt ? Date.parse(nextAt) <= now : false;
  return { me, claim, ready, available: Boolean(nextAt), countdown: nextAt ? formatCountdown(nextAt, now) : "" };
}

/** Balance pill in the top nav. Lights up when the daily points are ready; click for the claim. */
export function PointsPill() {
  const [open, setOpen] = useState(false);
  const { me, claim, ready, available, countdown } = useDailyBonus(open ? 1000 : 15_000);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const balance = me ? me.balance.toLocaleString() : null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          setOpen((o) => !o);
          claim.reset();
        }}
        aria-expanded={open}
        aria-label={balance
          ? `Balance ${balance} pts${ready ? ` — daily ${BONUS} points ready to claim` : ""}`
          : "Balance"}
        className={cn(
          "relative flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold tabular-nums hover:bg-surface",
          ready ? "border-lime/60" : "border-line",
        )}
      >
        <CoinIcon size={15} className="text-live" />
        {balance ?? "—"}
        {ready && (
          <>
            <GiftIcon size={16} className="text-lime" />
            <span className="absolute -top-0.5 -right-0.5 size-2.5 animate-pulse rounded-full bg-lime" />
          </>
        )}
      </button>

      {open && (
        <div className="absolute top-12 right-0 z-30 flex w-[290px] flex-col gap-4 rounded-2xl border border-line bg-surface p-4 shadow-[0_12px_32px_rgba(0,0,0,0.45)]">
          <div>
            <div className="text-xs font-medium tracking-[0.06em] text-muted uppercase">Your points</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{balance ?? "—"}</div>
          </div>

          {available && <div className={cn("flex flex-col gap-3 rounded-xl p-3.5", ready ? "bg-lime/10" : "bg-raised")}>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <GiftIcon size={16} className="text-lime" />
              Daily points
            </div>
            {ready ? (
              <>
                <p className="text-sm text-muted">Your daily {BONUS} points are ready.</p>
                <Button className="rounded-xl py-2.5 text-sm" disabled={claim.isPending}
                  onClick={() => claim.mutate()}>
                  {claim.isPending ? "Claiming…" : `Claim ${BONUS} pts`}
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted">
                Next {BONUS} pts in <span className="font-semibold text-ink tabular-nums">{countdown}</span>.
                They don&apos;t stack, so claim them when they&apos;re ready.
              </p>
            )}
            {claim.isSuccess && (
              <p role="status" className="text-sm font-semibold text-live">+{claim.data.amount.toLocaleString()} pts added.</p>
            )}
            <ErrorNote error={claim.error} />
          </div>}

          <p className="text-center text-xs text-faint">Virtual points only · No real-money wagering</p>
        </div>
      )}
    </div>
  );
}

/** Home prompt, shown only while the daily points are waiting (and briefly after claiming). */
export function DailyBonusCard() {
  const { claim, ready, countdown } = useDailyBonus(15_000);

  if (claim.isSuccess) {
    return (
      <section aria-label="Daily points" role="status"
        className="flex items-center gap-3 rounded-[20px] border border-live/30 bg-live/10 px-5 py-4 text-sm">
        <GiftIcon size={20} className="flex-none text-live" />
        <span>
          <span className="font-semibold text-live">+{claim.data.amount.toLocaleString()} pts added.</span>{" "}
          <span className="text-muted">Your next drop is in {countdown}.</span>
        </span>
      </section>
    );
  }
  if (!ready) return null;

  return (
    <section aria-label="Daily points"
      className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-lime/40 bg-lime/[0.07] px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-lime/15">
          <GiftIcon size={20} className="text-lime" />
        </span>
        <div>
          <div className="font-semibold">Your daily {BONUS} points are here</div>
          <div className="text-sm text-muted">Claim them before you make your next call.</div>
        </div>
      </div>
      <Button className="rounded-xl px-5 py-2.5 text-sm" disabled={claim.isPending} onClick={() => claim.mutate()}>
        {claim.isPending ? "Claiming…" : `Claim ${BONUS} pts`}
      </Button>
      <ErrorNote error={claim.error} />
    </section>
  );
}
