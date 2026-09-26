"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, ErrorNote, Field, Segmented, inputClass } from "@/components/ui";
import { useCreateCommunity } from "@/hooks/use-communities";
import { ApiError } from "@/lib/api";
import type { Visibility } from "@/types";

function ModeratorPicker({ value, onChange }: { value: string[]; onChange: (names: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const name = draft.trim();
    if (name && !value.includes(name)) onChange([...value, name]);
    setDraft("");
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {value.map((name) => (
        <button key={name} type="button" onClick={() => onChange(value.filter((n) => n !== name))}
          className="cursor-pointer rounded-2xl bg-ink/6 px-3 py-1.5 text-xs font-bold hover:bg-no/10" title="Remove">
          {name} ×
        </button>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder="Add username…"
        className="w-[130px] rounded-2xl border border-dashed border-ink/20 px-3 py-1.5 text-xs font-semibold outline-none focus:border-brand"
      />
    </div>
  );
}

export default function CreateCommunityPage() {
  const router = useRouter();
  const create = useCreateCommunity();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("PUBLIC");
  const [moderators, setModerators] = useState<string[]>([]);
  const fieldErrors = create.error instanceof ApiError ? create.error.fields : undefined;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      {
        name,
        description: description || undefined,
        visibility,
        moderatorUsernames: visibility === "PUBLIC" ? moderators : undefined,
      },
      { onSuccess: (community) => router.push(`/communities/${community.id}`) },
    );
  };

  return (
    <div className="mx-auto flex max-w-[600px] flex-col gap-5 px-4 pt-7 pb-16 sm:px-8">
      <h1 className="text-2xl font-extrabold">Create a community</h1>
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-[18px] p-6">
          <Field label="Community name" error={fieldErrors?.name}>
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100}
              placeholder="e.g. Fantasy Football Legends" className={inputClass} />
          </Field>
          <Field label="Description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this community about?" className={`${inputClass} min-h-[70px] resize-y`} />
          </Field>
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-bold">Privacy</span>
            <Segmented
              value={visibility}
              onChange={setVisibility}
              options={[
                { value: "PUBLIC", label: "Public — anyone can join" },
                { value: "PRIVATE", label: "Private — invite only" },
              ]}
            />
          </div>
          {visibility === "PUBLIC" ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-bold">Choose moderators</span>
              <span className="text-xs font-semibold text-faint">
                Public communities need moderators to validate market outcomes for everyone. You&apos;re included
                automatically.
              </span>
              <ModeratorPicker value={moderators} onChange={setModerators} />
            </div>
          ) : (
            <p className="rounded-[10px] bg-canvas p-3 text-xs font-semibold text-faint">
              You&apos;ll pick a moderator for each market individually when you create it — different markets can have
              different moderators.
            </p>
          )}
          <ErrorNote error={fieldErrors ? null : create.error} />
          <Button type="submit" disabled={create.isPending} className="py-3 text-sm font-extrabold">
            {create.isPending ? "Creating…" : "Create community"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
