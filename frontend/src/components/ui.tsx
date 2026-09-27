// Small shared building blocks that match the Huddle design.

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { ID, Visibility } from "@/types";
import { avatarColor, initial } from "@/lib/format";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-[18px] border border-line bg-white", className)} {...props} />;
}

type ButtonVariant = "primary" | "outline" | "dark" | "danger";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover",
  outline: "border border-ink/15 bg-white hover:bg-hover",
  dark: "bg-ink text-white hover:bg-ink/85",
  danger: "border-[1.5px] border-no bg-white text-brand-dark hover:bg-[#fdedec]",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cn(
        "cursor-pointer rounded-full px-4 py-2 text-[13px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

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
  return (
    <span
      className={cn("flex flex-none items-center justify-center font-extrabold text-white", rounded)}
      style={{ width: size, height: size, background: avatarColor(id), fontSize: size * 0.42 }}
    >
      {initial(name)}
    </span>
  );
}

export function VisibilityBadge({ visibility, className }: { visibility: Visibility; className?: string }) {
  const isPrivate = visibility === "PRIVATE";
  return (
    <span
      className={cn(
        "rounded-xl px-2.5 py-1 text-[10px] font-extrabold",
        isPrivate ? "bg-private/12 text-private" : "bg-yes/12 text-yes",
        className,
      )}
    >
      {isPrivate ? "Private" : "Public"}
    </span>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-xs font-bold text-faint hover:text-muted">
      ← {children}
    </Link>
  );
}

/** Two-option pill switch used for privacy and outcome type. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-2 rounded-xl bg-canvas p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex-1 cursor-pointer rounded-[9px] px-2.5 py-2 text-xs font-bold",
            value === opt.value ? "bg-white text-ink shadow-[0_1px_3px_rgba(28,27,25,0.12)]" : "text-faint",
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
      <span className="text-[13px] font-bold">{label}</span>
      {hint && <span className="text-xs font-semibold text-faint">{hint}</span>}
      {children}
      {error && <span className="text-xs font-bold text-no">{error}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-[10px] border border-ink/15 bg-white px-3.5 py-2.5 text-[13px] font-semibold outline-none focus:border-brand";

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("text-base font-extrabold", className)}>{children}</h2>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="text-[13px] font-semibold text-faint">{children}</p>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-2xl bg-ink/6", className)} />;
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : "Something went wrong";
  return <p className="rounded-[10px] bg-no/10 px-3 py-2 text-xs font-bold text-no">{message}</p>;
}
