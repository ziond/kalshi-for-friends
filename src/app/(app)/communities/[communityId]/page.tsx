"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { TrophyIcon } from "@/components/icons";
import { MarketCard, MarketGrid } from "@/components/market-card";
import { Avatar, BackLink, Button, Card, EmptyState, ErrorNote, SectionHeader, Skeleton, VisibilityBadge, cn, inputClass } from "@/components/ui";
import { useCommunity, useJoinCommunity, useRotateInviteCode } from "@/hooks/use-communities";
import { useCommunityMarkets } from "@/hooks/use-markets";
import { useNow } from "@/hooks/use-now";
import { formatCountdown } from "@/lib/format";
import { INVITE_LINK_MINUTES, type CommunityDetail } from "@/types";

function InviteModal({ community, onClose }: { community: CommunityDetail; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const rotate = useRotateInviteCode(community.id);
  const link = `${window.location.origin}/invite/${community.inviteCode}`;
  const isCreator = community.myRole === "ADMIN";
  // Unknown if the API doesn't send it yet; then we can only say how long links last.
  const expiresAt = community.inviteExpiresAt ?? null;
  const now = useNow(Boolean(expiresAt));
  const expired = expiresAt ? Date.parse(expiresAt) <= now : false;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
  };

  const newLink = () => {
    setCopied(false);
    rotate.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal aria-labelledby="invite-title" onClick={(e) => e.stopPropagation()}
        className="flex w-[440px] max-w-full flex-col gap-4 rounded-[24px] border border-line bg-surface p-6">
        <h2 id="invite-title" className="text-xl font-bold tracking-tight">Invite people to {community.name}</h2>
        <p className="text-sm text-muted">
          Anyone with this link can join this private community. Links work for {INVITE_LINK_MINUTES} minutes, then
          you&apos;ll need a new one.
        </p>
        <div className="flex gap-2">
          <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Invite link"
            className={cn(inputClass, "text-xs", expired ? "text-faint line-through" : "text-muted")} />
          <Button className="rounded-xl" onClick={copy} disabled={expired}>{copied ? "Copied" : "Copy"}</Button>
        </div>

        <div role="status" className={cn("-mt-1 text-xs font-semibold", expired ? "text-no" : "text-muted")}>
          {rotate.isSuccess && !expired && "New link ready. The old one no longer works. "}
          {expiresAt
            ? expired ? "This link has expired." : <>Expires in <span className="tabular-nums">{formatCountdown(expiresAt, now)}</span></>
            : `This link works for ${INVITE_LINK_MINUTES} minutes after it's created.`}
        </div>

        {isCreator ? (
          <Button variant={expired ? "primary" : "secondary"} className="rounded-xl py-2.5" onClick={newLink}
            disabled={rotate.isPending}>
            {rotate.isPending ? "Getting a new link…" : "Get a new link"}
          </Button>
        ) : expired && (
          <p className="text-xs text-muted">Ask the community&apos;s creator for a new link.</p>
        )}
        <ErrorNote error={rotate.error} />

        {!expired && (
          <Link href={`/invite/${community.inviteCode}`} className="text-sm font-semibold text-lime hover:text-lime-hover">
            Preview what invitees see →
          </Link>
        )}
        <button onClick={onClose} className="mt-1 cursor-pointer text-center text-sm font-semibold text-muted hover:text-ink">
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
    return <div className="mx-auto max-w-[1180px] px-4 pt-7 sm:px-6"><Skeleton className="h-44" /></div>;
  }
  if (!community) {
    return <div className="mx-auto max-w-[1180px] px-4 pt-7 sm:px-6"><ErrorNote error={error} /></div>;
  }

  const isMember = community.myRole !== null;
  const canInvite = community.visibility === "PRIVATE" && community.inviteCode !== null;

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-4 pt-6 pb-16 sm:px-6">
      <BackLink href="/communities">Back to your groups</BackLink>
      <Card className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar id={community.id} name={community.name} size={60} rounded="rounded-[18px]" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">{community.name}</h1>
                <VisibilityBadge visibility={community.visibility} />
              </div>
              <div className="mt-1 text-sm text-muted">
                {community.memberCount.toLocaleString()} members · moderated by{" "}
                {community.moderators.map((m) => m.username).join(", ") || community.creator.username}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {isMember && (
              <Link href={`/communities/${community.id}/leaderboard`}
                className="flex items-center gap-1.5 rounded-full bg-raised px-4 py-2 text-[13px] font-semibold hover:bg-line">
                <TrophyIcon size={15} className="text-lime" />
                Leaderboard
              </Link>
            )}
            {canInvite && <Button variant="secondary" onClick={() => setInviteOpen(true)}>Invite people</Button>}
            {!isMember && community.visibility === "PUBLIC" && (
              <Button onClick={() => join.mutate(community.id)} disabled={join.isPending}>
                {join.isPending ? "Joining…" : "Join community"}
              </Button>
            )}
            {isMember && (
              <Link href={`/markets/new?community=${community.id}`}
                className="rounded-full bg-lime px-4 py-2 text-[13px] font-semibold text-on-lime hover:bg-lime-hover">
                + New market
              </Link>
            )}
          </div>
        </div>
        {community.description && <p className="max-w-[640px] text-[15px] leading-normal text-muted">{community.description}</p>}
        <ErrorNote error={join.error} />
      </Card>

      <section>
        <SectionHeader title={`Markets in ${community.name}`} />
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
