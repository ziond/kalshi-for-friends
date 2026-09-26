# Huddle — Requirements Specification (MVP)

**Purpose:** the single list of what Huddle must do, written so every item can be checked as pass/fail. Use it to verify the frontend, the Go backend, and the two working together before calling the MVP viable.

**Related docs:** [api-contract.md](api-contract.md) (the endpoint and type definitions these requirements refer to).

**Status:** draft for team review.

---

## 1. How to use this document

### 1.1 Requirement IDs

Every requirement has a stable ID like `MKT-12`. Reference it in test names, PRs and bug reports, e.g. `it("MKT-12: rejects a past deadline", …)`. Never reuse or renumber an ID; mark removed ones as **Withdrawn**.

| Prefix | Area |
|---|---|
| AUTH | Sign-up, login, JWT access and refresh tokens |
| USR | Profile and current user |
| WAL | Points, wallet, deposits, transactions |
| COM | Communities (create, view, visibility, roles) |
| DSC | Discover |
| INV | Invite links |
| MKT | Creating and viewing markets |
| ODD | Pool, probabilities and chart history |
| BET | Placing positions (bets) |
| LCK | Market lifecycle and deadlines |
| RES | Resolution, nullification and payouts |
| MOD | Mod Queue |
| FEED | Home feed and search |
| ACT | Market activity feed |
| LDR | Leaderboards and prediction stats |
| NAV | Navigation and layout |
| UX | Loading, empty and error states; formatting |
| A11Y | Accessibility |
| API | API conventions and error handling |
| SEC | Security and authorization |
| DATA | Data integrity and concurrency |
| PERF | Performance |
| DEV | Developer tooling (mock mode, tests) |

### 1.2 Priority

| Priority | Meaning |
|---|---|
| **Must** | The MVP isn't viable without it. |
| **Should** | Expected for the MVP; can ship without it only with a known workaround. |
| **Could** | Nice to have; post-MVP if time runs out. |

### 1.3 Status

Status reflects the `dev` branch at the time of writing. The Go backend is not built yet, so every API-side rule is currently implemented **only in the frontend mock** (`frontend/src/lib/api/mock`).

| Status | Meaning |
|---|---|
| **Built** | Done in the frontend and doesn't depend on the backend's behaviour (e.g. the route guard, token verification). |
| **Built (mock)** | Working in the UI against the in-memory mock API. Backend still has to implement it. |
| **Partial** | Some of the acceptance criteria are met; see the note. |
| **Not built** | Specified but not implemented anywhere yet. |
| **Backend only** | No UI needed; applies to the Go API and database. |

### 1.4 Verified by

The **Test** column names the automated test that covers the requirement (paths relative to `frontend/src/`). `Manual` means there is no automated test yet and it must be checked by hand. Run the automated suite with `cd frontend && npm test`.

| Short name | File |
|---|---|
| `api.test` | `lib/api/mock/handlers.test.ts` |
| `format.test` | `lib/format.test.ts` |
| `card.test` | `components/market-card.test.tsx` |
| `nav.test` | `components/top-nav.test.tsx` |
| `points.test` | `components/add-points.test.tsx` |
| `home.test` | `app/(app)/page.test.tsx` |
| `market.test` | `app/(app)/markets/[marketId]/page.test.tsx` |
| `community.test` | `app/(app)/communities.test.tsx` |
| `account.test` | `app/(app)/account.test.tsx` |
| `jwt.test` | `lib/auth/jwt.test.ts` |
| `proxy.test` | `proxy.test.ts` |
| `client.test` | `lib/api/client.test.ts` |

### 1.5 Glossary

| Term | Meaning |
|---|---|
| **Points** | The in-app currency (called coins in the database). Not real money in the MVP. |
| **Community** | A group of users. **Public** ones are listed in Discover and anyone can join; **private** ones are invite-only. |
| **Market** | A question with two or more outcomes that members bet on, e.g. "Will it snow before Nov 1?". |
| **Binary market** | A market with exactly two outcomes, Yes and No. |
| **Multiple-choice market** | A market with 2–10 custom outcomes. |
| **Option / outcome** | One possible answer in a market. |
| **Position / bet** | Points a user has put on one option. |
| **Pool** | The total points bet across all options of a market (shown as "volume"). |
| **Probability** | An option's share of the pool, shown as a percentage. |
| **Moderator** | The user who decides a market's real-world outcome. |
| **Resolve / validate** | Declare the winning option and pay out. |
| **Nullify / cancel** | Void a market and refund every bet. |
| **Deadline / closes** | The time after which no more bets are accepted. |
| **Role** | A user's rank in a community: `ADMIN` (the creator, shown as "Creator"), `MODERATOR` or `MEMBER`. |

---

## 2. Actors

| Actor | Description |
|---|---|
| **Visitor** | Not signed in. Can only reach the login and register pages. |
| **User** | Signed in. Can join communities, bet, create communities and markets. |
| **Member** | A user who belongs to a given community. |
| **Community creator (ADMIN)** | Created the community. Can share its invite link. |
| **Access token** | Short-lived EdDSA-signed JWT in the `access_token` cookie; proves who the user is on every request. |
| **Refresh token** | Long-lived token in the `refresh_token` cookie; exchanged at `POST /auth/refresh` for a new pair. |
| **Community moderator** | Moderates every market in a *public* community. |
| **Market moderator** | The user assigned to decide one market's outcome. |

---

## 3. Functional requirements

### 3.1 Authentication (AUTH)

