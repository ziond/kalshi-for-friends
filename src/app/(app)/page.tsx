"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { MarketCard, MarketGrid } from "@/components/market-card";
import { Avatar, EmptyState, Skeleton, inputClass } from "@/components/ui";
import { useCommunities } from "@/hooks/use-communities";
import { useMarketFeed } from "@/hooks/use-markets";
import { useMe } from "@/hooks/use-me";
import type { MarketSummary, Visibility } from "@/types";

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" fill="#7C5CFC" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="#7C5CFC" strokeWidth="2" fill="none" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2F9E5B" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a13 13 0 0 1 0 18a13 13 0 0 1 0-18" />
    </svg>
  );
}

function TrendingSection({
  icon,
  title,
  subtitle,
  visibility,
  search,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  visibility: Visibility;
  search: string;
}) {
  const { data, isLoading } = useMarketFeed({ visibility, status: "OPEN", sort: "volume", limit: 3 });
  const q = search.trim().toLowerCase();
  const markets = (data?.items ?? []).filter(
    (m: MarketSummary) => !q || m.title.toLowerCase().includes(q) || m.communityName.toLowerCase().includes(q),
  );

  return (
    <section>
      <div className="mb-1 flex items-center gap-2.5">
        {icon}
        <h2 className="text-lg font-extrabold">{title}</h2>
      </div>
      <p className="mb-4 text-[13px] font-semibold text-muted">{subtitle}</p>
      {isLoading ? (
        <MarketGrid>
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[200px]" />)}
        </MarketGrid>
      ) : markets.length ? (
        <MarketGrid>
          {markets.map((m) => <MarketCard key={m.id} market={m} />)}
        </MarketGrid>
      ) : (
        <EmptyState>{q ? "No markets match your search." : "No open markets yet."}</EmptyState>
      )}
    </section>
  );
}

function CommunitySidebar() {
  const { data: communities } = useCommunities();
  return (
    <aside className="flex w-full flex-none flex-col gap-4 lg:w-[236px]">
      <div className="text-[13px] font-extrabold tracking-wide text-muted uppercase">Your communities</div>
      <div className="flex flex-col gap-2">
        {communities?.map((c) => (
          <Link key={c.id} href={`/communities/${c.id}`} className="flex items-center gap-2.5 rounded-[10px] p-2 hover:bg-hover">
            <Avatar id={c.id} name={c.name} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-bold">{c.name}</div>
              <div className="text-[11px] font-semibold text-faint">
                {c.visibility === "PRIVATE" ? "Private" : "Public"}
              </div>
            </div>
          </Link>
        ))}
      </div>
      <Link href="/discover" className="px-2 text-[13px] font-bold text-brand hover:text-brand-hover">
        Discover more →
      </Link>
    </aside>
  );
}

export default function HomePage() {
  const { data: me } = useMe();
  const [search, setSearch] = useState("");

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-7 px-4 pt-7 pb-16 sm:px-8 lg:flex-row">
      <CommunitySidebar />
      <div className="flex min-w-0 flex-1 flex-col gap-10">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            Hey {me?.username ?? "there"} — here&apos;s what&apos;s heating up.
          </h1>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search markets or communities"
            className={`${inputClass} mt-3.5 max-w-[420px] rounded-full px-4`}
          />
        </div>
        <TrendingSection
          icon={<LockIcon />}
          title="Trending in your private communities"
          subtitle="Markets from communities only your invited friends can see."
          visibility="PRIVATE"
          search={search}
        />
        <TrendingSection
          icon={<GlobeIcon />}
          title="Trending in public communities"
          subtitle="Popular bets happening across all of Huddle."
          visibility="PUBLIC"
          search={search}
        />
      </div>
    </div>
  );
}
