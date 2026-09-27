"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMe, useModQueue } from "@/hooks/use-me";
import { initial } from "@/lib/format";
import { AddPoints } from "./add-points";
import { cn } from "./ui";

const TABS = [
  { href: "/", label: "Home" },
  { href: "/discover", label: "Discover" },
  { href: "/mod-queue", label: "Mod Queue" },
] as const;

function CreateMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer rounded-full bg-brand px-4 py-2 text-[13px] font-extrabold text-white hover:bg-brand-hover"
      >
        + Create
      </button>
      {open && (
        <div className="absolute top-11 right-0 z-30 flex min-w-[180px] flex-col gap-0.5 rounded-xl border border-line bg-white p-1.5 shadow-[0_8px_24px_rgba(28,27,25,0.14)]">
          {[
            { href: "/communities/new", label: "New community" },
            { href: "/markets/new", label: "New market" },
          ].map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-[13px] font-bold hover:bg-hover">
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function TopNav() {
  const pathname = usePathname();
  const { data: me } = useMe();
  const { data: modQueue } = useModQueue();
  const pendingCount = modQueue?.pending.length ?? 0;

  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-6 border-b border-ink/8 bg-canvas px-4 py-3.5 sm:px-8">
      <div className="flex flex-wrap items-center gap-6">
        <Link href="/" className="flex items-center gap-2 text-[22px] font-extrabold tracking-tight">
          <span className="flex size-7 items-center justify-center rounded-lg bg-brand text-[15px] text-white">H</span>
          Huddle
        </Link>
        <nav className="flex gap-1">
          {TABS.map((tab) => {
            const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
            return (
              <Link key={tab.href} href={tab.href}
                className={cn("rounded-full px-3.5 py-2 text-[13px] font-extrabold", active ? "bg-ink text-white" : "text-muted hover:text-ink")}>
                {tab.label}
                {tab.href === "/mod-queue" && pendingCount > 0 && (
                  <span className="ml-1.5 rounded-[10px] bg-no px-1.5 py-px text-[10px] font-extrabold text-white">
                    {pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-3.5">
        <AddPoints />
        <CreateMenu />
        <Link href="/profile" aria-label="Your profile"
          className="flex size-[34px] items-center justify-center rounded-full bg-blue text-[13px] font-extrabold text-white">
          {me ? initial(me.username) : ""}
        </Link>
      </div>
    </header>
  );
}
