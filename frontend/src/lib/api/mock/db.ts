// In-memory data for the mock API, seeded from the Huddle design file.
// State lives for the lifetime of the browser tab (resets on reload).

import type {
  ID,
  MarketStatus,
  MarketType,
  PositionResult,
  PricePoint,
  Visibility,
} from "@/types";

export interface UserRow {
  id: ID;
  username: string;
  email: string;
  createdAt: string;
}

export interface CommunityRow {
  id: ID;
  name: string;
  description: string;
  visibility: Visibility;
  /** Displayed member count (the design's numbers are bigger than our seeded members). */
  memberCount: number;
  creatorId: ID;
  moderatorIds: ID[];
  memberIds: ID[];
  inviteCode: string;
  createdAt: string;
}

export interface OptionRow {
  id: ID;
  text: string;
  totalAmount: number;
  positionCount: number;
}

export interface MarketRow {
  id: ID;
  communityId: ID;
  title: string;
  description: string;
  marketType: MarketType;
  status: MarketStatus;
  deadline: string;
  creatorId: ID;
  moderatorId: ID;
  createdAt: string;
  options: OptionRow[];
  history: PricePoint[];
  settlement: { winningOptionId: ID; resolvedById: ID; resolvedAt: string; notes: string | null } | null;
}

export interface PositionRow {
  id: ID;
  marketId: ID;
  optionId: ID;
  userId: ID;
  amount: number;
  createdAt: string;
  result: PositionResult;
  payout: number | null;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

// ---- users ----

const userNames = [
  "Jordan", "Sam K.", "Priya N.", "Alex D.", "Mina T.",
  "Rae O.", "Guest_88", "Filmfan", "PoliticoFan",
];

export const users: UserRow[] = userNames.map((username, i) => ({
  id: i + 1,
  username,
  email: `${username.toLowerCase().replace(/[^a-z0-9]/g, "")}@example.com`,
  createdAt: iso(now - 220 * DAY),
}));

const uid = (name: string) => users.find((u) => u.username === name)!.id;

/** The logged-in user in mock mode. */
export const ME = uid("Jordan");
export const wallet = { balance: 4820, updatedAt: iso(now) };

// ---- communities ----

function community(
  id: ID,
  name: string,
  visibility: Visibility,
  memberCount: number,
  creator: string,
  moderators: string[],
  members: string[],
  description: string,
): CommunityRow {
  const memberIds = [...new Set([creator, ...moderators, ...members].map(uid))];
  return {
    id, name, description, visibility, memberCount,
    creatorId: uid(creator),
    moderatorIds: moderators.map(uid),
    memberIds,
    inviteCode: `HUD${id}X7Q2P`,
    createdAt: iso(now - (60 + id * 7) * DAY),
  };
}

export const communities: CommunityRow[] = [
  community(1, "Fantasy Football Legends", "PRIVATE", 24, "Jordan", ["Sam K."],
    ["Priya N.", "Alex D."],
    "Weekly bets on our fantasy league drama — who chokes, who covers, who rage-quits."),
  community(2, "NYC Weather Watchers", "PUBLIC", 1180, "Priya N.", ["Priya N."],
    ["Jordan", "Guest_88"],
    "Will it snow? Heat records, storms, and everything NYC weather."),
  community(3, "Crypto Degens Only", "PRIVATE", 41, "Jordan", ["Mina T."],
    ["Rae O."],
    "Invite-only. Bet on token prices, degen news, and rug pulls."),
  community(4, "Movie Box Office Bets", "PUBLIC", 3020, "Alex D.", ["Alex D."],
    ["Jordan", "Filmfan"],
    "Predict opening weekends, award wins, and flops."),
  community(5, "The Office Trivia Club", "PRIVATE", 16, "Priya N.", ["Jordan"],
    ["Sam K."],
    "Friends-only trivia and pop-culture bets, one episode at a time."),
  community(6, "Election Junkies", "PUBLIC", 8750, "Rae O.", ["Rae O."],
    ["PoliticoFan"],
    "Polls, primaries, and political predictions."),
];

// ---- markets ----

let optionSeq = 1;
let positionSeq = 1;
export const nextIds = {
  community: () => communities.length + 1,
  market: () => markets.length + 1,
  option: () => optionSeq++,
  position: () => positionSeq++,
};

export const positions: PositionRow[] = [];

interface SeedBet { user: string; side: string; amount: number; hoursAgo: number }

function market(
  id: ID,
  communityId: ID,
  title: string,
  marketType: MarketType,
  outcomes: { label: string; price: number; history: number[] }[],
  volume: number,
  deadlineInHours: number,
  moderator: string,
  creator: string,
  description: string,
  bets: SeedBet[],
): MarketRow {
  const options: OptionRow[] = outcomes.map((o) => ({
    id: nextIds.option(),
    text: o.label,
    totalAmount: Math.round(o.price * volume),
    positionCount: Math.max(1, Math.round((o.price * volume) / 150)),
  }));

  // The design gives 7 daily points ending "now".
  const points = outcomes[0].history.length;
  const history: PricePoint[] = Array.from({ length: points }, (_, i) => ({
    at: iso(now - (points - 1 - i) * DAY),
    probabilities: Object.fromEntries(options.map((opt, j) => [opt.id, outcomes[j].history[i]])),
  }));

  for (const bet of bets) {
    positions.push({
      id: nextIds.position(),
      marketId: id,
      optionId: options.find((o) => o.text === bet.side)!.id,
      userId: uid(bet.user),
      amount: bet.amount,
      createdAt: iso(now - bet.hoursAgo * HOUR),
      result: "PENDING",
      payout: null,
    });
  }

  const deadline = now + deadlineInHours * HOUR;
  return {
    id, communityId, title, description, marketType,
    status: deadline > now ? "OPEN" : "LOCKED",
    deadline: iso(deadline),
    creatorId: uid(creator),
    moderatorId: uid(moderator),
    createdAt: iso(now - 7 * DAY),
    options,
    history,
    settlement: null,
  };
}

const yesNo = (yes: number[], no: number[]) => [
  { label: "Yes", price: yes[yes.length - 1], history: yes },
  { label: "No", price: no[no.length - 1], history: no },
];

export const markets: MarketRow[] = [
  market(1, 1, "Will Jordan's team make the playoffs?", "BINARY",
    yesNo([0.31, 0.4, 0.37, 0.46, 0.52, 0.5, 0.58], [0.69, 0.6, 0.63, 0.54, 0.48, 0.5, 0.42]),
    3200, 72, "Sam K.", "Jordan",
    "League standings lock at week 14. Based on final playoff seeding.",
    [{ user: "Sam K.", side: "Yes", amount: 150, hoursAgo: 2 }, { user: "Alex D.", side: "No", amount: 80, hoursAgo: 5 }]),
  market(2, 3, "BTC closes above $120k this Friday?", "BINARY",
    yesNo([0.55, 0.5, 0.44, 0.4, 0.38, 0.36, 0.34], [0.45, 0.5, 0.56, 0.6, 0.62, 0.64, 0.66]),
    9100, 18, "Mina T.", "Mina T.",
    "Resolves on Friday 5pm ET close price from Coinbase.",
    [{ user: "Rae O.", side: "No", amount: 500, hoursAgo: 0.7 }, { user: "Jordan", side: "Yes", amount: 200, hoursAgo: 3 }]),
  market(3, 5, "Who says 'that's what she said' first tonight?", "MULTIPLE_CHOICE",
    [
      { label: "Michael", price: 0.51, history: [0.34, 0.38, 0.42, 0.45, 0.48, 0.5, 0.51] },
      { label: "Jim", price: 0.29, history: [0.4, 0.36, 0.33, 0.31, 0.3, 0.29, 0.29] },
      { label: "Dwight", price: 0.2, history: [0.26, 0.26, 0.25, 0.24, 0.22, 0.21, 0.2] },
    ],
    1450, 6, "Jordan", "Priya N.",
    "Tonight's Office rewatch episode. First one to say it wins.",
    [{ user: "Priya N.", side: "Michael", amount: 60, hoursAgo: 0.2 }]),
  market(4, 2, "Will it snow in NYC before Nov 1?", "BINARY",
    yesNo([0.2, 0.18, 0.16, 0.15, 0.14, 0.13, 0.12], [0.8, 0.82, 0.84, 0.85, 0.86, 0.87, 0.88]),
    15600, 120, "Priya N.", "Priya N.",
    "Official measurable snowfall at Central Park station.",
    [{ user: "Guest_88", side: "No", amount: 300, hoursAgo: 1 }]),
  market(5, 4, "Opening weekend box office > $80M?", "BINARY",
    yesNo([0.6, 0.56, 0.52, 0.5, 0.49, 0.48, 0.47], [0.4, 0.44, 0.48, 0.5, 0.51, 0.52, 0.53]),
    22800, 48, "Alex D.", "Alex D.",
    "Domestic opening weekend, per Box Office Mojo.",
    [{ user: "Filmfan", side: "Yes", amount: 900, hoursAgo: 0.3 }]),
  market(6, 6, "Who wins the mayoral primary?", "MULTIPLE_CHOICE",
    [
      { label: "Torres", price: 0.44, history: [0.36, 0.38, 0.4, 0.41, 0.43, 0.44, 0.44] },
      { label: "Blake", price: 0.35, history: [0.4, 0.39, 0.38, 0.37, 0.36, 0.36, 0.35] },
      { label: "Nguyen", price: 0.21, history: [0.24, 0.23, 0.22, 0.22, 0.21, 0.2, 0.21] },
    ],
    41200, 288, "Rae O.", "Rae O.",
    "Resolves on certified primary results.",
    [{ user: "PoliticoFan", side: "Torres", amount: 700, hoursAgo: 1 }]),
  market(7, 1, "Total INTs thrown by our league this week > 5?", "BINARY",
    yesNo([0.5, 0.55, 0.58, 0.6, 0.61, 0.62, 0.63], [0.5, 0.45, 0.42, 0.4, 0.39, 0.38, 0.37]),
    980, -24, "Sam K.", "Jordan",
    "Sum across all starting QBs in the league.",
    [{ user: "Sam K.", side: "Yes", amount: 100, hoursAgo: 26 }, { user: "Jordan", side: "Yes", amount: 75, hoursAgo: 30 }]),
  market(8, 3, "ETH flips a new ATH this month", "BINARY",
    yesNo([0.3, 0.28, 0.26, 0.24, 0.23, 0.22, 0.21], [0.7, 0.72, 0.74, 0.76, 0.77, 0.78, 0.79]),
    5200, -48, "Mina T.", "Mina T.",
    "All-time high vs. prior cycle peak.",
    [{ user: "Rae O.", side: "No", amount: 400, hoursAgo: 50 }, { user: "Jordan", side: "No", amount: 100, hoursAgo: 60 }]),
  market(9, 5, "Trivia champion crowned tonight", "MULTIPLE_CHOICE",
    [
      { label: "Priya N.", price: 0.4, history: [0.34, 0.36, 0.37, 0.38, 0.39, 0.4, 0.4] },
      { label: "Sam K.", price: 0.35, history: [0.33, 0.34, 0.34, 0.35, 0.35, 0.35, 0.35] },
      { label: "Jordan", price: 0.25, history: [0.33, 0.3, 0.29, 0.27, 0.26, 0.25, 0.25] },
    ],
    600, -3, "Jordan", "Priya N.",
    "Final trivia leaderboard for tonight's session.",
    [{ user: "Sam K.", side: "Priya N.", amount: 50, hoursAgo: 72 }]),
  market(10, 4, "Will the sequel outgross the original?", "BINARY",
    yesNo([0.5, 0.47, 0.44, 0.42, 0.41, 0.4, 0.39], [0.5, 0.53, 0.56, 0.58, 0.59, 0.6, 0.61]),
    12300, 144, "Alex D.", "Alex D.",
    "Lifetime domestic gross comparison.",
    [{ user: "Filmfan", side: "No", amount: 250, hoursAgo: 4 }]),
];
