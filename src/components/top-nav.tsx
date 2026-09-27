"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { useMe, useModQueue } from "@/hooks/use-me";
import { initial } from "@/lib/format";
import { PointsPill } from "./points-pill";
import { CompassIcon, HomeIcon, PlusCircleIcon, PlusIcon, ShieldIcon, UserIcon, UsersIcon } from "./icons";
import { cn } from "./ui";

const TABS = [
  { href: "/", label: "Home" },
  { href: "/discover", label: "Discover" },
  { href: "/communities", label: "Groups" },
  { href: "/mod-queue", label: "Mod queue" },
] as const;

const BOTTOM_TABS: { href: string; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/discover", label: "Discover", icon: CompassIcon },
  { href: "/markets/new", label: "Create", icon: PlusCircleIcon },
  { href: "/communities", label: "Groups", icon: UsersIcon },
  { href: "/profile", label: "Profile", icon: UserIcon },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/communities") return pathname === "/communities" || pathname.startsWith("/communities/");
  return pathname.startsWith(href);
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2.5 text-xl font-bold tracking-tight", className)}>
      <span className="flex size-8 items-center justify-center rounded-[9px] bg-lime text-base font-extrabold text-on-lime">
        C.
      </span>
      called it.
    </Link>
  );
}

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
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-1.5 rounded-full bg-lime px-4 py-2 text-[13px] font-semibold text-on-lime hover:bg-lime-hover"
      >
        <PlusIcon size={15} strokeWidth={2.5} />
        Create
      </button>
      {open && (
        <div className="absolute top-12 right-0 z-30 flex min-w-[190px] flex-col gap-0.5 rounded-2xl border border-line bg-surface p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.45)]">
          {[
            { href: "/markets/new", label: "New market" },
            { href: "/communities/new", label: "New community" },
          ].map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-2.5 text-[13px] font-medium hover:bg-raised">
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span className={cn("rounded-full bg-no px-1.5 py-px text-[10px] leading-4 font-bold text-on-lime", className)}>
      {count}
    </span>
  );
}

export function TopNav() {
  const pathname = usePathname();
  const { data: me } = useMe();
  const { data: modQueue } = useModQueue();
  const pendingCount = modQueue?.pending.length ?? 0;

  return (
    <header className="sticky top-0 z-20 border-b border-line/60 bg-canvas/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-8">
          <Logo />
          <nav aria-label="Main" className="hidden gap-1 md:flex">
            {TABS.map((tab) => {
              const active = isActive(pathname, tab.href);
              return (
                <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors",
                    active ? "bg-raised text-ink" : "text-muted hover:text-ink",
                  )}>
                  {tab.label}
                  {tab.href === "/mod-queue" && <CountBadge count={pendingCount} />}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-2.5">
          <Link href="/mod-queue" aria-label={pendingCount ? `Moderator queue, ${pendingCount} pending` : "Moderator queue"}
            className="relative flex size-9 items-center justify-center rounded-full text-muted hover:text-ink md:hidden">
            <ShieldIcon size={20} />
            <CountBadge count={pendingCount} className="absolute -top-0.5 -right-0.5" />
          </Link>
          <div className="hidden md:block">
            <CreateMenu />
          </div>
          <PointsPill />
          <Link href="/profile" aria-label="Your profile"
            className="flex size-9 items-center justify-center rounded-full bg-purple text-sm font-bold text-on-lime">
            {me ? initial(me.username) : ""}
          </Link>
        </div>
      </div>
    </header>
  );
}

/** Mobile tab bar, mirroring the app's main sections. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
      <div className="mx-auto flex max-w-[560px] justify-around px-2 pt-2 pb-2.5">
        {BOTTOM_TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined}
              className={cn("flex min-w-14 flex-col items-center gap-1 text-[11px] font-medium",
                active ? "text-lime" : "text-muted hover:text-ink")}>
              <Icon size={22} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
