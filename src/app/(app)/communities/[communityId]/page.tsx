"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { MarketCard, MarketGrid } from "@/components/market-card";
import { Avatar, BackLink, Button, Card, EmptyState, ErrorNote, Skeleton, VisibilityBadge } from "@/components/ui";
import { useCommunity, useJoinCommunity } from "@/hooks/use-communities";
import { useCommunityMarkets } from "@/hooks/use-markets";
import type { CommunityDetail } from "@/types";

function InviteModal({ community, onClose }: { community: CommunityDetail; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/invite/${community.inviteCode}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal aria-labelledby="invite-title" onClick={(e) => e.stopPropagation()}
        className="flex w-[420px] max-w-full flex-col gap-3.5 rounded-[18px] bg-white p-6">
        <h2 id="invite-title" className="text-[17px] font-extrabold">Invite people to {community.name}</h2>
        <p className="text-[13px] font-semibold text-muted">Anyone with this link can join this private community.</p>
        <div className="flex gap-2">
          <input readOnly value={link} onFocus={(e) => e.target.select()}
            className="flex-1 rounded-[10px] border border-ink/15 px-3 py-2.5 text-xs font-semibold text-muted" />
          <Button variant="dark" className="rounded-[10px]" onClick={copy}>{copied ? "Copied" : "Copy"}</Button>
        </div>
        <Link href={`/invite/${community.inviteCode}`} className="text-xs font-bold text-brand">
          Preview what invitees see →
        </Link>
        <button onClick={onClose} className="mt-1.5 cursor-pointer text-center text-[13px] font-bold text-faint">
          Close
        </button>
      </div>
    </div>
  );
}

export default function CommunityPage() {
  const communityId = Number(useParams<{ communityId: string }>().communityId);
  const { data: community, error, isLoading } = useCommunity(communityId);
  const { data: markets } = useCommunityMarkets(communityId);
  const join = useJoinCommunity();
  const [inviteOpen, setInviteOpen] = useState(false);

  if (isLoading) {
    return <div className="mx-auto max-w-[1100px] px-4 pt-7 sm:px-8"><Skeleton className="h-44" /></div>;
  }
  if (!community) {
    return <div className="mx-auto max-w-[1100px] px-4 pt-7 sm:px-8"><ErrorNote error={error} /></div>;
  }

  const isMember = community.myRole !== null;
  const canInvite = community.visibility === "PRIVATE" && community.inviteCode !== null;

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 px-4 pt-7 pb-16 sm:px-8">
      <BackLink href="/">Back to home</BackLink>
      <Card className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <Avatar id={community.id} name={community.name} size={52} rounded="rounded-[14px]" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold">{community.name}</h1>
                <VisibilityBadge visibility={community.visibility} />
              </div>
              <div className="mt-0.5 text-xs font-semibold text-faint">
                {community.memberCount.toLocaleString()} members · moderated by{" "}
                {community.moderators.map((m) => m.username).join(", ") || community.creator.username}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {canInvite && <Button variant="outline" onClick={() => setInviteOpen(true)}>Invite people</Button>}
            {!isMember && community.visibility === "PUBLIC" && (
              <Button onClick={() => join.mutate(community.id)} disabled={join.isPending}>
                {join.isPending ? "Joining…" : "Join community"}
              </Button>
            )}
            {isMember && (
              <Link href={`/markets/new?community=${community.id}`}
                className="rounded-full bg-brand px-4 py-2 text-[13px] font-bold text-white hover:bg-brand-hover">
                + New market
              </Link>
            )}
          </div>
        </div>
        <p className="max-w-[640px] text-[13px] leading-normal font-semibold text-muted">{community.description}</p>
        <ErrorNote error={join.error} />
      </Card>

      <section>
        <h2 className="mb-3.5 text-base font-extrabold">Markets in {community.name}</h2>
        {markets?.items.length ? (
          <MarketGrid>{markets.items.map((m) => <MarketCard key={m.id} market={m} />)}</MarketGrid>
        ) : (
          <EmptyState>No markets yet — start one.</EmptyState>
        )}
      </section>

      {inviteOpen && <InviteModal community={community} onClose={() => setInviteOpen(false)} />}
    </div>
  );
}
