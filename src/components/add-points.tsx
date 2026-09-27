"use client";

import { useEffect, useRef, useState } from "react";
import { useDeposit, useMe } from "@/hooks/use-me";
import { MAX_DEPOSIT } from "@/types";
import { Button, ErrorNote } from "./ui";

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
        aria-label="Balance — add points"
        className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-[13px] font-extrabold hover:bg-hover"
      >
        <span className="inline-block size-2 rounded-full bg-gold" />
        {me ? `${me.balance.toLocaleString()} pts` : "—"}
        <span className="text-brand">+</span>
      </button>

      {open && (
        <div className="absolute top-11 right-0 z-30 flex w-[260px] flex-col gap-3 rounded-xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(28,27,25,0.14)]">
          <div>
            <div className="text-sm font-extrabold">Add points</div>
            <div className="text-xs font-semibold text-faint">Free during the MVP — top up any time.</div>
          </div>
          <div className="flex gap-2">
            {QUICK_AMOUNTS.map((value) => (
              <button key={value} disabled={deposit.isPending} onClick={() => add(value)}
                className="flex-1 cursor-pointer rounded-[10px] bg-canvas py-2 text-xs font-extrabold hover:bg-brand-soft disabled:opacity-50">
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
              className="min-w-0 flex-1 rounded-[10px] border border-ink/15 px-3 py-2 text-[13px] font-bold outline-none focus:border-brand"
            />
            <Button type="submit" className="rounded-[10px]" disabled={!valid || deposit.isPending}>
              Add
            </Button>
          </form>
          <ErrorNote error={deposit.error} />
          {added !== null && (
            <p className="text-xs font-bold text-yes-dark">Added {added.toLocaleString()} pts.</p>
          )}
        </div>
      )}
    </div>
  );
}