| ID | Requirement | Acceptance criteria | Pri | Status | Test |
|---|---|---|---|---|---|
| AUTH-01 | A visitor can create an account with a username, email and password. | Register form has all three fields, all required. On success the user is signed in and sent to Home (`/`). | Must | Built (mock) | Manual |
| AUTH-02 | Usernames are unique and at most 50 characters. | Registering with a taken username fails with a clear error and no account is created. The field won't accept more than 50 characters. | Must | Partial — length enforced in UI; uniqueness is backend only | Manual |
| AUTH-03 | Emails are unique and valid. | Registering with an existing email or a malformed address fails with a clear error. | Must | Partial — format checked by the browser; uniqueness is backend only | Manual |
| AUTH-04 | Passwords are at least 8 characters and never stored in plain text. | The form rejects passwords under 8 characters. The database stores only a hash (bcrypt or argon2). | Must | Partial — length in UI; hashing is backend only | Manual |
| AUTH-05 | Every new account starts with 1,000 points. | Immediately after registering, the balance shows 1,000 pts and an `INITIAL_BONUS` transaction of +1,000 exists. | Must | Backend only | Manual |
| AUTH-06 | A user can log in with email and password. | Correct credentials sign the user in and go to Home (or the `next` page, AUTH-10). Wrong credentials return `401` and show an error that doesn't reveal which field was wrong. | Must | Partial — mock accepts any credentials | `client.test` |
| AUTH-07 | Login and register issue an access token and a refresh token as cookies. | Both responses set `access_token` and `refresh_token` cookies with `HttpOnly; SameSite=Lax; Path=/` (plus `Secure` outside localhost). Neither token is readable from JavaScript or stored in localStorage. | Must | Backend only | Manual |
| AUTH-08 | A user can log out. | "Log out" calls `POST /auth/logout`, which expires both cookies; cached data is cleared and the user goes to `/login`. Visiting an app page afterwards redirects to login. | Must | Built (mock) | `account.test` |
| AUTH-09 | Visitors can't see app pages. | With the real backend, opening any page except `/login` and `/register` without a valid access token (and no usable refresh token) redirects to `/login`. | Must | Built | `proxy.test` |
| AUTH-10 | After logging in from a redirect, the user returns to where they were going. | Being redirected from `/markets/5?tab=x` goes to `/login?next=%2Fmarkets%2F5%3Ftab%3Dx`; signing in lands on `/markets/5?tab=x`. The register link keeps `next`. | Should | Built | `proxy.test`, `client.test` |
| AUTH-11 | Invite links work for signed-out visitors. | A visitor opening `/invite/:code` is sent to log in or register, then lands back on the invite to accept it. | Should | Built | `proxy.test` |
| AUTH-12 | Login and register pages link to each other. | "Create an account" and "Log in" links switch between the two pages. | Could | Built (mock) | Manual |
| AUTH-13 | Access tokens are EdDSA-signed JWTs carrying the user's ID. | The `access_token` header is `alg: EdDSA` (Ed25519) and the payload contains `user_id` (a positive integer), `exp` and `iat`. Lifetime is short (suggested 15 minutes). | Must | Backend only | Manual |
| AUTH-14 | The frontend verifies access tokens with the backend's public key. | The route guard accepts a token only if its EdDSA signature verifies against `public.pem`, it hasn't expired, and it has a valid `user_id`. Expired, tampered, wrongly-signed, `alg: none`, or `user_id`-less tokens are rejected. | Must | Built | `jwt.test`, `proxy.test` |
| AUTH-15 | Only the public key is on the frontend. | The Ed25519 private key exists only on the backend; the frontend is configured with `public.pem` via `JWT_PUBLIC_KEY_PATH` or `JWT_PUBLIC_KEY`. | Must | Built | Manual |
| AUTH-16 | A missing public key is a loud error, not a silent logout. | If the key can't be loaded, protected pages return 500 and the server logs how to fix it; `/login` and `/register` still load. Fixing the config works without a restart. | Should | Built | `jwt.test`, `proxy.test` |
| AUTH-17 | Expired access tokens are refreshed when a page loads. | Visiting a page with an expired access token and a valid refresh token calls `POST /auth/refresh`, passes the new cookies to the browser and shows the page without a detour to login. | Must | Built | `proxy.test` |
| AUTH-18 | Expired access tokens are refreshed during API calls. | An API call that gets `401` triggers one `POST /auth/refresh` and one retry. Several simultaneous `401`s share a single refresh. If refreshing fails, the user is sent to `/login?next=<current page>`. Login/register `401`s never trigger a refresh. | Must | Built | `client.test` |
| AUTH-19 | The refresh endpoint rotates tokens. | `POST /auth/refresh` with a valid `refresh_token` cookie returns `204` with new `access_token` and `refresh_token` cookies; the old refresh token stops working. A missing, expired or revoked refresh token returns `401`. | Must | Backend only | Manual |
| AUTH-20 | Refresh tokens can be revoked. | Logging out (and, ideally, reuse of an already-rotated refresh token) invalidates the refresh token on the server, so a copied cookie can't mint new access tokens. | Should | Backend only | Manual |
| AUTH-21 | Signed-in users skip the login pages. | Visiting `/login` or `/register` with a valid access token redirects to `next` (if given) or Home. | Could | Built | `proxy.test` |
| AUTH-22 | Redirects after login stay on Huddle. | `next` is only followed if it's a same-site path; values like `https://evil.example` or `//evil.example` fall back to `/`. | Must | Built | `proxy.test` |
| AUTH-23 | The guard only runs against the real backend. | With `NEXT_PUBLIC_API_MOCK` not set to `false`, the route guard lets every request through so the mock works without tokens. | Should | Built | `proxy.test` |

### 3.2 Profile and current user (USR)

| ID | Requirement | Acceptance criteria | Pri | Status | Test |
|---|---|---|---|---|---|
| USR-01 | The profile page shows who the user is. | Shows avatar initial, username, "Member since <Mon YYYY>" and current balance. | Must | Built (mock) | `account.test` |
| USR-02 | The profile lists the user's communities with their role. | Each community the user belongs to is listed and links to it. Role shows as "Creator", "Moderator" or "Member". | Must | Built (mock) | `account.test` |
| USR-03 | The profile lists open positions. | Every bet on a market that is still OPEN is listed with the market title, option and amount, linking to the market. Shows "No open bets." when empty. | Must | Built (mock) | `account.test` |
| USR-04 | The profile lists bet history. | Every bet on a closed, resolved or nullified market is listed with its result: "Awaiting resolution", "Won +N pts", "Lost N pts" or "Refunded". Shows "No settled bets yet." when empty. | Must | Built (mock) | `account.test` |
| USR-05 | The profile shows prediction accuracy once the user has settled bets. | After at least one won or lost bet, the header shows "N% accuracy" (correct ÷ total settled). Refunds don't count. | Should | Built (mock) | Manual |
| USR-06 | The nav avatar opens the profile. | Clicking the round avatar in the top nav goes to `/profile`. | Must | Built (mock) | Manual |
| USR-07 | A user can change their username or avatar. | `PATCH /me` updates them; the new name appears everywhere after refresh. | Could | Not built — API only, no UI | — |
| USR-08 | A user can view another user's public profile. | `/users/:id` shows their username and prediction stats, not their email or balance. | Could | Not built — API only, no UI | — |

### 3.3 Points, wallet and deposits (WAL)

