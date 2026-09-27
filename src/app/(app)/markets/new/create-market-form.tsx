"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, ErrorNote, Field, Segmented, inputClass } from "@/components/ui";
import { useCommunities, useCommunityMembers } from "@/hooks/use-communities";
import { useCreateMarket } from "@/hooks/use-markets";
import { useMe } from "@/hooks/use-me";
import { ApiError } from "@/lib/api";
import type { ID, MarketType } from "@/types";

function OutcomeFields({ value, onChange }: { value: string[]; onChange: (outcomes: string[]) => void }) {
  return (
    <div className="flex flex-col gap-2">
      {value.map((outcome, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={outcome}
            onChange={(e) => onChange(value.map((o, j) => (j === i ? e.target.value : o)))}
            placeholder={`Outcome ${i + 1}`}
            aria-label={`Outcome ${i + 1}`}
            className={`${inputClass} py-2`}
          />
          <button type="button" aria-label={`Remove outcome ${i + 1}`} disabled={value.length <= 2}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            className="flex size-[42px] flex-none cursor-pointer items-center justify-center rounded-xl bg-no/12 text-sm font-bold text-no disabled:cursor-not-allowed disabled:opacity-40">
            ×
          </button>
        </div>
      ))}
      {value.length < 10 && (
        <button type="button" onClick={() => onChange([...value, ""])}
          className="mt-1 w-fit cursor-pointer text-[13px] font-semibold text-lime hover:text-lime-hover">
          + Add outcome
        </button>
      )}
    </div>
  );
}

export function CreateMarketForm({ initialCommunityId }: { initialCommunityId?: ID }) {
  const router = useRouter();
  const { data: me } = useMe();
  const { data: communities } = useCommunities();
  const create = useCreateMarket();

  const [pickedCommunityId, setCommunityId] = useState<ID | undefined>(initialCommunityId);
  const [title, setTitle] = useState("");
  const [marketType, setMarketType] = useState<MarketType>("BINARY");
  const [outcomes, setOutcomes] = useState(["", "", ""]);
  const [deadline, setDeadline] = useState("");
  const [moderatorId, setModeratorId] = useState<ID | undefined>();

  const communityId = pickedCommunityId ?? communities?.[0]?.id;
  const community = communities?.find((c) => c.id === communityId);
  const isPrivate = community?.visibility === "PRIVATE";
  const { data: members } = useCommunityMembers(isPrivate ? communityId : undefined);
  const fieldErrors = create.error instanceof ApiError ? create.error.fields : undefined;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!communityId) return;
    create.mutate(
      {
        communityId,
        body: {
          title,
          marketType,
          deadline: deadline ? new Date(deadline).toISOString() : "",
          options: marketType === "MULTIPLE_CHOICE" ? outcomes : undefined,
          moderatorId: isPrivate ? moderatorId ?? me?.id : undefined,
        },
      },
      { onSuccess: (market) => router.push(`/markets/${market.id}`) },
    );
  };

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-[18px] p-6">
        <Field label="Community">
          <select value={communityId ?? ""} onChange={(e) => { setCommunityId(Number(e.target.value)); setModeratorId(undefined); }}
            className={`${inputClass} font-semibold`}>
            {communities?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Market question" error={fieldErrors?.title}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={255}
            placeholder="e.g. Will it snow before Nov 1?" className={inputClass} />
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold">Outcome type</span>
          <Segmented
            value={marketType}
            onChange={setMarketType}
            options={[
              { value: "BINARY", label: "Yes / No" },
              { value: "MULTIPLE_CHOICE", label: "Multiple outcomes" },
            ]}
          />
        </div>
        {marketType === "MULTIPLE_CHOICE" && (
          <Field label="Outcomes" error={fieldErrors?.options}>
            <OutcomeFields value={outcomes} onChange={setOutcomes} />
          </Field>
        )}
        <Field label="Closes" error={fieldErrors?.deadline}>
          <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} required
            className={inputClass} />
        </Field>

        {isPrivate ? (
          <Field label="Choose a moderator for this market"
            hint="This moderator can validate or nullify this specific market.">
            <select value={moderatorId ?? me?.id ?? ""} onChange={(e) => setModeratorId(Number(e.target.value))}
              className={`${inputClass} font-semibold`}>
              {members?.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.username}</option>)}
            </select>
          </Field>
        ) : community ? (
          <p className="rounded-xl bg-raised p-3 text-xs leading-normal text-muted">
            Moderated by <strong>{community.moderators.map((m) => m.username).join(", ")}</strong> — the
            community&apos;s moderators handle validation for all its markets.
          </p>
        ) : null}

        <ErrorNote error={fieldErrors ? null : create.error} />
        <Button type="submit" disabled={!communityId || create.isPending} className="rounded-2xl py-3.5 text-[15px]">
          {create.isPending ? "Creating…" : "Create market"}
        </Button>
      </form>
    </Card>
  );
}
