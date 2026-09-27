// Small shared building blocks that match the "called it." design.

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { ID, Visibility } from "@/types";
import { avatarColor, initial } from "@/lib/format";
import { ArrowLeftIcon, GlobeIcon, LockIcon } from "./icons";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-[20px] border border-line bg-surface", className)} {...props} />;
}

type ButtonVariant = "primary" | "secondary" | "outline" | "dark" | "danger";

export const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-lime text-on-lime hover:bg-lime-hover",
  secondary: "bg-raised text-ink hover:bg-line",
  outline: "border border-line text-ink hover:bg-raised",
  dark: "bg-canvas text-lime hover:bg-canvas/85",
  danger: "border border-no/60 text-no hover:bg-no/10",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cn(
        "cursor-pointer rounded-full px-4 py-2 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

/** Square monogram tinted with a stable colour derived from the id. */
export function Avatar({
  id,
  name,
  size = 30,
  rounded = "rounded-[9px]",
}: {
  id: ID;
  name: string;
  size?: number;
  rounded?: string;
}) {
  const color = avatarColor(id);
  return (
    <span
      className={cn("flex flex-none items-center justify-center font-bold", rounded)}
      style={{ width: size, height: size, background: `${color}2e`, color, fontSize: size * 0.42 }}
    >
      {initial(name)}
    </span>
  );
}

/** Community name chip: purple with a lock for private, green with a globe for public. */
export function CommunityChip({
  name,
  visibility,
  className,
}: {
  name: string;
  visibility: Visibility;
  className?: string;
}) {
  const isPrivate = visibility === "PRIVATE";
  const Icon = isPrivate ? LockIcon : GlobeIcon;
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        isPrivate ? "bg-purple/15 text-purple" : "bg-yes/12 text-yes",
        className,
      )}
    >
      <Icon size={12} className="flex-none" />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function VisibilityBadge({ visibility, className }: { visibility: Visibility; className?: string }) {
  const isPrivate = visibility === "PRIVATE";
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-semibold",
        isPrivate ? "bg-purple/15 text-purple" : "bg-yes/12 text-yes",
        className,
      )}
    >
      {isPrivate ? "Private" : "Public"}
    </span>
  );
}

/** Small uppercase status pill with a dot, e.g. LIVE. */
export function StatusPill({ tone, children }: { tone: "live" | "muted" | "no" | "orange"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex flex-none items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase",
        tone === "live" && "bg-live/12 text-live",
        tone === "muted" && "bg-raised text-muted",
        tone === "no" && "bg-no/12 text-no",
        tone === "orange" && "bg-orange/12 text-orange",
      )}
    >
      <span className="size-2 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="group flex w-fit items-center gap-2.5 text-sm font-medium text-muted hover:text-ink">
      <ArrowLeftIcon size={16} className="text-lime" />
      {children}
    </Link>
  );
}

/** Pill switch: the selected option is lime, the rest sit on the raised surface. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode; ariaLabel?: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          aria-label={opt.ariaLabel}
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex-1 cursor-pointer rounded-full px-4 py-2.5 text-[13px] font-semibold whitespace-nowrap transition-colors sm:flex-none",
            value === opt.value ? "bg-lime text-on-lime" : "bg-raised text-muted hover:text-ink",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold">{label}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
      {children}
      {error && <span className="text-xs font-semibold text-no">{error}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-transparent bg-raised px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none focus:border-lime/70";

/** Uppercase lime label above a heading, e.g. "GOOD EVENING, JORDAN". */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-xs font-semibold tracking-[0.08em] text-lime uppercase", className)}>{children}</div>;
}

export function SectionHeader({ title, icon, action }: { title: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3.5 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
        {icon}
        {title}
      </h2>
      {action}
    </div>
  );
}

/** Lime "See all →" style link used in section headers. */
export function SectionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="flex flex-none items-center gap-1 text-[13px] font-semibold text-lime hover:text-lime-hover">
      {children} <span aria-hidden>→</span>
    </Link>
  );
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("text-base font-bold", className)}>{children}</h2>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</p>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-2xl bg-surface", className)} />;
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : "Something went wrong";
  return <p className="rounded-xl bg-no/12 px-3 py-2 text-xs font-semibold text-no">{message}</p>;
}

/** Horizontal probability bar. */
export function ProbabilityBar({ value, color, className }: { value: number; color: string; className?: string }) {
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-raised", className)}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.round(value * 100)}%`, background: color }} />
    </div>
  );
}
