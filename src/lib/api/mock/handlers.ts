// Mock implementation of docs/api-contract.md, backed by ./db.
// Mirrors the backend's rules closely enough to exercise every screen:
// balance checks, parimutuel payouts, refunds and moderator permissions.

import type {
  CancelMarketRequest,
  CommunityDetail,
  CommunityMember,
  CommunitySummary,
  CreateCommunityRequest,
  CreateMarketRequest,
  DepositRequest,
  ID,
  InvitePreview,
  LeaderboardEntry,
  MarketActivity,
  MarketDetail,
  MarketSummary,
  Me,
  ModQueue,
  Paginated,
  PlacePositionRequest,
  PlacePositionResponse,
  Position,
  ResolveMarketRequest,
  Role,
  UserSummary,
} from "@/types";
import { MAX_DEPOSIT } from "@/types";
import { ApiError } from "../errors";
import {
  ME,
  communities,
  markets,
  nextIds,
  positions,
  users,
  wallet,
  type CommunityRow,
  type MarketRow,
  type PositionRow,
} from "./db";

type Query = Record<string, string>;
type Handler = (params: string[], query: Query, body: unknown) => unknown;

// ---- helpers ----

const nowIso = () => new Date().toISOString();

function notFound(what: string): never {
  throw new ApiError(404, "NOT_FOUND", `${what} not found`);
}

function user(id: ID): UserSummary {
  const u = users.find((x) => x.id === id) ?? notFound("User");
  return { id: u.id, username: u.username, avatarUrl: null };
}

function roleOf(c: CommunityRow, userId: ID): Role | null {
  if (c.creatorId === userId) return "ADMIN";
  if (c.moderatorIds.includes(userId)) return "MODERATOR";
  return c.memberIds.includes(userId) ? "MEMBER" : null;
}

function getCommunity(id: ID): CommunityRow {
  const c = communities.find((x) => x.id === id) ?? notFound("Community");
  if (c.visibility === "PRIVATE" && !roleOf(c, ME)) {
    throw new ApiError(403, "FORBIDDEN", "This community is invite-only");
  }
  return c;
}

/** Markets past their deadline lock automatically, like the backend's scheduler. */
function syncStatus(m: MarketRow) {
  if (m.status === "OPEN" && Date.parse(m.deadline) <= Date.now()) m.status = "LOCKED";
  return m;
}

function getMarket(id: ID): MarketRow {
  const m = markets.find((x) => x.id === id) ?? notFound("Market");
  getCommunity(m.communityId);
  return syncStatus(m);
}

const pool = (m: MarketRow) => m.options.reduce((sum, o) => sum + o.totalAmount, 0);

function probabilities(m: MarketRow) {
  const total = pool(m);
  return Object.fromEntries(
    m.options.map((o) => [o.id, total ? o.totalAmount / total : 1 / m.options.length]),
  );
}

function payoutFor(m: MarketRow, optionId: ID, amount: number) {
  const optionTotal = m.options.find((o) => o.id === optionId)!.totalAmount;
  return optionTotal ? Math.floor((amount * pool(m)) / optionTotal) : amount;
}

// ---- serializers ----

function communitySummary(c: CommunityRow): CommunitySummary {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    visibility: c.visibility,
    memberCount: c.memberCount,
    openMarketCount: markets.filter((m) => m.communityId === c.id && syncStatus(m).status === "OPEN").length,
    moderators: c.moderatorIds.map(user),
    myRole: roleOf(c, ME),
    createdAt: c.createdAt,
  };
}

function communityDetail(c: CommunityRow): CommunityDetail {
  const role = roleOf(c, ME);
  return {
    ...communitySummary(c),
    creator: user(c.creatorId),
    inviteCode: role === "ADMIN" || role === "MODERATOR" ? c.inviteCode : null,
  };
}

