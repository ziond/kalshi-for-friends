"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { CommunityRow } from "@/components/community-row";
import { ArrowUpRightIcon, FlameIcon, GlobeIcon, SearchIcon, TrendingUpIcon } from "@/components/icons";
import { MarketCard, MarketGrid } from "@/components/market-card";
import { EmptyState, Eyebrow, SectionHeader, SectionLink, Skeleton, inputClass } from "@/components/ui";
import { useCommunities } from "@/hooks/use-communities";
import { useMarketFeed } from "@/hooks/use-markets";
import { useMe } from "@/hooks/use-me";
import { greeting } from "@/lib/format";
import type { MarketSummary, Visibility } from "@/types";

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
  search,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
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
        <EmptyState>{q ? "No markets match your search." : "No open markets yet."}</EmptyState>
      )}
    </section>
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

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-8 px-4 pt-7 pb-16 sm:px-6">
      <header>
        <Eyebrow>
          <span suppressHydrationWarning>{greeting()}</span>, {me?.username ?? "there"} 👋
        </Eyebrow>
        <h1 className="mt-2 text-[32px] leading-tight font-bold tracking-tight sm:text-[40px]">What&apos;s the word?</h1>
        <p className="mt-1 text-[15px] text-muted">Your friends are making some bold predictions.</p>
      </header>

      <HeroCard />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-10">
          <div className="relative">
            <SearchIcon size={16} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search markets or communities"
              className={`${inputClass} rounded-full py-3 pl-11`}
            />
          </div>
          <FeedSection
            icon={<FlameIcon size={20} className="text-orange" />}
            title="Your friends are betting"
            visibility="PRIVATE"
            search={search}
          />
          <FeedSection
            icon={<GlobeIcon size={19} className="text-yes" />}
            title="Trending in public communities"
            action={<SectionLink href="/discover">See all</SectionLink>}
            visibility="PUBLIC"
            search={search}
          />
        </div>
        <YourCommunities />
      </div>
    </div>
  );
}
