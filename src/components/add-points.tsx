"use client";

import { useEffect, useRef, useState } from "react";
import { useDeposit, useMe } from "@/hooks/use-me";
import { MAX_DEPOSIT } from "@/types";
import { CoinIcon } from "./icons";
import { Button, ErrorNote, inputClass } from "./ui";

const QUICK_AMOUNTS = [500, 1000, 5000];

/** Balance pill in the top nav; click it to top up (MVP: any amount, no payment). */
export function AddPoints() {
  const { data: me } = useMe();
  const deposit = useDeposit();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [added, setAdded] = useState<number | null>(null);
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

  const add = (value: number) => {
    setAdded(null);
    deposit.mutate({ amount: value }, {
      onSuccess: () => {
        setAdded(value);
        setAmount("");
      },
    });
  };

  const parsed = Number(amount);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_DEPOSIT;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          setOpen((o) => !o);
          setAdded(null);
          deposit.reset();
        }}
        aria-expanded={open}
        aria-label={me ? `Balance ${me.balance.toLocaleString()} pts — add points` : "Balance — add points"}
        className="flex cursor-pointer items-center gap-2 rounded-full border border-line px-3.5 py-1.5 text-sm font-semibold tabular-nums hover:bg-surface"
      >
        <CoinIcon size={15} className="text-live" />
        {me ? me.balance.toLocaleString() : "—"}
      </button>

      {open && (
        <div className="absolute top-12 right-0 z-30 flex w-[280px] flex-col gap-3.5 rounded-2xl border border-line bg-surface p-4 shadow-[0_12px_32px_rgba(0,0,0,0.45)]">
          <div>
            <div className="text-sm font-bold">Add points</div>
            <div className="mt-0.5 text-xs text-muted">Virtual points only — top up any time.</div>
          </div>
          <div className="flex gap-2">
            {QUICK_AMOUNTS.map((value) => (
              <button key={value} disabled={deposit.isPending} onClick={() => add(value)}
                className="flex-1 cursor-pointer rounded-xl bg-raised py-2 text-xs font-semibold hover:bg-line disabled:opacity-50">
                +{value.toLocaleString()}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) add(parsed);
            }}
          >
            <input
              type="number"
              min={1}
              max={MAX_DEPOSIT}
              step={1}
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Custom amount"
              aria-label="Custom amount of points"
              className={`${inputClass} min-w-0 flex-1 py-2`}
            />
            <Button type="submit" className="rounded-xl" disabled={!valid || deposit.isPending}>
              Add
            </Button>
          </form>
          <ErrorNote error={deposit.error} />
          {added !== null && (
            <p className="text-xs font-semibold text-live">Added {added.toLocaleString()} pts.</p>
          )}
        </div>
      )}
    </div>
  );
}
