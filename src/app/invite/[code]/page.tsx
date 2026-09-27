import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getPublicInvite, inviteOf } from "@/lib/api/public-invite";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/auth/jwt";
import { inviteCopy } from "./invite-copy";
import { InviteView } from "./invite-view";
import { SignedOutInvite } from "./signed-out-invite";

// Title and description for link previews; the image comes from ./opengraph-image.tsx.
export async function generateMetadata({ params }: PageProps<"/invite/[code]">): Promise<Metadata> {
  const { code } = await params;
  const { title, description } = inviteCopy(inviteOf(await getPublicInvite(code)));
  return {
    title,
    description,
    openGraph: { title, description, type: "website", siteName: "called it." },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** Whether to show the signed-in invite. The client refreshes or redirects if the session turns out to be stale. */
async function hasSession() {
  if (process.env.NEXT_PUBLIC_API_MOCK !== "false") return true; // the mock has no sign-in
  const jar = await cookies();
  return jar.has(ACCESS_TOKEN_COOKIE) || jar.has(REFRESH_TOKEN_COOKIE);
}

export default async function InvitePage({ params }: PageProps<"/invite/[code]">) {
  const { code } = await params;
  if (await hasSession()) return <InviteView code={code} />;
  return <SignedOutInvite code={code} result={await getPublicInvite(code)} />;
}
