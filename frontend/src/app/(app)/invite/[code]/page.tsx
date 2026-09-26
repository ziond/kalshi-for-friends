"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Avatar, Button, Card, ErrorNote, Skeleton } from "@/components/ui";
import { useInvitePreview, useJoinByInvite } from "@/hooks/use-communities";

export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { data: invite, error, isLoading } = useInvitePreview(code);
  const join = useJoinByInvite();

  return (
    <div className="mx-auto my-15 max-w-[480px] px-4 sm:px-8">
      {isLoading && <Skeleton className="h-72" />}
      {!isLoading && !invite && <ErrorNote error={error} />}
      {invite && (
        <Card className="flex flex-col items-center gap-4 rounded-[20px] p-8 text-center">
          <Avatar id={invite.community.id} name={invite.community.name} size={56} rounded="rounded-2xl" />
          <div className="text-xs font-semibold text-faint">You&apos;ve been invited to join</div>
          <h1 className="text-xl font-extrabold">{invite.community.name}</h1>
          <p className="text-[13px] font-semibold text-muted">{invite.community.description}</p>
          <div className="text-xs font-bold text-faint">
            {invite.community.memberCount.toLocaleString()} members
            {invite.community.moderators.length > 0 &&
              ` · moderated by ${invite.community.moderators.map((m) => m.username).join(", ")}`}
          </div>
          {invite.alreadyMember ? (
            <Link href={`/communities/${invite.community.id}`}
              className="mt-1.5 rounded-full bg-ink px-6 py-2.5 text-sm font-extrabold text-white">
              You&apos;re already a member — open it
            </Link>
          ) : (
            <Button className="mt-1.5 px-[26px] py-[11px] text-sm font-extrabold" disabled={join.isPending}
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
