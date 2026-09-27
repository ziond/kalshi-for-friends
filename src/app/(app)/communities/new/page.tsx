"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckIcon } from "@/components/icons";
import { Button, Card, ErrorNote, Field, Segmented, cn, inputClass } from "@/components/ui";
import { useCreateCommunity } from "@/hooks/use-communities";
import { useMe } from "@/hooks/use-me";
import { useUsernameChecks, type UsernameCheck } from "@/hooks/use-users";
import { ApiError } from "@/lib/api";
import type { Visibility } from "@/types";

const quote = (names: string[]) => names.map((n) => `“${n}”`).join(", ");

function ModeratorChip({ check, onRemove }: { check: UsernameCheck; onRemove: () => void }) {
  const { name, status, canonical } = check;
  return (
    <span
      title={status === "unverified" ? "Couldn't check this username; it will be checked when you create the community" : undefined}
      className={cn(
        "flex items-center gap-1.5 rounded-full py-1.5 pr-1.5 pl-3 text-xs font-semibold",
        status === "found" && "bg-live/12 text-live",
        status === "missing" && "border border-no/60 bg-no/10 text-no",
        (status === "checking" || status === "unverified") && "bg-raised text-muted",
      )}
    >
      {status === "found" && <CheckIcon size={12} strokeWidth={3} />}
      {status === "found" ? canonical : name}
      {status === "checking" && <span className="font-normal">· checking…</span>}
      {status === "missing" && <span className="font-normal">· not found</span>}
      <button type="button" onClick={onRemove} aria-label={`Remove ${name}`}
        className="flex size-5 cursor-pointer items-center justify-center rounded-full hover:bg-ink/10">
        ×
      </button>
    </span>
  );
}

function ModeratorPicker({
  checks,
  onAdd,
  onRemove,
}: {
  checks: UsernameCheck[];
  /** Returns why the name can't be added, if it can't. */
  onAdd: (name: string) => string | null;
  onRemove: (name: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const add = () => {
    const name = draft.trim();
    if (!name) return;
    setNotice(onAdd(name));
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {checks.map((check) => (
          <ModeratorChip key={check.name} check={check} onRemove={() => onRemove(check.name)} />
        ))}
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setNotice(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
          placeholder="Add username…"
          aria-label="Add a moderator by username"
          className="w-[160px] rounded-full border border-dashed border-line bg-transparent px-3 py-1.5 text-xs text-ink placeholder:text-faint outline-none focus:border-lime/70"
        />
      </div>
      {notice && <p className="text-xs text-muted">{notice}</p>}
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
  const { data: me } = useMe();
  const checks = useUsernameChecks(visibility === "PUBLIC" ? moderators : []);
  const missing = checks.filter((c) => c.status === "missing").map((c) => c.name);
  const checking = checks.some((c) => c.status === "checking");
  const fieldErrors = create.error instanceof ApiError ? create.error.fields : undefined;
  // Field errors shown next to their field; anything else goes in the note above the button.
  const unplacedError = !fieldErrors || Object.keys(fieldErrors).some((k) => k !== "name" && k !== "moderatorUsernames");

  const addModerator = (name: string) => {
    const lower = name.toLowerCase();
    if (me && lower === me.username.toLowerCase()) return "You're a moderator automatically.";
    if (moderators.some((m) => m.toLowerCase() === lower)) return `${name} is already on the list.`;
    setModerators([...moderators, name]);
    create.reset();
    return null;
  };

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
    <div className="mx-auto flex max-w-[600px] flex-col gap-5 px-4 pt-7 pb-16 sm:px-6">
      <header>
        <h1 className="text-[32px] leading-tight font-bold tracking-tight">New community</h1>
        <p className="mt-1 text-[15px] text-muted">Round up the group chat. Predictions start here.</p>
      </header>
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
            <span className="text-[13px] font-semibold">Privacy</span>
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
              <span className="text-[13px] font-semibold">Choose moderators</span>
              <span className="text-xs text-muted">
                Public communities need moderators to validate market outcomes for everyone. You&apos;re included
                automatically.
              </span>
              <ModeratorPicker
                checks={checks}
                onAdd={addModerator}
                onRemove={(name) => {
                  setModerators(moderators.filter((m) => m !== name));
                  create.reset();
                }}
              />
              {missing.length > 0 && (
                <p role="alert" className="text-xs font-semibold text-no">
                  {missing.length === 1 ? "No user called" : "No users called"} {quote(missing)}. Check the spelling or
                  remove {missing.length === 1 ? "them" : "those names"}.
                </p>
              )}
              {fieldErrors?.moderatorUsernames && (
                <p role="alert" className="text-xs font-semibold text-no">{fieldErrors.moderatorUsernames}</p>
              )}
            </div>
          ) : (
            <p className="rounded-xl bg-raised p-3 text-xs leading-normal text-muted">
              You&apos;ll pick a moderator for each market individually when you create it — different markets can have
              different moderators.
            </p>
          )}
          <ErrorNote error={unplacedError ? create.error : null} />
          <Button type="submit" disabled={create.isPending || missing.length > 0 || checking}
            className="rounded-2xl py-3.5 text-[15px]">
            {create.isPending ? "Creating…" : checking ? "Checking usernames…" : "Create community"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
