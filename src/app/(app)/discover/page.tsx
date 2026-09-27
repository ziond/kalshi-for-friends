"use client";

import Link from "next/link";
import { GlobeIcon } from "@/components/icons";
import { Avatar, Skeleton, cn } from "@/components/ui";
import { useDiscoverCommunities, useJoinCommunity } from "@/hooks/use-communities";
import type { CommunitySummary } from "@/types";

function JoinButton({ community }: { community: CommunitySummary }) {
  const join = useJoinCommunity();
  const joined = community.myRole !== null;

  return (
    <button
      disabled={joined || join.isPending}
      onClick={() => join.mutate(community.id)}
      className={cn(
        "flex-none rounded-full px-4 py-2 text-[13px] font-semibold",
        joined ? "cursor-default bg-live/12 text-live" : "cursor-pointer bg-lime text-on-lime hover:bg-lime-hover",
      )}
    >
      {joined ? "Joined ✓" : join.isPending ? "Joining…" : "Join"}
    </button>
  );
}

export default function DiscoverPage() {
  const { data: communities, isLoading } = useDiscoverCommunities();

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-4 pt-7 pb-16 sm:px-6">
      <header>
        <h1 className="text-[32px] leading-tight font-bold tracking-tight sm:text-[40px]">Discover</h1>
        <p className="mt-1 text-[15px] text-muted">
          Public communities anyone can join. Private ones need an invite from a member.
        </p>
      </header>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-4">
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-48" />)}
        {communities?.map((c) => (
          <article key={c.id} className="flex flex-col gap-3.5 rounded-[20px] border border-line bg-surface p-5">
            <div className="flex items-center gap-3.5">
              <Avatar id={c.id} name={c.name} size={46} rounded="rounded-[13px]" />
              <div className="min-w-0">
                <Link href={`/communities/${c.id}`} className="font-semibold hover:text-lime">
                  {c.name}
                </Link>
                <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted">
                  <GlobeIcon size={12} className="text-yes" />
                  {c.memberCount.toLocaleString()} members · {c.openMarketCount} live
                </div>
              </div>
            </div>
            {c.description && <p className="text-sm leading-snug text-muted">{c.description}</p>}
            <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3.5">
              <span className="min-w-0 truncate text-xs text-faint">
                Moderated by {c.moderators.map((m) => m.username).join(", ")}
              </span>
              <JoinButton community={c} />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