| ID | Requirement | Acceptance criteria | Pri | Status | Test |
|---|---|---|---|---|---|
| WAL-01 | The current balance is always visible. | The top nav shows "<balance> pts" on every app page, formatted with thousands separators (e.g. "4,820 pts"). | Must | Built (mock) | `nav.test` |
| WAL-02 | The balance updates immediately after anything that changes it. | Placing a bet, depositing, or a market resolving/refunding updates the nav balance without a page reload. | Must | Built (mock) | `points.test`, `market.test` |
| WAL-03 | Users can add points to their own balance (MVP). | Clicking the balance opens "Add points". Choosing +500, +1,000, +5,000 or a custom amount adds exactly that many points and shows "Added N pts." | Must | Built (mock) | `points.test` |
| WAL-04 | Deposits must be whole numbers from 1 to 1,000,000. | 0, negatives, decimals and values over 1,000,000 are rejected with `VALIDATION_ERROR` and the balance doesn't change. The Add button is disabled for invalid input. | Must | Built (mock) | `api.test`, `points.test` |
| WAL-05 | A user can only deposit into their own wallet. | The deposit endpoint takes no user ID; it always credits the signed-in user. | Must | Built (mock) | Manual |
| WAL-06 | The deposit popover closes cleanly. | Clicking outside it or pressing Escape closes it. | Should | Built (mock) | Manual |
| WAL-07 | Balances can never go negative. | No combination of bets, concurrent requests or payouts leaves a wallet below 0. | Must | Backend only (mock checks per bet) | `api.test` |
| WAL-08 | Every points movement is recorded as a transaction. | Each registration bonus, deposit, bet, win payout and refund writes one transaction row with a signed amount and `balance_after`. The sum of a user's transactions equals their balance. | Must | Backend only | Manual |
| WAL-09 | Users can see their transaction history. | A page lists transactions newest first with type, amount, resulting balance and market title where relevant. | Could | Not built — API only, no UI | — |
| WAL-10 | The deposit feature can be switched off before real money exists. | Deposits can be disabled by config without a code change to the rest of the wallet. | Should | Not built | — |

### 3.4 Communities (COM)

| ID | Requirement | Acceptance criteria | Pri | Status | Test |
|---|---|---|---|---|---|
| COM-01 | A user can create a community with a name, optional description and privacy setting. | "+ Create → New community" opens the form. Name is required (max 100 characters). Privacy defaults to Public. On success the user lands on the new community's page. | Must | Built (mock) | `community.test` |
| COM-02 | The creator becomes the community's ADMIN. | Right after creation the creator's role is ADMIN, shown as "Creator" on their profile. | Must | Built (mock) | `api.test` |
| COM-03 | Public communities have community moderators. | When creating a public community the creator can add moderators by username; the creator is always a moderator too. The page shows "moderated by <names>". | Must | Built (mock) | `community.test` |
| COM-04 | Unknown moderator usernames are handled. | Adding a username that doesn't exist either shows an error or is ignored with a visible notice — never silently creates a user. | Should | Partial — mock silently ignores unknown names | Manual |
| COM-05 | Private communities don't have community moderators. | Choosing Private hides the moderator picker and explains that each market gets its own moderator. | Must | Built (mock) | `community.test` |
| COM-06 | Private communities get an invite code. | A private community has a unique invite code from the moment it's created. | Must | Built (mock) | `api.test` |
| COM-07 | The community page shows the community's details. | Shows avatar, name, Public/Private badge, member count, moderators and description. | Must | Built (mock) | `community.test` |
| COM-08 | The community page lists its markets. | All markets in the community appear as cards, highest volume first. Shows "No markets yet — start one." when empty. | Must | Built (mock) | `community.test` |
| COM-09 | Members can start a market from the community page. | Members see "+ New market", which opens the create form with this community pre-selected. Non-members don't see it. | Must | Built (mock) | `community.test` |
| COM-10 | Non-members can join a public community from its page. | A non-member sees "Join community". Clicking it makes them a MEMBER, hides the button and shows "+ New market". | Must | Built (mock) | `community.test` |
| COM-11 | Private communities are hidden from non-members. | Opening a private community (or any of its markets) as a non-member shows "This community is invite-only" and no content. The API returns 403 `FORBIDDEN`. | Must | Built (mock) | `market.test` |
| COM-12 | The creator of a private community can share its invite link. | "Invite people" opens a dialog with the full link `<site>/invite/<code>`, a Copy button, and "Preview what invitees see". Escape or Close dismisses it. | Must | Built (mock) | `community.test` |
| COM-13 | Only creators and moderators see the invite code. | Members get `inviteCode: null` from the API and don't see "Invite people". | Must | Built (mock) | Manual |
| COM-14 | Each community gets a consistent avatar colour. | The same community always shows the same colour everywhere, picked from the design palette by its ID. | Could | Built (mock) | `format.test` |
| COM-15 | A user can leave a community. | Leaving removes their membership. Their existing bets stay and still settle. | Should | Not built — API only, no UI | — |
| COM-16 | The creator can remove members and change roles. | Creator can promote a member to MODERATOR, demote them, or remove them. | Could | Not built — API only, no UI | — |
| COM-17 | The creator can issue a new invite code. | Generating a new code makes the old link stop working. | Could | Not built — API only, no UI | — |
| COM-18 | The creator can edit the name and description. | Changes appear everywhere after save. | Could | Not built — API only, no UI | — |
| COM-19 | A user can't join the same community twice. | Joining again returns 409 `ALREADY_MEMBER`; the database has a unique (community, user) constraint. | Must | Built (mock) | `api.test` |

### 3.5 Discover (DSC)

| ID | Requirement | Acceptance criteria | Pri | Status | Test |
|---|---|---|---|---|---|
| DSC-01 | Discover lists every public community. | `/discover` shows all public communities (joined or not) and no private ones, largest first. | Must | Built (mock) | `api.test`, `community.test` |
| DSC-02 | Each Discover card shows what the community is. | Card shows avatar, name (links to the community), member count, description and moderators. | Must | Built (mock) | `community.test` |
| DSC-03 | Users can join from Discover. | "Join" makes the user a member and the button changes to a disabled "Joined ✓". The community then appears in the Home sidebar. | Must | Built (mock) | `community.test` |
| DSC-04 | Already-joined communities are marked. | Communities the user already belongs to show "Joined ✓" instead of Join. | Must | Built (mock) | `community.test` |

### 3.6 Invite links (INV)

| ID | Requirement | Acceptance criteria | Pri | Status | Test |
|---|---|---|---|---|---|
| INV-01 | An invite link shows what the user is joining. | Once signed in (AUTH-11), `/invite/<code>` shows the community's avatar, name, description, member count and moderators before joining. | Must | Built (mock) | `community.test` |
| INV-02 | Accepting an invite joins the community. | "Accept & join" makes the user a MEMBER and opens the community page. | Must | Built (mock) | `community.test` |
| INV-03 | Existing members aren't asked to join again. | If the user is already a member, the page says so and links straight to the community. | Must | Built (mock) | `community.test` |
| INV-04 | Invalid codes are rejected. | An unknown code shows "That invite link isn't valid" (`INVALID_INVITE_CODE`). | Must | Built (mock) | `api.test`, `community.test` |
| INV-05 | Invite codes are hard to guess. | Codes are random, at least 8 characters, and unique across communities. | Should | Backend only | Manual |

