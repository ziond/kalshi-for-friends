"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { CommunityRow } from "@/components/community-row";
import { ArrowUpRightIcon, FlameIcon, GlobeIcon, SearchIcon, TrendingUpIcon, UsersIcon } from "@/components/icons";
import { MarketCard, MarketGrid } from "@/components/market-card";
import { DailyBonusCard } from "@/components/points-pill";
import { EmptyState, ErrorNote, Eyebrow, SectionHeader, SectionLink, Skeleton, inputClass } from "@/components/ui";
import { useCommunities } from "@/hooks/use-communities";
import { useMarketFeed } from "@/hooks/use-markets";
import { useMe } from "@/hooks/use-me";
import { useDebouncedValue, useSearch } from "@/hooks/use-search";
import { greeting } from "@/lib/format";
import type { Visibility } from "@/types";

function HeroCard() {
  return (
    <section className="relative overflow-hidden rounded-[26px] bg-lime p-6 text-on-lime sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <span className="rounded-full bg-on-lime/10 px-3 py-1 text-xs font-semibold tracking-[0.08em] text-[#1e6b2f] uppercase">
          Friend group forecast
        </span>
        <TrendingUpIcon size={22} />
      </div>
      <div className="mt-5 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="max-w-[520px] text-3xl leading-[1.1] font-bold tracking-tight sm:text-[40px]">
            Someone&apos;s getting exposed today.
          </p>
          <p className="mt-3 text-[15px] text-on-lime/75">Got a hot take? Turn it into a prediction.</p>
        </div>
        <Link href="/markets/new"
          className="flex flex-none items-center justify-center gap-1.5 rounded-2xl bg-canvas px-7 py-4 text-base font-semibold text-lime transition-colors hover:bg-canvas/85">
          + Create a market <ArrowUpRightIcon size={18} />
        </Link>
      </div>
    </section>
  );
}

function FeedSection({
  icon,
  title,
  action,
  visibility,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
  visibility: Visibility;
}) {
  const { data, isLoading } = useMarketFeed({ visibility, status: "OPEN", sort: "volume", limit: 3 });
  const markets = data?.items ?? [];

  return (
    <section>
      <SectionHeader icon={icon} title={title} action={action} />
      {isLoading ? (
        <MarketGrid>
          {[0, 1].map((i) => <Skeleton key={i} className="h-[360px]" />)}
        </MarketGrid>
      ) : markets.length ? (
        <MarketGrid>
          {markets.map((m) => <MarketCard key={m.id} market={m} />)}
        </MarketGrid>
      ) : (
        <EmptyState>No open markets yet.</EmptyState>
      )}
    </section>
  );
}

function SearchResults({ query }: { query: string }) {
  const { markets, moreMarkets, communities, isLoading, error } = useSearch(query);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3" aria-busy>
        <Skeleton className="h-[76px]" />
        <MarketGrid>{[0, 1].map((i) => <Skeleton key={i} className="h-[360px]" />)}</MarketGrid>
      </div>
    );
  }
  if (error) return <ErrorNote error={error} />;
  if (!markets.length && !communities.length) {
    return <EmptyState>Nothing matches “{query}”. Try another word, or check the spelling.</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-10">
      {communities.length > 0 && (
        <section aria-label="Matching communities">
          <SectionHeader icon={<UsersIcon size={19} className="text-purple" />} title={`Communities · ${communities.length}`} />
          <div className="flex flex-col gap-2.5">
            {communities.map((c) => (
              <CommunityRow key={c.id} community={c}
                trailing={c.myRole === null ? (
                  <span className="flex-none rounded-full bg-raised px-2.5 py-1 text-[11px] font-semibold text-muted">
                    Not joined
                  </span>
                ) : undefined} />
            ))}
          </div>
        </section>
      )}
      {markets.length > 0 && (
        <section aria-label="Matching markets">
          <SectionHeader icon={<FlameIcon size={20} className="text-orange" />}
            title={`Markets · ${moreMarkets ? `${markets.length}+` : markets.length}`} />
          <MarketGrid>{markets.map((m) => <MarketCard key={m.id} market={m} />)}</MarketGrid>
          {moreMarkets && (
            <p className="mt-3 text-sm text-muted">
              Showing the top {markets.length} by volume. Add another word to narrow it down.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function YourCommunities() {
  const { data: communities, isLoading } = useCommunities();
  return (
    <aside className="flex flex-col">
      <SectionHeader title="Your communities" action={<SectionLink href="/discover">Explore</SectionLink>} />
      <div className="flex flex-col gap-2.5">
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-[76px]" />)}
        {communities?.map((c) => <CommunityRow key={c.id} community={c} />)}
        {communities?.length === 0 && <EmptyState>You haven&apos;t joined any communities yet.</EmptyState>}
      </div>
      <Link href="/communities/new"
        className="mt-3 rounded-[18px] border border-dashed border-line py-3.5 text-center text-sm font-semibold text-muted hover:border-faint hover:text-ink">
        + New community
      </Link>
    </aside>
  );
}

export default function HomePage() {
  const { data: me } = useMe();
  const [search, setSearch] = useState("");
  const query = useDebouncedValue(search.trim());
  const searching = search.trim().length > 0;

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-8 px-4 pt-7 pb-16 sm:px-6">
      <header>
        <Eyebrow>
          <span suppressHydrationWarning>{greeting()}</span>, {me?.username ?? "there"} 👋
        </Eyebrow>
        <h1 className="mt-2 text-[32px] leading-tight font-bold tracking-tight sm:text-[40px]">What&apos;s the word?</h1>
        <p className="mt-1 text-[15px] text-muted">Your friends are making some bold predictions.</p>
      </header>

      <DailyBonusCard />
      <HeroCard />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-10">
          <div className="relative" role="search">
            <SearchIcon size={16} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-faint" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setSearch("")}
              placeholder="Search markets or communities"
              aria-label="Search markets or communities"
              className={`${inputClass} rounded-full py-3 pr-11 pl-11 [&::-webkit-search-cancel-button]:hidden`}
            />
            {searching && (
              <button type="button" onClick={() => setSearch("")} aria-label="Clear search"
                className="absolute top-1/2 right-3 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-raised hover:text-ink">
                ×
              </button>
            )}
          </div>
          {searching ? (
            // Until the debounce settles, keep showing the last results (or a loading state).
            <SearchResults query={query || search.trim()} />
          ) : (
            <>
              <FeedSection
                icon={<FlameIcon size={20} className="text-orange" />}
                title="Your friends are betting"
                visibility="PRIVATE"
              />
              <FeedSection
                icon={<GlobeIcon size={19} className="text-yes" />}
                title="Trending in public communities"
                action={<SectionLink href="/discover">See all</SectionLink>}
                visibility="PUBLIC"
              />
            </>
          )}
        </div>
        <YourCommunities />
      </div>
    </div>
  );
}
