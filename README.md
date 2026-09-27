# called it.

A prediction market for friends, played with points instead of money (formerly Kalshi for Friends / Huddle).
Join a community, bet points on questions like "Will it snow before Nov 1?", and climb the leaderboard.

**Live app:** https://called-it-zeta.vercel.app

This repository is the **Next.js frontend**. The Go API and PostgreSQL database live on the `backend-dev` branch.

## Features

- **Accounts:** register and log in with a username, email and password. Sessions use EdDSA-signed JWTs in
  `access_token` / `refresh_token` cookies. Tokens refresh on their own, and signed-out visitors are sent to
  `/login?next=…`.
- **Points:** 1,000 points on signup, plus a **daily bonus** of 1,000 points you can claim every 24 hours. Points
  otherwise only move through bets, payouts and refunds.
- **Communities:** create public or private communities. Public ones are listed in **Discover** and anyone can join.
  Private ones are invite-only. Roles are Creator (admin), Moderator and Member.
- **Invite links:** the creator shares a link that **expires after 15 minutes** and can generate a new one at any
  time (with an expiry countdown). A signed-out visitor who opens an invite sees a sign-up/log-in card. Invite links
  and the site also have **link previews** (Open Graph images) for iMessage, WhatsApp, Discord, Slack and similar apps.
- **Markets:** binary (Yes/No) or multiple-choice markets with 2–10 outcomes, a betting deadline and an assigned
  moderator. Probabilities come from each option's share of the pool and are shown with a history chart and an
  activity feed.
- **Live updates:** pages for live markets (open, locked, or paying out) poll for new data.
- **Resolution:** the moderator picks the winner from the **Mod queue**. Payouts go out after a **5-minute grace
  period**, during which the market can still be nullified. Nullifying refunds every bet.
- **Leaderboards:** each community has a leaderboard ranked by win rate, and your profile shows your open and settled
  bets.

The full spec, with pass/fail requirements and their status, is in [docs/requirements.md](docs/requirements.md). The
endpoints and types shared with the backend are in [docs/api-contract.md](docs/api-contract.md).

## Tech stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, TanStack Query, `jose` for JWT verification, and
Vitest with Testing Library.

## Getting started

```bash
npm install
cp .env.example .env.local
npm run dev
```

Then open http://localhost:3000.

By default the app runs in **mock mode**. API calls are answered by an in-memory mock (`src/lib/api/mock`) with seeded
users, communities and markets, and you're signed in as the demo user "Jordan". You don't need a backend.

### Running against the Go backend

Set these in `.env.local`:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_MOCK` | Set to `false` to use the real API. This also turns on the route guard (`src/proxy.ts`). |
| `API_URL` | Backend origin, `http://localhost:8080` by default. `/api/v1/*` is proxied there so the auth cookies stay same-origin. ngrok tunnels also work. |
| `JWT_PUBLIC_KEY_PATH` | Path to the backend's Ed25519 public key (SPKI PEM). Defaults to `public.pem` in the repo root. |
| `JWT_PUBLIC_KEY` | The same PEM pasted inline, with `\n` for newlines. Takes priority over the path. |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Make a production build and serve it |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Vitest suite once (always against the mock API) |
| `npm run test:watch` | Run Vitest in watch mode |

## Project layout

```
src/
  app/
    (auth)/        login and register
    (app)/         home feed, discover, communities (+ leaderboard), markets, mod-queue, profile
    invite/[code]/ invite landing page and its link-preview image
  components/      shared UI (market cards, probability chart, top nav, points pill…)
  hooks/           React Query hooks for communities, markets and the current user
  lib/api/         API client, per-resource calls and the in-memory mock
  lib/auth/        JWT verification and safe login redirects
  proxy.ts         route guard: token check, token refresh, login redirect
  types/           TypeScript types for the API contract
docs/              requirements and API contract
```