### 3.7 Creating and viewing markets (MKT)

| ID | Requirement | Acceptance criteria | Pri | Status | Test |
|---|---|---|---|---|---|
| MKT-01 | A member can create a market in a community they belong to. | "+ Create → New market" opens the form; the Community dropdown lists only the user's communities. On success the user lands on the new market page. | Must | Built (mock) | `account.test` |
| MKT-02 | A market needs a question. | The question is required, max 255 characters. | Must | Built (mock) | Manual |
| MKT-03 | A market has a type: Yes/No or Multiple outcomes. | The Outcome type toggle defaults to Yes/No. | Must | Built (mock) | `account.test` |
| MKT-04 | Yes/No markets get exactly two options, created by the server. | A binary market always has options "Yes" and "No"; any options sent by the client are ignored. | Must | Built (mock) | `api.test` |
| MKT-05 | Multiple-choice markets need 2–10 non-empty outcomes. | The form starts with three outcome fields; users can add up to 10 and remove down to 2. Blank outcomes are ignored. Fewer than 2 real outcomes shows "Add 2–10 outcomes" and nothing is created. | Must | Built (mock) | `api.test`, `account.test` |
| MKT-06 | A market needs a closing time in the future. | "Closes" is required. A time in the past is rejected with a field error and nothing is created. | Must | Built (mock) | `api.test` |
| MKT-07 | Private-community markets get a moderator chosen by the creator. | For a private community the form shows "Choose a moderator for this market" listing all members, defaulting to the creator. The chosen person becomes the market moderator. | Must | Built (mock) | `account.test` |
| MKT-08 | Public-community markets are moderated by the community's moderators. | For a public community the form shows "Moderated by <names>" instead of a picker, and any moderator ID sent is ignored. | Must | Built (mock) | `account.test` |
| MKT-09 | A new market starts open with even odds. | Status is OPEN, pool is 0, and every option shows an equal share (50/50 for Yes/No). | Must | Built (mock) | `api.test` |
| MKT-10 | Only members can create markets in a community. | A non-member trying to create a market gets 403 `FORBIDDEN`. | Must | Built (mock) | Manual |
| MKT-11 | The market page shows the market's details. | Shows the community pill (links back), time left or status, question, description, chart, outcomes, and a Market info panel: Volume, Closes (date and time), Moderator, Created by. | Must | Built (mock) | `market.test` |
| MKT-12 | The market page explains how resolution works. | The info panel shows the resolution rule text from the design. | Should | Built (mock) | Manual |
| MKT-13 | Market cards summarise a market. | Each card shows community pill (purple for private, green for public), time left, question, odds (Yes % and bar for binary; top 3 outcomes for multiple choice), volume, and either the user's stake or the result. Clicking it opens the market. | Must | Built (mock) | `card.test` |
| MKT-14 | Markets can have a description. | The creator can add an optional description, shown under the question. | Should | Partial — supported by the API, not in the create form | — |
| MKT-15 | Back navigation from a market returns to its community. | "← Back to <community>" links to the community page. | Should | Built (mock) | Manual |

### 3.8 Pool, probabilities and chart (ODD)

| ID | Requirement | Acceptance criteria | Pri | Status | Test |
|---|---|---|---|---|---|
| ODD-01 | Each option's probability is its share of the pool. | probability = option total ÷ market pool. With an empty pool, options split evenly. Probabilities across a market add up to 100% (±1% for rounding). | Must | Built (mock) | `api.test` |
| ODD-02 | Probabilities update right after every bet. | After a bet, the market page, chart legend and cards show the new percentages without a reload. | Must | Built (mock) | `api.test` |
| ODD-03 | The market page shows probability over time. | A line chart shows each option's probability from market creation to now, one colour per option, with a legend showing current percentages. | Must | Built (mock) | `market.test` |
| ODD-04 | The chart records a point at creation and after every bet. | A new market has one history point; each bet adds one. The last point matches the current probabilities. | Must | Built (mock) | `api.test` |
| ODD-05 | Volume is the total pool. | "Volume" shows the pool, abbreviated above 1,000 (e.g. "3.2k pts"). | Must | Built (mock) | `format.test`, `card.test` |
| ODD-06 | Users see what they'd win. | The info panel shows the user's stake and "If it wins" payout at current odds. | Should | Built (mock) | Manual |

### 3.9 Placing bets (BET)

| ID | Requirement | Acceptance criteria | Pri | Status | Test |
|---|---|---|---|---|---|
| BET-01 | Members can bet on an open market. | Pick an outcome (Yes/No buttons, or a row in a multi-outcome list), enter points, click "Place bet". A confirmation "Bet placed — N pts on <option>." appears. | Must | Built (mock) | `market.test` |
| BET-02 | Placing a bet deducts points and grows the pool. | Balance drops by the amount, the option's total and the pool grow by the amount, all in one step. | Must | Built (mock) | `api.test` |
| BET-03 | Bets are whole numbers of at least 1. | 0, negatives and decimals are rejected with `VALIDATION_ERROR`. | Must | Built (mock) | Manual |
| BET-04 | Users can't bet more than their balance. | Betting more than the balance fails with `INSUFFICIENT_FUNDS` ("You only have N pts") and nothing changes. | Must | Built (mock) | `api.test` |
| BET-05 | Users can add to their bet but not switch sides. | A second bet on the same option adds to the stake. A bet on a different option fails with `OPTION_SWITCH_NOT_ALLOWED` ("You already bet on "<option>""). | Must | Built (mock) | `api.test`, `market.test` |
| BET-06 | The user's existing side is pre-selected. | Opening a market where the user already bet selects that option automatically. | Should | Built (mock) | Manual |
| BET-07 | The Place bet button is only enabled when a bet is possible. | Disabled until an outcome is picked and an amount entered, and while a bet is being placed. | Must | Built (mock) | Manual |
| BET-08 | No betting on closed markets. | On LOCKED, RESOLVED or CANCELLED markets the wager box is hidden and the API rejects bets with `MARKET_CLOSED`. | Must | Built (mock) | `api.test`, `market.test` |
| BET-09 | Only members can bet. | Non-members of a community can't bet on its markets (403). | Must | Partial — enforced for private communities; public non-members can currently bet in the mock | Manual |
| BET-10 | Errors explain what went wrong. | Every rejected bet shows the server's message under the wager box; the balance and stake are unchanged. | Must | Built (mock) | `market.test` |
| BET-11 | The user's stake is shown on the market and on cards. | The info panel shows "Your stake: N pts on <option>". Cards show "You: N on <option>". | Must | Built (mock) | `card.test`, `market.test` |

### 3.10 Market lifecycle (LCK)

