import type { ID, ISODate, MarketStatus, Role } from "@/types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** 3200 -> "3.2k pts", 980 -> "980 pts" */
export function formatPoints(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k pts`;
  return `${value.toLocaleString()} pts`;
}

/** 0.583 -> "58%" */
export function formatPercent(probability: number): string {
  return `${Math.round(probability * 100)}%`;
}

/** "3d left", "18h left", "Ends 8pm", "Ended", "Resolved", "Nullified" */
export function formatTimeLeft(deadline: ISODate, status: MarketStatus): string {
  if (status === "RESOLVED") return "Resolved";
  if (status === "CANCELLED") return "Nullified";
  const ms = Date.parse(deadline) - Date.now();
  if (status === "LOCKED" || ms <= 0) return "Ended";
  if (ms < 12 * HOUR) {
    const end = new Date(deadline);
    if (end.getDate() === new Date().getDate()) {
      return `Ends ${end.toLocaleTimeString([], { hour: "numeric", minute: end.getMinutes() ? "2-digit" : undefined }).toLowerCase().replace(" ", "")}`;
    }
  }
  if (ms < DAY) return `${Math.max(1, Math.round(ms / HOUR))}h left`;
  return `${Math.round(ms / DAY)}d left`;
}

/** "40m ago", "5h ago", "2d ago" */
export function formatRelative(at: ISODate): string {
  const ms = Date.now() - Date.parse(at);
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / 60_000))}m ago`;
  if (ms < DAY) return `${Math.round(ms / HOUR)}h ago`;
  return `${Math.round(ms / DAY)}d ago`;
}

/** "Feb 2025" */
export function formatMonthYear(at: ISODate): string {
  return new Date(at).toLocaleDateString([], { month: "short", year: "numeric" });
}

export function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Creator",
  MODERATOR: "Moderator",
  MEMBER: "Member",
};

// Avatar colours aren't stored by the backend; derive a stable one from the id.
const AVATAR_COLORS = ["#FF5A36", "#2F9E5B", "#7C5CFC", "#F2A93B", "#E2574C", "#3B7DF2"];

export function avatarColor(id: ID): string {
  return AVATAR_COLORS[(id - 1 + AVATAR_COLORS.length) % AVATAR_COLORS.length];
}

// Line colours for multi-outcome charts, in option order.
export const CHART_COLORS = ["#FF5A36", "#3B7DF2", "#F2A93B", "#7C5CFC", "#2F9E5B"];
