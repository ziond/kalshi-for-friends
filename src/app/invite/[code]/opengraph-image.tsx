import { getPublicInvite, inviteOf } from "@/lib/api/public-invite";
import { OG_SIZE, renderShareCard } from "@/lib/og";
import { inviteCopy } from "./invite-copy";

// The picture chat apps show when an invite link is shared.
export const alt = "You're invited to join a group on called it.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const invite = inviteOf(await getPublicInvite(code));

  if (!invite) {
    return renderShareCard({
      eyebrow: "You're invited",
      title: "Your friends are waiting.",
      detail: "Make predictions together and prove you called it.",
      cta: "Tap to join →",
    });
  }
  return renderShareCard({
    eyebrow: invite.community.visibility === "PRIVATE" ? "Private group invite" : "Group invite",
    kicker: "You're invited to join",
    title: invite.community.name,
    detail: `${inviteCopy(invite).members} making predictions · Virtual points only`,
    cta: "Tap to join →",
  });
}
