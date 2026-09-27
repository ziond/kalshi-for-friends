import Link from "next/link";
import type { ReactNode } from "react";
import type { CommunitySummary } from "@/types";
import { ChevronRightIcon, GlobeIcon, LockIcon } from "./icons";
import { Avatar } from "./ui";

/** A community as a tappable list row: monogram, name, privacy · members, chevron. */
export function CommunityRow({
  community,
  trailing,
}: {
  community: Pick<CommunitySummary, "id" | "name" | "visibility" | "memberCount">;
  trailing?: ReactNode;
}) {
  const isPrivate = community.visibility === "PRIVATE";
  const Icon = isPrivate ? LockIcon : GlobeIcon;
  return (
    <Link href={`/communities/${community.id}`}
      className="flex items-center gap-3.5 rounded-[18px] border border-line bg-surface p-3.5 transition-colors hover:border-faint/60">
      <Avatar id={community.id} name={community.name} size={46} rounded="rounded-[13px]" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{community.name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted">
          <Icon size={12} className={isPrivate ? "text-purple" : "text-yes"} />
          {isPrivate ? "Private" : "Public"} · {community.memberCount.toLocaleString()} members
        </div>
      </div>
      {trailing ?? <ChevronRightIcon size={18} className="flex-none text-lime" />}
    </Link>
  );
}