function marketSummary(m: MarketRow): MarketSummary {
  syncStatus(m);
  const c = communities.find((x) => x.id === m.communityId)!;
  const probs = probabilities(m);
  const mine = positions.filter((p) => p.marketId === m.id && p.userId === ME);
  const myAmount = mine.reduce((sum, p) => sum + p.amount, 0);
  return {
    id: m.id,
    communityId: c.id,
    communityName: c.name,
    communityVisibility: c.visibility,
    title: m.title,
    marketType: m.marketType,
    status: m.status,
    deadline: m.deadline,
    totalPool: pool(m),
    participantCount: m.options.reduce((sum, o) => sum + o.positionCount, 0),
    options: m.options.map((o) => ({
      id: o.id,
      text: o.text,
      totalAmount: o.totalAmount,
      positionCount: o.positionCount,
      probability: probs[o.id],
      isWinner: m.settlement ? m.settlement.winningOptionId === o.id : null,
    })),
    creator: user(m.creatorId),
    moderator: user(m.moderatorId),
    myStake: mine.length
      ? { optionId: mine[0].optionId, amount: myAmount, potentialPayout: payoutFor(m, mine[0].optionId, myAmount) }
      : null,
  };
}

function marketDetail(m: MarketRow): MarketDetail {
  const summary = marketSummary(m);
  const isModerator = m.moderatorId === ME;
  return {
    ...summary,
    description: m.description,
    settlement: m.settlement && {
      winningOptionId: m.settlement.winningOptionId,
      resolvedBy: user(m.settlement.resolvedById),
      resolvedAt: m.settlement.resolvedAt,
      notes: m.settlement.notes,
    },
    history: m.history,
    createdAt: m.createdAt,
    updatedAt: nowIso(),
    permissions: {
      canBet: m.status === "OPEN",
      canResolve: isModerator && m.status === "LOCKED",
      canCancel: isModerator && m.status === "LOCKED",
    },
  };
}

function position(p: PositionRow): Position {
  const m = syncStatus(markets.find((x) => x.id === p.marketId)!);
  return {
    id: p.id,
    market: { id: m.id, communityId: m.communityId, title: m.title, status: m.status, deadline: m.deadline },
    optionId: p.optionId,
    optionText: m.options.find((o) => o.id === p.optionId)!.text,
    amount: p.amount,
    result: p.result,
    payout: p.payout,
    potentialPayout: payoutFor(m, p.optionId, p.amount),
    createdAt: p.createdAt,
  };
}

function page<T>(items: T[], query: Query): Paginated<T> {
  const limit = query.limit ? Number(query.limit) : items.length;
  return { items: items.slice(0, limit), nextCursor: null };
}

function me(): Me {
  const u = users.find((x) => x.id === ME)!;
  const settled = positions.filter((p) => p.userId === ME && (p.result === "WON" || p.result === "LOST"));
  const correct = settled.filter((p) => p.result === "WON").length;
  return {
    ...user(ME),
    email: u.email,
    balance: wallet.balance,
    predictionScore: 72.5,
    totalPredictions: settled.length,
    correctPredictions: correct,
    accuracy: settled.length ? correct / settled.length : 0,
    createdAt: u.createdAt,
  };
}

function settle(m: MarketRow, winningOptionId: ID | null) {
  const marketPositions = positions.filter((p) => p.marketId === m.id);
  const winPool = winningOptionId ? m.options.find((o) => o.id === winningOptionId)!.totalAmount : 0;
  const refundAll = winningOptionId === null || winPool === 0;

  for (const p of marketPositions) {
    if (refundAll) {
      p.result = "REFUNDED";
      p.payout = p.amount;
    } else if (p.optionId === winningOptionId) {
      p.result = "WON";
      p.payout = payoutFor(m, p.optionId, p.amount);
    } else {
      p.result = "LOST";
      p.payout = 0;
    }
    if (p.userId === ME && p.payout) wallet.balance += p.payout;
  }
  wallet.updatedAt = nowIso();
}

function requireModerator(m: MarketRow) {
  if (m.moderatorId !== ME) throw new ApiError(403, "FORBIDDEN", "Only this market's moderator can do that");
  if (m.status !== "LOCKED") throw new ApiError(409, "MARKET_CLOSED", "This market can't be settled right now");
}

// ---- routes ----