| ID | Requirement | Acceptance criteria | Pri | Status | Test |
|---|---|---|---|---|---|
| LCK-01 | Markets move through OPEN → LOCKED → RESOLVED or CANCELLED. | No other transitions are possible (e.g. a RESOLVED market can't reopen or be resolved again). | Must | Built (mock) | Manual |
| LCK-02 | A market locks automatically at its deadline. | Once the deadline passes, the market is LOCKED on the next read without anyone acting, and betting stops. | Must | Built (mock) | `api.test` |
| LCK-03 | Time left is shown in plain language. | "3d left", "18h left", "Ends 8pm" (later today), "Ended", "Resolved" or "Nullified". | Must | Built (mock) | `format.test`, `card.test` |
| LCK-04 | Deadlines can't be changed after creation. | There's no way to edit a market's deadline, question or options once it exists. | Should | Built (mock) | — |

### 3.11 Resolution, nullification and payouts (RES)

| ID | Requirement | Acceptance criteria | Pri | Status | Test |
|---|---|---|---|---|---|
| RES-01 | Only the market's moderator can resolve or nullify it. | Anyone else gets 403 `FORBIDDEN` and sees no moderator panel. | Must | Built (mock) | `api.test` |
| RES-02 | Resolution happens only after the market closes. | The moderator panel appears only on LOCKED markets; resolving or nullifying an OPEN market is rejected. | Must | Built (mock) | `market.test` |
| RES-03 | The moderator sees a panel to decide the outcome. | On an ended market they moderate, the page shows "This market has ended — you're the moderator", one "Validate: <option>" button per option, and "Nullify market". | Must | Built (mock) | `market.test` |
| RES-04 | Resolving and nullifying ask for confirmation. | Both actions show a confirmation dialog; cancelling it does nothing. | Must | Built (mock) | `market.test` |
| RES-05 | Resolving pays winners from the whole pool. | Each winning bet receives floor(stake × pool ÷ winning option total). Losing bets receive nothing. Payouts are credited immediately. | Must | Built (mock) | `api.test` |
| RES-06 | Rounding leftovers aren't lost. | Points left over from rounding down go to the largest winning bet, so total paid out equals the pool. | Should | Not built — mock drops the remainder | — |
| RES-07 | If nobody backed the winning option, everyone is refunded. | Resolving to an option with no bets refunds every bet in full. | Must | Built (mock) | Manual |
| RES-08 | Nullifying refunds every bet in full. | After nullifying, every bettor gets back exactly what they bet and the market shows "This market was nullified — all bets refunded." | Must | Built (mock) | `api.test`, `market.test` |
| RES-09 | Settled markets show the outcome. | A resolved market shows a green banner "Resolved: <option> — payouts settled." Cards show "Resolved: <option>" or "Nullified · refunded". | Must | Built (mock) | `market.test`, `card.test` |
| RES-10 | A market can only be settled once. | Resolving or nullifying an already settled market is rejected; nobody is paid twice. | Must | Built (mock) | Manual |
| RES-11 | Settlement is recorded. | Resolving stores the winning option, who resolved it, when, and optional notes. | Must | Backend only | Manual |
| RES-12 | Bet results are recorded per position. | Each position ends as WON, LOST or REFUNDED with its payout, visible in the user's bet history. | Must | Built (mock) | `api.test`, `account.test` |

### 3.12 Mod Queue (MOD)

| ID | Requirement | Acceptance criteria | Pri | Status | Test |
|---|---|---|---|---|---|
| MOD-01 | Moderators have one place to see their markets. | `/mod-queue` lists "Needs resolution" (ended markets they moderate) and "Active — you moderate" (open ones). | Must | Built (mock) | `api.test`, `account.test` |
| MOD-02 | Moderators can resolve straight from the queue. | Each pending market shows one button per option and "Nullify"; acting removes it from the list. | Must | Built (mock) | `account.test` |
| MOD-03 | The nav shows how many markets need a decision. | The Mod Queue tab shows a red badge with the pending count, hidden when zero. It updates after resolving. | Must | Built (mock) | `nav.test` |
| MOD-04 | Empty states are friendly. | No pending markets shows "Nothing waiting on you — nice."; no active ones shows "No open markets to watch." | Should | Built (mock) | `account.test` |

### 3.13 Home feed and search (FEED)

| ID | Requirement | Acceptance criteria | Pri | Status | Test |
|---|---|---|---|---|---|
| FEED-01 | Home greets the user. | Heading "Hey <username> — here's what's heating up." | Should | Built (mock) | `home.test` |
| FEED-02 | Home lists the user's communities. | The sidebar lists every community the user belongs to, with Public/Private, each linking to it, plus "Discover more →". | Must | Built (mock) | `home.test` |
| FEED-03 | Home shows trending markets from the user's private communities. | Up to 3 OPEN markets from private communities the user belongs to, highest volume first. | Must | Built (mock) | `api.test`, `home.test` |
| FEED-04 | Home shows trending markets from public communities. | Up to 3 OPEN markets from any public community (joined or not), highest volume first. | Must | Built (mock) | `api.test`, `home.test` |
| FEED-05 | Search filters the trending markets. | Typing in "Search markets or communities" shows only markets whose question or community name contains the text (case-insensitive). A section with no matches says "No markets match your search." | Should | Built (mock) | `home.test` |
| FEED-06 | Search covers all markets, not only the ones shown. | Searching finds any market the user can see, not just the top 3 per section. | Could | Not built — filters the loaded top 3 only | — |

### 3.14 Market activity (ACT)

| ID | Requirement | Acceptance criteria | Pri | Status | Test |
|---|---|---|---|---|---|
| ACT-01 | The market page shows recent bets. | "Recent activity" lists the latest bets as "<user> bet N pts on <option>" with how long ago, newest first (up to 8). | Must | Built (mock) | `market.test` |
| ACT-02 | New bets appear in activity right away. | After placing a bet, it appears at the top of Recent activity without a reload. | Should | Built (mock) | `market.test` |

### 3.15 Leaderboards and prediction stats (LDR)

| ID | Requirement | Acceptance criteria | Pri | Status | Test |
|---|---|---|---|---|---|
| LDR-01 | Each community has a leaderboard. | Members are ranked by net profit (winnings minus stakes) within that community, showing correct/total predictions and accuracy. | Should | Not built — API defined, no UI, mock returns placeholders | — |
| LDR-02 | Prediction stats update when markets settle. | After a market resolves, each participant's total and correct predictions update. Refunded bets don't count. | Should | Backend only | Manual |
| LDR-03 | The prediction score formula is defined. | `users.prediction_score` has a documented formula agreed by the team. | Should | Not built — formula undecided | — |

### 3.16 Navigation and layout (NAV)

| ID | Requirement | Acceptance criteria | Pri | Status | Test |
|---|---|---|---|---|---|
| NAV-01 | A sticky top bar is on every app page. | Shows the Huddle logo (links Home), tabs Home / Discover / Mod Queue, balance, "+ Create" and avatar. It stays visible while scrolling. | Must | Built (mock) | `nav.test` |
| NAV-02 | The current tab is highlighted. | The tab for the current section is filled dark; the others aren't. | Should | Built (mock) | `nav.test` |
| NAV-03 | "+ Create" offers both create actions. | Opens a menu with "New community" and "New market"; clicking outside closes it. | Must | Built (mock) | `nav.test` |
| NAV-04 | Pages work on phones. | At 375px wide every page is usable with no sideways scrolling; the Home sidebar stacks above the feed and the market page stacks its info panel below. | Must | Built (mock) | Manual |
| NAV-05 | Unknown pages show a not-found screen. | Visiting an unknown URL, or a market/community ID that doesn't exist, shows a clear "not found" message. | Should | Partial — missing IDs show the API error text | Manual |
| NAV-06 | The browser tab is titled "Huddle". | Page title is "Huddle". | Could | Built (mock) | Manual |

### 3.17 Loading, empty and error states; formatting (UX)

| ID | Requirement | Acceptance criteria | Pri | Status | Test |
|---|---|---|---|---|---|
| UX-01 | Pages show placeholders while loading. | Lists and detail pages show grey skeleton blocks until data arrives; no layout jump or blank page. | Should | Built (mock) | Manual |
| UX-02 | Every list has an empty state. | Each list shows a short message when there's nothing to show instead of an empty area. | Should | Built (mock) | `home.test`, `account.test` |
| UX-03 | Server errors are shown in plain language. | Failed actions show the API's message in a red note next to the action. Form field errors appear under the relevant field. | Must | Built (mock) | `market.test`, `account.test` |
| UX-04 | Buttons show progress and prevent double submits. | While an action is in flight its button is disabled and reads "Placing…", "Creating…", "Joining…", etc. | Must | Built (mock) | Manual |
| UX-05 | Numbers are formatted consistently. | Balances and amounts use thousands separators; volume abbreviates thousands ("3.2k pts"); probabilities are whole percents. | Should | Built (mock) | `format.test` |
| UX-06 | Relative times are readable. | Activity shows "40m ago", "5h ago", "2d ago". | Should | Built (mock) | `format.test` |
| UX-07 | The app matches the Huddle design. | Colours, Nunito font, spacing and components match the Claude Design file (`Huddle.dc.html`) on every screen it covers. | Should | Built (mock) | Manual |

### 3.18 Accessibility (A11Y)

| ID | Requirement | Acceptance criteria | Pri | Status | Test |
|---|---|---|---|---|---|
| A11Y-01 | Everything can be done with a keyboard. | Every link, button, toggle, form and dialog is reachable with Tab and usable with Enter/Space; focus is always visible. | Must | Partial — not audited | Manual |
| A11Y-02 | Form fields have labels. | Every input has a visible label or an accessible name. | Must | Built (mock) | `market.test`, `account.test` |
| A11Y-03 | Dialogs behave like dialogs. | The invite dialog is announced as a dialog, closes on Escape, and returns focus to "Invite people" when closed. | Should | Partial — focus isn't returned yet | `community.test` |
| A11Y-04 | Selected outcomes are announced. | Outcome buttons expose their selected state (`aria-pressed`). | Should | Built (mock) | `market.test` |
| A11Y-05 | Colour isn't the only signal. | Yes/No, win/loss and public/private always have a text label as well as a colour. | Should | Built (mock) | Manual |
| A11Y-06 | Text meets contrast guidelines. | Body text and controls meet WCAG AA contrast (4.5:1; 3:1 for large text). | Should | Partial — the design's faint grey (#A39C90) on cream is below 4.5:1 | Manual |
| A11Y-07 | The chart has a text alternative. | The probability chart has an accessible name, and current percentages are shown as text in the legend. | Should | Built (mock) | `market.test` |

---

## 4. API, security and data requirements

These apply mainly to the Go backend. The frontend mock follows them so the UI can be built against them today.

### 4.1 API conventions (API)

| ID | Requirement | Acceptance criteria | Pri | Status | Test |
|---|---|---|---|---|---|
| API-01 | The API matches the contract. | Every endpoint in [api-contract.md](api-contract.md) exists with the documented path, method, request and response shape. | Must | Built (mock) | `api.test` |
| API-02 | JSON uses camelCase; IDs are numbers; times are ISO-8601 UTC; points are integers. | Checked on every response. | Must | Built (mock) | Manual |
| API-03 | Every error uses the same shape. | `{ "error": { "code", "message", "fields"? } }` with the documented HTTP status for each code. | Must | Built (mock) | `api.test` |
| API-04 | Error codes are the documented ones. | Only `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `INSUFFICIENT_FUNDS`, `MARKET_CLOSED`, `ALREADY_MEMBER`, `INVALID_INVITE_CODE`, `OPTION_SWITCH_NOT_ALLOWED` are returned. | Must | Built (mock) | `api.test` |
| API-05 | Validation errors say which field is wrong. | `VALIDATION_ERROR` responses include `fields` naming each invalid field. | Should | Built (mock) | `account.test` |
| API-06 | Lists are paginated. | List endpoints accept `cursor` and `limit` and return `nextCursor` (null at the end). | Should | Partial — mock honours `limit` only | — |
| API-07 | Placing a bet returns everything the UI needs. | The response includes the position, the updated market and the new balance, so no second request is needed. | Must | Built (mock) | `api.test` |
| API-08 | The frontend reaches the API through `/api/v1`. | In real-backend mode the browser calls `/api/v1/*` on the Next.js site, which proxies to `API_URL`. | Must | Built | Manual |

### 4.2 Security and authorization (SEC)

| ID | Requirement | Acceptance criteria | Pri | Status | Test |
|---|---|---|---|---|---|
| SEC-01 | Every endpoint except register, login and refresh requires a valid access token. | Calling any other endpoint without an `access_token` cookie, or with an invalid or expired one, returns `401 UNAUTHORIZED`. | Must | Backend only | Manual |
| SEC-02 | Private data stays private. | Non-members can't read a private community, its markets, members or activity through any endpoint. | Must | Built (mock) | `market.test` |
| SEC-03 | Users act only as themselves. | No endpoint lets a user place bets, deposit, join or resolve on behalf of someone else; the acting user always comes from the verified token's `user_id`, never from the request. | Must | Built (mock) | Manual |
| SEC-04 | Permission checks happen on the server. | Hiding a button in the UI is never the only protection; every rule in the permission matrix (§5) is enforced by the API. | Must | Built (mock) | `api.test` |
| SEC-05 | Emails and balances aren't exposed to other users. | `UserSummary` and public profiles never include email or balance. | Must | Built (mock) | Manual |
| SEC-06 | Inputs are safe to display. | User text (names, questions, descriptions) is shown as plain text; HTML or scripts entered are never executed. | Must | Built (React escapes by default) | Manual |
| SEC-07 | Login is protected against brute force. | Repeated failed logins from one account or IP are rate-limited. | Should | Not built | — |
| SEC-08 | Deposits are rate-limited. | A user can't make unlimited deposit requests per minute. | Could | Not built | — |
| SEC-09 | Cookie-based auth is protected against cross-site requests. | Auth cookies are `SameSite=Lax`, every state-changing endpoint is `POST`/`PATCH`/`DELETE` and requires a JSON body, and the API doesn't send permissive CORS headers. | Should | Backend only | Manual |

### 4.3 Data integrity and concurrency (DATA)

| ID | Requirement | Acceptance criteria | Pri | Status | Test |
|---|---|---|---|---|---|
| DATA-01 | Money-moving actions are all-or-nothing. | Placing a bet, depositing, resolving and nullifying each run in one database transaction; a failure part-way leaves no partial changes. | Must | Backend only | Manual |
| DATA-02 | Simultaneous bets can't overspend. | Two bets sent at the same time from the same user can't together exceed their balance (wallet row is locked during the check). | Must | Backend only | Manual |
| DATA-03 | Simultaneous resolves can't double-pay. | Two resolve requests at once result in exactly one settlement. | Must | Backend only | Manual |
| DATA-04 | Pool totals always match the positions. | For every market, each option's total equals the sum of its positions, and the pool equals the sum of all positions. | Must | Backend only | Manual |
| DATA-05 | Points are conserved. | After settlement, total paid out equals the pool (resolved) or total staked (nullified). No points are created or destroyed except by deposits and sign-up bonuses. | Must | Partial — see RES-06 | Manual |
| DATA-06 | Uniqueness is enforced in the database. | Unique constraints on username, email, (community, user) membership, one wallet per user and invite codes. | Must | Backend only | Manual |

### 4.4 Performance (PERF)

| ID | Requirement | Acceptance criteria | Pri | Status | Test |
|---|---|---|---|---|---|
| PERF-01 | Pages are quick on a normal connection. | Home, market and community pages show content within 2 seconds on broadband with a local backend. | Should | Built (mock) | Manual |
| PERF-02 | API calls are fast. | 95% of API requests finish in under 300 ms with MVP-sized data (hundreds of users, thousands of bets). | Should | Backend only | Manual |
| PERF-03 | Data isn't refetched needlessly. | Navigating back to a page within 30 seconds reuses cached data; mutations refresh only affected data. | Could | Built (mock) | Manual |

### 4.5 Developer tooling (DEV)

| ID | Requirement | Acceptance criteria | Pri | Status | Test |
|---|---|---|---|---|---|
| DEV-01 | The frontend runs without the backend. | With `NEXT_PUBLIC_API_MOCK` unset or `true`, every screen works against the in-memory mock seeded with the design's sample data. | Must | Built | All tests |
| DEV-02 | Switching to the real backend needs no code changes. | Building and running with `NEXT_PUBLIC_API_MOCK=false`, `API_URL` and the backend's `public.pem` (`JWT_PUBLIC_KEY_PATH` or `JWT_PUBLIC_KEY`) makes the app use the Go API with the route guard on. | Must | Built (checked against a production build with a test key; not yet against the real backend) | Manual |
| DEV-03 | Automated tests run with one command. | `npm test` in `frontend/` runs the whole suite in under a minute with no backend or browser. | Must | Built | — |
| DEV-04 | Tests are isolated. | Each test starts from the seeded data; test order doesn't change results. | Must | Built | All tests |
| DEV-05 | Typecheck, lint and build pass. | `npx tsc --noEmit`, `npm run lint` and `npm run build` succeed on `dev`. | Must | Built | — |

---

## 5. Permission matrix

What each actor may do. ✓ = allowed, ✗ = must be refused by the API (403) and hidden in the UI.

| Action | Visitor | Non-member | Member | Community creator | Market moderator |
|---|---|---|---|---|---|
| View a public community and its markets | ✗ | ✓ | ✓ | ✓ | ✓ |
| View a private community and its markets | ✗ | ✗ | ✓ | ✓ | ✓ |
| Join a public community directly | ✗ | ✓ | — | — | — |
| Join a private community | ✗ | Invite code only | — | — | — |
| See / share the invite code | ✗ | ✗ | ✗ (unless MODERATOR) | ✓ | — |
| Create a market in the community | ✗ | ✗ | ✓ | ✓ | ✓ |
| Bet on an OPEN market | ✗ | ✗ | ✓ | ✓ | ✓ |
| Resolve or nullify a LOCKED market | ✗ | ✗ | ✗ | ✗ (unless they're its moderator) | ✓ |
| Deposit points into own wallet | ✗ | ✓ | ✓ | ✓ | ✓ |

**Open question:** should a market's moderator be allowed to bet on that market? The design allows it (Jordan moderates "Trivia champion crowned tonight" and appears as an outcome). Allowing it is a conflict of interest. Decide and add a requirement (proposed **RES-13**).

---

## 6. End-to-end acceptance scenarios

Run these by hand against the full stack (frontend + Go backend) before declaring the MVP viable. Each lists the requirements it exercises.

**E2E-1 — New user to first bet** (AUTH-01, AUTH-05, DSC-03, BET-01, WAL-02)
1. Register a new account → Home shows "Hey <name>", balance 1,000 pts.
2. Discover → Join "NYC Weather Watchers" → button shows "Joined ✓".
3. Open "Will it snow in NYC before Nov 1?" → pick Yes → bet 100.
4. See "Bet placed — 100 pts on Yes.", balance 900 pts, Yes percentage up, your bet at the top of Recent activity.

**E2E-2 — Private community with friends** (COM-01, COM-06, COM-12, INV-01, INV-02, MKT-07)
1. User A creates a private community "Test Crew".
2. A opens "Invite people" and copies the link.
3. User B (another browser) opens the link → sees Test Crew's details → Accept & join.
4. A creates a Yes/No market in Test Crew closing in 10 minutes, choosing B as moderator.
5. B sees the market; a signed-in user C who isn't a member gets "This community is invite-only".

**E2E-3 — Resolve and pay out** (LCK-02, RES-02, RES-03, RES-05, MOD-03, USR-04)
1. Continuing E2E-2: A bets 100 on Yes, B's friend D bets 300 on No.
2. Wait for the deadline → market shows "Ended"; betting is gone.
3. B's nav shows a Mod Queue badge of 1. B opens the market → "Validate: Yes" → confirm.
4. Banner shows "Resolved: Yes — payouts settled." A's balance rises by 400 (the whole pool). D's history shows "Lost 300 pts". B's badge disappears.

**E2E-4 — Nullify** (RES-08, USR-04)
1. Create a market, have two users bet, let it close.
2. Moderator clicks "Nullify market" → confirm.
3. Both users' balances return to what they were before betting; both histories show "Refunded".

**E2E-5 — Guard rails** (BET-04, BET-05, BET-08, MKT-06, WAL-04, RES-01)
1. Try to bet more than your balance → "You only have N pts".
2. Bet on Yes, then try No on the same market → "You already bet on "Yes"".
3. Try to create a market closing yesterday → field error, nothing created.
4. Try to deposit 0 and 2,000,000 → Add stays disabled.
5. As a non-moderator, call the resolve endpoint directly → 403.

**E2E-6 — Top up** (WAL-03, WAL-08)
1. Click the balance → +1,000 → balance up 1,000 and "Added 1,000 pts."
2. Check the database: one `DEPOSIT` transaction of +1,000 with the right `balance_after`.

**E2E-7 — Concurrency** (DATA-02, DATA-03)
1. With 100 pts, fire two 100-pt bets at the same instant (e.g. two `curl` calls) → exactly one succeeds.
2. Fire two resolve requests at once → one settlement, winners paid once.

**E2E-8 — Token lifecycle** (AUTH-07, AUTH-13, AUTH-17, AUTH-18, AUTH-19, AUTH-08)
1. Log in → browser devtools show `access_token` and `refresh_token` cookies, both HttpOnly with Path=/. Decode `access_token` (e.g. jwt.io): header `alg: EdDSA`, payload has `user_id` and `exp`.
2. Wait for the access token to expire (or delete only the `access_token` cookie) → reload a page → it loads normally and both cookies have new values.
3. Stay on a page past expiry and place a bet → it succeeds without a login prompt (one `/auth/refresh` call in the network tab).
4. Delete both cookies → reload → redirected to `/login?next=…`; log in → back on the same page.
5. Log out → a refresh token copied before logging out is rejected by `/auth/refresh` (401).

---

## 7. Known gaps and open decisions

Items the team needs to act on or decide before the MVP is viable. Each links to the requirements it affects.

| # | Gap or decision | Affects | Suggested action |
|---|---|---|---|
| 1 | `NEXT_PUBLIC_API_MOCK` is baked in at build time, so a production build made without `NEXT_PUBLIC_API_MOCK=false` runs in mock mode with the route guard off. | AUTH-09, AUTH-23, DEV-02 | Always build with `NEXT_PUBLIC_API_MOCK=false` for any environment that talks to the Go backend (add it to CI/deploy config). |
| 2 | Mock login accepts any credentials. | AUTH-06 | Resolved automatically once the backend is connected; add a login failure test then. |
| 3 | Rounding remainder from payouts isn't distributed. | RES-06, DATA-05 | Implement in the backend's settlement transaction. |
| 4 | Public-community non-members can bet in the mock. | BET-09 | Decide: must users join before betting? Recommended: yes. Enforce in backend and mock. |
| 5 | Can a moderator bet on their own market? | §5 | Decide and add RES-13. |
| 6 | Unknown moderator usernames are silently dropped. | COM-04 | Return a field error listing unknown names. |
| 7 | No UI for leaderboards, members, leaving, roles, invite reset, editing, transactions, other profiles. | LDR-01, COM-15–18, WAL-09, USR-07–08 | Not in the Claude Design file. Decide which are MVP. |
| 8 | Market description can't be entered. | MKT-14 | Add a description field to the create form. |
| 9 | Search only filters the three trending markets per section. | FEED-06 | Add a `q` parameter to `GET /markets` for server-side search. |
| 10 | Prediction score formula undefined. | LDR-03 | Agree a formula (e.g. accuracy weighted by number of predictions). |
| 11 | Design's faint grey text fails contrast. | A11Y-06 | Darken `--color-faint` slightly, or confirm the design choice. |
| 12 | Deposits have no off switch or rate limit. | WAL-10, SEC-08 | Put the endpoint behind a config flag. |
| 13 | Schema additions from the contract (visibility, price history, `DEPOSIT` type) need to be in the backend migrations. | COM-*, ODD-03, WAL-03 | Backend to confirm against `api-contract.md` §1 rows 12–15. |
| 14 | Auth cookies must use `Path=/`. If the backend scopes `refresh_token` to `/api/v1/auth`, the page guard can't see it and users are sent to login instead of refreshed. | AUTH-07, AUTH-17 | Backend to set `Path=/` on both cookies (see api-contract.md → Authentication). |
| 15 | Access and refresh token lifetimes aren't agreed. | AUTH-13, AUTH-19 | Suggested: 15 minutes and 7–30 days. |

---

## 8. Traceability summary

| Area | Requirements | Built | Partial | Not built | Backend only | Has automated test |
|---|---|---|---|---|---|---|
| AUTH | 23 | 14 | 4 | 0 | 5 | 12 |
| USR | 8 | 6 | 0 | 2 | 0 | 4 |
| WAL | 10 | 6 | 0 | 2 | 2 | 5 |
| COM | 19 | 14 | 1 | 4 | 0 | 13 |
| DSC | 4 | 4 | 0 | 0 | 0 | 4 |
| INV | 5 | 4 | 0 | 0 | 1 | 4 |
| MKT | 15 | 14 | 1 | 0 | 0 | 10 |
| ODD | 6 | 6 | 0 | 0 | 0 | 5 |
| BET | 11 | 10 | 1 | 0 | 0 | 7 |
| LCK | 4 | 4 | 0 | 0 | 0 | 2 |
| RES | 12 | 10 | 0 | 1 | 1 | 8 |
| MOD | 4 | 4 | 0 | 0 | 0 | 4 |
| FEED | 6 | 5 | 0 | 1 | 0 | 5 |
| ACT | 2 | 2 | 0 | 0 | 0 | 2 |
| LDR | 3 | 0 | 0 | 2 | 1 | 0 |
| NAV | 6 | 5 | 1 | 0 | 0 | 3 |
| UX | 7 | 7 | 0 | 0 | 0 | 4 |
| A11Y | 7 | 4 | 3 | 0 | 0 | 4 |
| API | 8 | 7 | 1 | 0 | 0 | 5 |
| SEC | 9 | 5 | 0 | 2 | 2 | 2 |
| DATA | 6 | 0 | 1 | 0 | 5 | 0 |
| PERF | 3 | 2 | 0 | 0 | 1 | 0 |
| DEV | 5 | 5 | 0 | 0 | 0 | 2 |
| **Total** | **183** | **138** | **13** | **14** | **18** | **105** |

Counts are a snapshot; the tables in §3 and §4 are authoritative. Update the Status and Test columns in the same PR that changes the behaviour.
