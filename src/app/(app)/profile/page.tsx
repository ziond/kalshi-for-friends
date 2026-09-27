"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CommunityRow } from "@/components/community-row";
import { ChevronRightIcon } from "@/components/icons";
import { EmptyState, SectionHeader, cn } from "@/components/ui";
import { useCommunities } from "@/hooks/use-communities";
import { useLogout, useMe, useMyPositions } from "@/hooks/use-me";
import { ROLE_LABEL, formatMonthYear, initial } from "@/lib/format";
import type { Position } from "@/types";
import { useRouter } from "next/navigation";

function resultLabel(p: Position): { text: string; className: string } {
  switch (p.result) {
    case "WON":
      return { text: `Won +${p.payout} pts`, className: "text-live" };
    case "LOST":
      return { text: `Lost ${p.amount} pts`, className: "text-no" };
    case "REFUNDED":
      return { text: "Refunded", className: "text-faint" };
    default:
      return { text: "Awaiting resolution", className: "text-orange" };
  }
}

function Row({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href}
      className="flex items-center gap-3 rounded-[18px] border border-line bg-surface px-4 py-3.5 transition-colors hover:border-faint/60">
      <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1">{children}</span>
      <ChevronRightIcon size={16} className="flex-none text-faint" />
    </Link>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-[18px] border border-line bg-surface p-4">
      <div className="text-xs font-medium tracking-[0.06em] text-muted uppercase">{label}</div>
      <div className={cn("mt-1.5 text-2xl font-bold tabular-nums", accent && "text-lime")}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <SectionHeader title={title} />
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { data: me } = useMe();
  const { data: communities } = useCommunities();
  const { data: open } = useMyPositions({ status: "open" });
  const { data: settled } = useMyPositions({ status: "settled" });
  const logout = useLogout();

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-8 px-4 pt-7 pb-16 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex size-16 items-center justify-center rounded-full bg-purple text-2xl font-bold text-on-lime">
            {me ? initial(me.username) : ""}
          </span>
          <div>
            <h1 className="text-[28px] leading-tight font-bold tracking-tight">{me?.username}</h1>
            {me && <div className="text-sm text-muted">Member since {formatMonthYear(me.createdAt)}</div>}
          </div>
        </div>
        <button onClick={() => logout.mutate(undefined, { onSuccess: () => router.push("/login") })}
          className="cursor-pointer rounded-full border border-line px-4 py-2 text-sm font-semibold text-muted hover:text-ink">
          Log out
        </button>
      </div>

      {me && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Balance" value={`${me.balance.toLocaleString()}`} accent />
          <Stat label="Accuracy" value={me.totalPredictions > 0 ? `${Math.round(me.accuracy * 100)}%` : "—"} />
          <Stat label="Called it" value={`${me.correctPredictions}/${me.totalPredictions}`} />
          <Stat label="Score" value={me.predictionScore.toLocaleString()} />
        </div>
      )}

      <Section title="Your communities">
        {communities?.map((c) => (
          <CommunityRow key={c.id} community={c}
            trailing={<span className="flex-none rounded-full bg-raised px-2.5 py-1 text-[11px] font-semibold text-muted">
              {c.myRole ? ROLE_LABEL[c.myRole] : ""}
            </span>} />
        ))}
      </Section>

      <Section title="Open positions">
        {open?.items.map((p) => (
          <Row key={p.id} href={`/markets/${p.market.id}`}>
            <span className="text-[13px] font-bold">{p.market.title}</span>
            <span className="text-xs font-bold text-muted">{p.optionText} · {p.amount} pts</span>
          </Row>
        ))}
        {open?.items.length === 0 && <EmptyState>No open bets.</EmptyState>}
      </Section>

      <Section title="Bet history">
        {settled?.items.map((p) => {
          const result = resultLabel(p);
          return (
            <Row key={p.id} href={`/markets/${p.market.id}`}>
              <span className="text-sm font-semibold">{p.market.title}</span>
              <span className={cn("text-[13px] font-semibold", result.className)}>
                {p.optionText} · {result.text}
              </span>
            </Row>
          );
        })}
        {settled?.items.length === 0 && <EmptyState>No settled bets yet.</EmptyState>}
      </Section>
    </div>
  );
}
