"use client";

import Link from "next/link";
import { CommunityRow } from "@/components/community-row";
import { EmptyState, SectionLink, Skeleton, VisibilityBadge } from "@/components/ui";
import { useCommunities } from "@/hooks/use-communities";
import { ROLE_LABEL } from "@/lib/format";

export default function CommunitiesPage() {
  const { data: communities, isLoading } = useCommunities();

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-4 pt-7 pb-16 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] leading-tight font-bold tracking-tight sm:text-[40px]">Your groups</h1>
          <p className="mt-1 text-[15px] text-muted">The people you love to be right about.</p>
        </div>
        <Link href="/communities/new"
          className="rounded-full bg-lime px-4 py-2.5 text-sm font-semibold text-on-lime hover:bg-lime-hover">
          + New community
        </Link>
      </header>

      <div className="flex flex-col gap-2.5">
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-[76px]" />)}
        {communities?.map((c) => (
          <CommunityRow key={c.id} community={c}
            trailing={c.myRole && c.myRole !== "MEMBER" ? (
              <span className="flex-none rounded-full bg-raised px-2.5 py-1 text-[11px] font-semibold text-muted">
                {ROLE_LABEL[c.myRole]}
              </span>
            ) : undefined} />
        ))}
        {communities?.length === 0 && <EmptyState>You haven&apos;t joined any communities yet.</EmptyState>}
      </div>

      <div className="flex items-center justify-between gap-3 rounded-[18px] border border-line bg-surface p-5">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            Looking for more? <VisibilityBadge visibility="PUBLIC" />
          </div>
          <p className="mt-1 text-sm text-muted">Public communities anyone can join.</p>
        </div>
        <SectionLink href="/discover">Discover</SectionLink>
      </div>
    </div>
  );
}
