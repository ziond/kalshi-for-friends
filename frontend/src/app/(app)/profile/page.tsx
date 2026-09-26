"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar, EmptyState, cn } from "@/components/ui";
import { useCommunities } from "@/hooks/use-communities";
import { useLogout, useMe, useMyPositions } from "@/hooks/use-me";
import { ROLE_LABEL, formatMonthYear, initial } from "@/lib/format";
import type { Position } from "@/types";
import { useRouter } from "next/navigation";

function resultLabel(p: Position): { text: string; className: string } {
  switch (p.result) {
    case "WON":
      return { text: `Won +${p.payout} pts`, className: "text-yes" };
    case "LOST":
      return { text: `Lost ${p.amount} pts`, className: "text-no" };
    case "REFUNDED":
      return { text: "Refunded", className: "text-faint" };
    default:
      return { text: "Awaiting resolution", className: "text-gold" };
  }
}

function Row({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href}
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3 hover:bg-ink/3">
      {children}
    </Link>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2.5 text-[15px] font-extrabold">{title}</h2>
      <div className="flex flex-col gap-2">{children}</div>
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
    <div className="mx-auto flex max-w-[900px] flex-col gap-7 px-4 pt-7 pb-16 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex size-16 items-center justify-center rounded-full bg-blue text-2xl font-extrabold text-white">
            {me ? initial(me.username) : ""}
          </span>
          <div>
            <h1 className="text-[22px] font-extrabold">{me?.username}</h1>
            {me && (
              <div className="text-[13px] font-semibold text-faint">
                Member since {formatMonthYear(me.createdAt)} · {me.balance.toLocaleString()} pts
                {me.totalPredictions > 0 && ` · ${Math.round(me.accuracy * 100)}% accuracy`}
              </div>
            )}
          </div>
        </div>
        <button onClick={() => logout.mutate(undefined, { onSuccess: () => router.push("/login") })}
          className="cursor-pointer text-[13px] font-bold text-faint hover:text-ink">
          Log out
        </button>
      </div>

      <Section title="Your communities">
        {communities?.map((c) => (
          <Row key={c.id} href={`/communities/${c.id}`}>
            <span className="flex items-center gap-2.5">
              <Avatar id={c.id} name={c.name} size={28} rounded="rounded-lg" />
              <span className="text-[13px] font-bold">{c.name}</span>
            </span>
            <span className="text-[11px] font-bold text-faint">{c.myRole ? ROLE_LABEL[c.myRole] : ""}</span>
          </Row>
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
              <span className="text-[13px] font-bold">{p.market.title}</span>
              <span className={cn("text-xs font-extrabold", result.className)}>
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
