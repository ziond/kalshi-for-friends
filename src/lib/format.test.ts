import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { avatarColor, formatCountdown, formatPercent, formatPoints, formatRelative, formatTimeLeft, initial } from "./format";

describe("formatPoints", () => {
  it("abbreviates thousands and drops a trailing .0", () => {
    expect(formatPoints(3200)).toBe("3.2k pts");
    expect(formatPoints(41000)).toBe("41k pts");
    expect(formatPoints(980)).toBe("980 pts");
  });
});

describe("formatPercent", () => {
  it("rounds probabilities to whole percents", () => {
    expect(formatPercent(0.583)).toBe("58%");
    expect(formatPercent(1)).toBe("100%");
  });
});

describe("formatTimeLeft", () => {
  const NOW = new Date("2026-09-26T09:00:00");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  const inHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

  it("uses the settled status first", () => {
    expect(formatTimeLeft(inHours(48), "RESOLVED")).toBe("Resolved");
    expect(formatTimeLeft(inHours(48), "CANCELLED")).toBe("Nullified");
  });

  it("shows Ended once the deadline has passed", () => {
    expect(formatTimeLeft(inHours(-1), "OPEN")).toBe("Ended");
    expect(formatTimeLeft(inHours(5), "LOCKED")).toBe("Ended");
  });

  it("shows days, hours, or the closing time later today", () => {
    expect(formatTimeLeft(inHours(72), "OPEN")).toBe("3d left");
    expect(formatTimeLeft(inHours(18), "OPEN")).toBe("18h left");
    // Exact wording follows the machine's locale ("8pm", "8p.m.", "20:00").
    expect(formatTimeLeft(inHours(11), "OPEN")).toMatch(/^Ends (8|20)/);
  });
});

describe("formatRelative", () => {
  it("formats minutes, hours and days ago", () => {
    const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
    expect(formatRelative(ago(40 * 60_000))).toBe("40m ago");
    expect(formatRelative(ago(5 * 3_600_000))).toBe("5h ago");
    expect(formatRelative(ago(2 * 86_400_000))).toBe("2d ago");
  });
});

describe("formatCountdown", () => {
  it("shows minutes and seconds left, never negative", () => {
    const now = Date.parse("2026-09-27T12:00:00Z");
    expect(formatCountdown("2026-09-27T12:05:00Z", now)).toBe("5:00");
    expect(formatCountdown("2026-09-27T12:00:07.2Z", now)).toBe("0:08");
    expect(formatCountdown("2026-09-27T11:59:00Z", now)).toBe("0:00");
  });

  it("labels markets in their payout grace period", () => {
    expect(formatTimeLeft(new Date().toISOString(), "PAYOUT_PENDING")).toBe("Paying out");
  });
});

describe("avatars", () => {
  it("gives each community id a stable colour, cycling through the palette", () => {
    expect(avatarColor(1)).toBe("#B7A2FF");
    expect(avatarColor(7)).toBe(avatarColor(1));
  });

  it("uses the first letter as the initial", () => {
    expect(initial("  jordan")).toBe("J");
    expect(initial("")).toBe("?");
  });
});
