import Link from "next/link";
import { GlobeIcon, LockIcon } from "@/components/icons";
import { Card, Eyebrow } from "@/components/ui";
import { initial } from "@/lib/format";
import type { PublicInviteResult } from "@/lib/api/public-invite";
import { inviteCopy } from "./invite-copy";

/** The invite for someone who isn't signed in: what they're joining, then sign up or log in. */
export function SignedOutInvite({ code, result }: { code: string; result: PublicInviteResult }) {
  const next = encodeURIComponent(`/invite/${code}`);

  if (result.status === "invalid") {
    return (
      <Card className="flex w-full max-w-[480px] flex-col items-center gap-3 rounded-[26px] p-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight">That invite link isn&apos;t valid</h1>
        <p className="text-[15px] text-muted">It may have been replaced. Ask whoever sent it for a new one.</p>
        <Link href="/login" className="mt-2 text-sm font-semibold text-lime hover:text-lime-hover">
          Go to called it. →
        </Link>
      </Card>
    );
  }

  // "unavailable": we couldn't look the group up, so invite them in general terms.
  const invite = result.status === "ok" ? result.invite : null;
  const isPrivate = invite?.community.visibility === "PRIVATE";
  const Icon = isPrivate ? LockIcon : GlobeIcon;

  return (
    <Card className="flex w-full max-w-[480px] flex-col items-center gap-4 rounded-[26px] p-8 text-center">
      <span className="flex size-16 items-center justify-center rounded-[18px] bg-lime text-2xl font-extrabold text-on-lime">
        {invite ? initial(invite.community.name) : "C."}
      </span>
      <Eyebrow>You&apos;re invited to join</Eyebrow>
      <h1 className="text-[28px] leading-tight font-bold tracking-tight">
        {invite ? invite.community.name : "a group on called it."}
      </h1>
      {invite && (
        <div className="flex items-center gap-1.5 text-sm text-muted">
          <Icon size={13} className={isPrivate ? "text-purple" : "text-yes"} />
          {isPrivate ? "Private group" : "Public group"} · {inviteCopy(invite).members}
        </div>
      )}
      <p className="text-[15px] text-muted">
        Make predictions with your friends, stake points on what happens next, and prove you called it.
      </p>
      <Link href={`/register?next=${next}`}
        className="mt-2 w-full rounded-2xl bg-lime py-3.5 text-[15px] font-semibold text-on-lime hover:bg-lime-hover">
        Create an account to join
      </Link>
      <Link href={`/login?next=${next}`}
        className="w-full rounded-2xl bg-raised py-3.5 text-[15px] font-semibold hover:bg-line">
        I already have an account
      </Link>
      <p className="text-xs text-faint">Virtual points only · No real-money wagering</p>
    </Card>
  );
}
