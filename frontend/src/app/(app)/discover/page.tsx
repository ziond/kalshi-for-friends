"use client";

import Link from "next/link";
import { Avatar, Card, Skeleton, cn } from "@/components/ui";
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
        "rounded-2xl px-3.5 py-1.5 text-xs",
        joined ? "cursor-default bg-yes/10 font-bold text-yes" : "cursor-pointer bg-brand font-extrabold text-white hover:bg-brand-hover",
      )}
    >
      {joined ? "Joined ✓" : join.isPending ? "Joining…" : "Join"}
    </button>
  );
}

export default function DiscoverPage() {
  const { data: communities, isLoading } = useDiscoverCommunities();

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 px-4 pt-7 pb-16 sm:px-8">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Discover communities</h1>
        <p className="mt-1 text-[13px] font-semibold text-muted">
          Public communities anyone can join. Private ones need an invite from a member.
        </p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-44" />)}
        {communities?.map((c) => (
          <Card key={c.id} className="flex flex-col gap-3 rounded-2xl p-[18px]">
            <div className="flex items-center gap-3">
              <Avatar id={c.id} name={c.name} size={40} rounded="rounded-[11px]" />
              <div className="min-w-0">
                <Link href={`/communities/${c.id}`} className="text-[15px] font-extrabold hover:text-brand">
                  {c.name}
                </Link>
                <div className="text-[11px] font-semibold text-faint">{c.memberCount.toLocaleString()} members</div>
              </div>
            </div>
            <p className="text-[13px] leading-snug font-semibold text-muted">{c.description}</p>
            <div className="mt-auto flex items-center justify-between gap-3 pt-1">
              <span className="text-[11px] font-semibold text-faint">
                Moderated by {c.moderators.map((m) => m.username).join(", ")}
              </span>
              <JoinButton community={c} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