const routes: [string, RegExp, Handler][] = [
  ["POST", /^\/auth\/(login|register)$/, () => me()],
  ["POST", /^\/auth\/(logout|refresh)$/, () => undefined],
  ["GET", /^\/me$/, () => me()],
  ["GET", /^\/me\/wallet$/, () => wallet],

  ["POST", /^\/me\/wallet\/deposit$/, (_, __, body) => {
    const { amount } = body as DepositRequest;
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_DEPOSIT) {
      throw new ApiError(400, "VALIDATION_ERROR", `Enter a whole number from 1 to ${MAX_DEPOSIT.toLocaleString()}`,
        { amount: "Invalid amount" });
    }
    wallet.balance += amount;
    wallet.updatedAt = nowIso();
    return wallet;
  }],
  ["GET", /^\/me\/transactions$/, (_, q) => page([], q)],

  ["GET", /^\/me\/positions$/, (_, q) => {
    const mine = positions
      .filter((p) => p.userId === ME)
      .map(position)
      .filter((p) => (q.status === "open" ? p.market.status === "OPEN" : q.status === "settled" ? p.market.status !== "OPEN" : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return page(mine, q);
  }],

  ["GET", /^\/me\/mod-queue$/, (): ModQueue => {
    const moderated = markets.filter((m) => m.moderatorId === ME).map(syncStatus);
    return {
      pending: moderated.filter((m) => m.status === "LOCKED").map(marketSummary),
      active: moderated.filter((m) => m.status === "OPEN").map(marketSummary),
    };
  }],

  ["GET", /^\/users\/(\d+)$/, ([id]) => ({ ...me(), ...user(Number(id)) })],

  ["GET", /^\/communities$/, () =>
    communities.filter((c) => roleOf(c, ME)).map(communitySummary)],

  ["GET", /^\/communities\/discover$/, () =>
    communities.filter((c) => c.visibility === "PUBLIC").sort((a, b) => b.memberCount - a.memberCount).map(communitySummary)],

  ["POST", /^\/communities$/, (_, __, body) => {
    const req = body as CreateCommunityRequest;
    if (!req.name?.trim()) {
      throw new ApiError(400, "VALIDATION_ERROR", "Name is required", { name: "Required" });
    }
    const moderatorIds = (req.moderatorUsernames ?? [])
      .map((name) => users.find((u) => u.username.toLowerCase() === name.trim().toLowerCase())?.id)
      .filter((id): id is ID => id !== undefined);
    const id = nextIds.community();
    const row: CommunityRow = {
      id,
      name: req.name.trim(),
      description: req.description?.trim() ?? "",
      visibility: req.visibility,
      memberCount: 1 + moderatorIds.length,
      creatorId: ME,
      moderatorIds: req.visibility === "PUBLIC" ? [ME, ...moderatorIds.filter((x) => x !== ME)] : [],
      memberIds: [ME, ...moderatorIds],
      inviteCode: `HUD${id}${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      createdAt: nowIso(),
    };
    communities.push(row);
    return communityDetail(row);
  }],

  ["POST", /^\/communities\/join$/, (_, __, body) => {
    const code = (body as { inviteCode: string }).inviteCode;
    const c = communities.find((x) => x.inviteCode === code);
    if (!c) throw new ApiError(404, "INVALID_INVITE_CODE", "That invite link isn't valid");
    if (!c.memberIds.includes(ME)) {
      c.memberIds.push(ME);
      c.memberCount++;
    }
    return communityDetail(c);
  }],

  ["GET", /^\/invites\/([^/]+)$/, ([code]): InvitePreview => {
    const c = communities.find((x) => x.inviteCode === decodeURIComponent(code));
    if (!c) throw new ApiError(404, "INVALID_INVITE_CODE", "That invite link isn't valid");
    const { id, name, description, visibility, memberCount, moderators } = communitySummary(c);
    return {
      inviteCode: c.inviteCode,
      community: { id, name, description, visibility, memberCount, moderators },
      alreadyMember: c.memberIds.includes(ME),
    };
  }],

  ["GET", /^\/communities\/(\d+)$/, ([id]) => communityDetail(getCommunity(Number(id)))],

  ["POST", /^\/communities\/(\d+)\/join$/, ([id]) => {
    const c = communities.find((x) => x.id === Number(id)) ?? notFound("Community");
    if (c.visibility === "PRIVATE") throw new ApiError(403, "FORBIDDEN", "Private communities need an invite");
    if (c.memberIds.includes(ME)) throw new ApiError(409, "ALREADY_MEMBER", "You're already a member");
    c.memberIds.push(ME);
    c.memberCount++;
    return communityDetail(c);
  }],

  ["POST", /^\/communities\/(\d+)\/invite-code$/, ([id]) => {
    const c = getCommunity(Number(id));
    c.inviteCode = `HUD${c.id}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    return { inviteCode: c.inviteCode };
  }],

  ["GET", /^\/communities\/(\d+)\/members$/, ([id]): CommunityMember[] => {
    const c = getCommunity(Number(id));
    return c.memberIds.map((userId) => ({ user: user(userId), role: roleOf(c, userId)!, joinedAt: c.createdAt }));
  }],

  // Stats from settled (won/lost) positions in this community; each market counts once per user,
  // refunds don't count. Ranked by net profit, like the real API.
  ["GET", /^\/communities\/(\d+)\/leaderboard$/, ([id]): LeaderboardEntry[] => {
    const c = getCommunity(Number(id));
    const marketIds = new Set(markets.filter((m) => m.communityId === c.id).map((m) => m.id));
    const entries = c.memberIds.map((userId) => {
      const settled = positions.filter((p) =>
        p.userId === userId && marketIds.has(p.marketId) && (p.result === "WON" || p.result === "LOST"));
      const total = new Set(settled.map((p) => p.marketId)).size;
      const correct = new Set(settled.filter((p) => p.result === "WON").map((p) => p.marketId)).size;
      const netProfit = settled.reduce((sum, p) => sum + (p.payout ?? 0) - p.amount, 0);
      return {
        rank: 0, user: user(userId), netProfit,
        correctPredictions: correct, totalPredictions: total, accuracy: total ? correct / total : 0,
      };
    });
    entries.sort((a, b) => b.netProfit - a.netProfit);
    entries.forEach((e, i) => (e.rank = i + 1));
    return entries;
  }],

  ["GET", /^\/markets$/, (_, q) => {
    const visible = markets.filter((m) => {
      const c = communities.find((x) => x.id === m.communityId)!;
      if (q.visibility === "PUBLIC") return c.visibility === "PUBLIC";
      if (q.visibility === "PRIVATE") return c.visibility === "PRIVATE" && roleOf(c, ME);
      return roleOf(c, ME);
    });
    return page(sortAndFilter(visible, q), q);
  }],

  ["GET", /^\/communities\/(\d+)\/markets$/, ([id], q) => {
    getCommunity(Number(id));
    return page(sortAndFilter(markets.filter((m) => m.communityId === Number(id)), q), q);
  }],

  ["POST", /^\/communities\/(\d+)\/markets$/, ([id], _, body) => {
    const c = getCommunity(Number(id));
    if (!roleOf(c, ME)) throw new ApiError(403, "FORBIDDEN", "Join this community to create markets");
    const req = body as CreateMarketRequest;
    const fields: Record<string, string> = {};
    if (!req.title?.trim()) fields.title = "Required";
    if (!req.deadline || Date.parse(req.deadline) <= Date.now()) fields.deadline = "Must be in the future";
    const optionTexts = req.marketType === "BINARY"
      ? ["Yes", "No"]
      : (req.options ?? []).map((o) => o.trim()).filter(Boolean);
    if (optionTexts.length < 2 || optionTexts.length > 10) fields.options = "Add 2–10 outcomes";
    if (Object.keys(fields).length) throw new ApiError(400, "VALIDATION_ERROR", "Check the highlighted fields", fields);

    const moderatorId = c.visibility === "PUBLIC"
      ? c.moderatorIds[0] ?? ME
      : req.moderatorId ?? ME;
    const options = optionTexts.map((text) => ({ id: nextIds.option(), text, totalAmount: 0, positionCount: 0 }));
    const row: MarketRow = {
      id: nextIds.market(),
      communityId: c.id,
      title: req.title.trim(),
      description: req.description?.trim() ?? "",
      marketType: req.marketType,
      status: "OPEN",
      deadline: new Date(req.deadline).toISOString(),
      creatorId: ME,
      moderatorId,
      createdAt: nowIso(),
      options,
      history: [],
      settlement: null,
    };
    row.history.push({ at: row.createdAt, probabilities: probabilities(row) });
    markets.push(row);
    return marketDetail(row);
  }],

  ["GET", /^\/markets\/(\d+)$/, ([id]) => marketDetail(getMarket(Number(id)))],

  ["GET", /^\/markets\/(\d+)\/activity$/, ([id], q): Paginated<MarketActivity> => {
    const m = getMarket(Number(id));
    const items = positions
      .filter((p) => p.marketId === m.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((p) => ({
        id: p.id,
        user: user(p.userId),
        optionId: p.optionId,
        optionText: m.options.find((o) => o.id === p.optionId)!.text,
        amount: p.amount,
        createdAt: p.createdAt,
      }));
    return page(items, q);
  }],

  ["POST", /^\/markets\/(\d+)\/positions$/, ([id], _, body): PlacePositionResponse => {
    const m = getMarket(Number(id));
    const { optionId, amount } = body as PlacePositionRequest;
    const option = m.options.find((o) => o.id === optionId);
    if (!option) throw new ApiError(400, "VALIDATION_ERROR", "Pick an outcome first");
    if (m.status !== "OPEN") throw new ApiError(409, "MARKET_CLOSED", "This market is closed for betting");
    if (!Number.isInteger(amount) || amount < 1) throw new ApiError(400, "VALIDATION_ERROR", "Enter a whole number of points");
    if (amount > wallet.balance) throw new ApiError(409, "INSUFFICIENT_FUNDS", `You only have ${wallet.balance} pts`);

    const existing = positions.find((p) => p.marketId === m.id && p.userId === ME);
    if (existing && existing.optionId !== optionId) {
      throw new ApiError(409, "OPTION_SWITCH_NOT_ALLOWED", `You already bet on "${m.options.find((o) => o.id === existing.optionId)!.text}"`);
    }

    wallet.balance -= amount;
    wallet.updatedAt = nowIso();
    if (!existing) option.positionCount++;
    option.totalAmount += amount;
    const row: PositionRow = {
      id: nextIds.position(), marketId: m.id, optionId, userId: ME, amount,
      createdAt: nowIso(), result: "PENDING", payout: null,
    };
    positions.push(row);
    m.history.push({ at: row.createdAt, probabilities: probabilities(m) });

    return { position: position(row), market: marketDetail(m), balance: wallet.balance };
  }],

  ["POST", /^\/markets\/(\d+)\/resolve$/, ([id], _, body) => {
    const m = getMarket(Number(id));
    requireModerator(m);
    const { winningOptionId, notes } = body as ResolveMarketRequest;
    if (!m.options.some((o) => o.id === winningOptionId)) throw new ApiError(400, "VALIDATION_ERROR", "Unknown outcome");
    settle(m, winningOptionId);
    m.status = "RESOLVED";
    m.settlement = { winningOptionId, resolvedById: ME, resolvedAt: nowIso(), notes: notes ?? null };
    return marketDetail(m);
  }],

  ["POST", /^\/markets\/(\d+)\/cancel$/, ([id], _, body) => {
    const m = getMarket(Number(id));
    requireModerator(m);
    void (body as CancelMarketRequest);
    settle(m, null);
    m.status = "CANCELLED";
    return marketDetail(m);
  }],
];

function sortAndFilter(list: MarketRow[], q: Query): MarketSummary[] {
  return list
    .map(syncStatus)
    .filter((m) => !q.status || m.status === q.status)
    .sort((a, b) => (q.sort === "newest" ? b.createdAt.localeCompare(a.createdAt) : pool(b) - pool(a)))
    .map(marketSummary);
}

// Simulated network delay so loading states show up in the browser; skipped under test.
const LATENCY_MS = process.env.NODE_ENV === "test" ? 0 : 200;

export async function mockRequest<T>(method: string, path: string, query: Query, body: unknown): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
  for (const [routeMethod, pattern, handler] of routes) {
    const match = routeMethod === method ? pattern.exec(path) : null;
    if (match) {
      // Round-trip through JSON so callers never share references with the mock db.
      const result = handler(match.slice(1), query, body);
      return (result === undefined ? undefined : JSON.parse(JSON.stringify(result))) as T;
    }
  }
  throw new ApiError(404, "NOT_FOUND", `Mock API has no route for ${method} ${path}`);
}
