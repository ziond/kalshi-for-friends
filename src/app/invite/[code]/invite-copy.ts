import type { PublicInvite } from "@/types";

/** Words for an invite's link preview (title, description, image), shared so they always match. */
export function inviteCopy(invite: PublicInvite | null) {
  if (!invite) {
    return {
      title: "You're invited to called it.",
      description: "Make predictions with your friends, stake points on what happens next, and prove you called it.",
      members: null,
    };
  }
  const { name, visibility, memberCount } = invite.community;
  const members = `${memberCount.toLocaleString("en-US")} ${memberCount === 1 ? "member" : "members"}`;
  return {
    title: `Join ${name} on called it.`,
    description: `You're invited to ${visibility === "PRIVATE" ? "a private group" : "a group"} with ${members}. Make your predictions and prove you called it.`,
    members,
  };
}
