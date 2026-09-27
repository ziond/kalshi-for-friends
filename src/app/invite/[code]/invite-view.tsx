"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, Button, Card, ErrorNote, Skeleton } from "@/components/ui";
import { useInvitePreview, useJoinByInvite } from "@/hooks/use-communities";

/** The invite for a signed-in user: preview the community and accept. */
export function InviteView({ code }: { code: string }) {
  const router = useRouter();
  const { data: invite, error, isLoading } = useInvitePreview(code);
  const join = useJoinByInvite();

  return (
    <div className="w-full max-w-[480px]">
      {isLoading && <Skeleton className="h-72" />}
      {!isLoading && !invite && <ErrorNote error={error} />}
      {invite && (
        <Card className="flex flex-col items-center gap-4 rounded-[26px] p-8 text-center">
          <Avatar id={invite.community.id} name={invite.community.name} size={64} rounded="rounded-[18px]" />
          <div className="text-xs font-semibold tracking-[0.08em] text-lime uppercase">You&apos;ve been invited to join</div>
          <h1 className="text-[28px] leading-tight font-bold tracking-tight">{invite.community.name}</h1>
          <p className="text-[15px] text-muted">{invite.community.description}</p>
          <div className="text-[13px] text-faint">
            {invite.community.memberCount.toLocaleString()} members
            {invite.community.moderators.length > 0 &&
              ` · moderated by ${invite.community.moderators.map((m) => m.username).join(", ")}`}
          </div>
          {invite.alreadyMember ? (
            <Link href={`/communities/${invite.community.id}`}
              className="mt-2 rounded-2xl bg-raised px-6 py-3.5 text-[15px] font-semibold hover:bg-line">
              You&apos;re already a member — open it
            </Link>
          ) : (
            <Button className="mt-2 w-full rounded-2xl py-3.5 text-[15px]" disabled={join.isPending}
              onClick={() => join.mutate({ inviteCode: invite.inviteCode },
                { onSuccess: (c) => router.push(`/communities/${c.id}`) })}>
              {join.isPending ? "Joining…" : "Accept & join"}
            </Button>
          )}
          <ErrorNote error={join.error} />
        </Card>
      )}
    </div>
  );
}
