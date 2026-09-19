# SplitMate

A Splitwise-style shared-expense splitting application. Create groups with friends, log expenses (who paid, how to split), and let the app calculate who owes whom. It handles balance tracking, deterministic rounding for uneven splits, debt simplification to minimize transactions, and settlement recording — all with real-time updates so every group member sees changes instantly. Built as a full-stack TypeScript monorepo with React, NestJS, PostgreSQL, and Socket.IO.

## Features

- User registration and authentication (JWT with refresh token flow)
- Group creation and management
- Add/remove members (owner-only)
- Shared expenses with EQUAL and EXACT splits
- Deterministic rounding for equal splits (no money lost or invented)
- Balance calculation and debt simplification
- Settlement recording with validation
- Real-time updates via WebSocket (Socket.IO)
- Activity feed (reverse-chronological, paginated)
- Personal expense and settlement history across all groups
- Server-side pagination and sorting for expenses
- Dashboard with aggregated balances, group count, highest-debt group, and recent activity feed
- Frontend: loading states, inline validation errors, disabled buttons during requests

## How to Run

### Clean Clone (Docker — recommended)

```bash
git clone <repo-url> && cd SplitMate
docker compose up --build
```

- **Frontend:** http://localhost (nginx, port 80)
- **Backend API:** http://localhost:3001 (proxied through nginx)
- **PostgreSQL:** localhost:5432

The API container runs Prisma migrations and seeds the database automatically on first start. Three test users are created (Alice, Bob, Charlie — all with password `Test1234`).

To stop and remove volumes:

```bash
docker compose down -v
```

### Clean Clone (Local Development)

```bash
git clone <repo-url> && cd SplitMate

# Start PostgreSQL
docker compose up -d postgres

# Install dependencies (npm workspaces installs root + apps/api + apps/web)
npm install

# Set up database
cd prisma
npx prisma migrate dev
npx prisma generate
cd ..
npm run seed

# Start both API and frontend in development mode
npm run dev
```

- **API:** http://localhost:3001 (ts-node-dev with hot reload)
- **Frontend:** http://localhost:5173 (Vite dev server with HMR)
- Vite proxies `/api` and `/socket.io` to localhost:3001

### Environment Variables

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/splitmate?schema=public"
JWT_ACCESS_SECRET="your-access-token-secret-change-in-production"
JWT_REFRESH_SECRET="your-refresh-token-secret-change-in-production"
ACCESS_TOKEN_EXPIRES_IN="15m"
REFRESH_TOKEN_EXPIRES_IN="30d"
PORT=3001
CLIENT_URL="http://localhost:5173"
```

## Stack Choice and Why

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | React 18 + TypeScript + Vite | React is the team's strongest framework. Vite gives instant HMR and fast builds. TypeScript catches type errors at compile time. |
| **Styling** | Tailwind CSS | Rapid UI development with utility classes. No CSS-in-JS runtime overhead. Consistent design tokens. |
| **Data Fetching** | TanStack Query (React Query) | Handles caching, refetching, optimistic updates, and loading/error states declaratively. Reduces boilerplate for the dozens of API calls in the app. |
| **Backend** | NestJS + TypeScript | Opinionated structure (modules, controllers, services, guards) scales well. Dependency injection makes testing easier. TypeScript shared with frontend. |
| **ORM** | Prisma | Type-safe database queries. Schema-as-code with migrations. Eliminates raw SQL string errors. |
| **Database** | PostgreSQL 16 | ACID compliance is critical for financial data. JSONB support for activity metadata. Proven reliability. |
| **Real-time** | Socket.IO | Built-in reconnection, room-based event scoping, and HTTP long-polling fallback. Avoids reimplementing heartbeat and fallback logic from scratch. |
| **Auth** | Passport.js + JWT | Stateless tokens for API auth. Refresh token rotation for security without requiring server-side sessions. |
| **Monorepo** | npm workspaces | Shared `package.json` at root. Single `npm install` for everything. No extra tooling like Turborepo needed at this scale. |
| **Containerization** | Docker Compose | Reproducible dev and production environments. Multi-stage builds keep images small. |

## Data Model

```
┌──────────┐       ┌──────────────┐       ┌──────────┐
│  users   │──1:N──│ group_members │──N:1──│  groups  │
│          │       │  (junction)  │       │          │
│ id (PK)  │       │ groupId+     │       │ id (PK)  │
│ name     │       │   userId     │       │ name     │
│ email    │       │   (comp PK)  │       │ ownerId  │
│ password │       └──────────────┘       └────┬─────┘
│ hash     │                                   │
└──┬───┬───┘                                   │
   │   │                                       │
   │   │  ┌──────────────┐  ┌──────────────┐  │  ┌──────────────┐
   │   │  │  expenses    │  │  settlements  │  │  │  activities  │
   │   │  │              │  │              │  │  │              │
   │   │  │ id (PK)     │  │ id (PK)     │  │  │ id (PK)     │
   │   ├──│ createdById  │  │ fromUserId   │  ├──│ actorId     │
   │   ├──│ paidById     │  │ toUserId     │  │  │ type (enum) │
   │   │  │ groupId (FK) │──│ groupId (FK) │  │  │ groupId(FK) │
   │   │  │ amount       │  │ amount       │  │  │ metadata    │
   │   │  │ splitType    │  │ createdById  │  │  │ (JSONB)     │
   │   │  └──────┬───────┘  └──────────────┘  │  └──────────────┘
   │   │         │                             │
   │   │  ┌──────┴───────┐                    │
   │   │  │expense_shares│                    │
   │   │  │              │                    │
   │   │  │ id (PK)     │                    │
   │   ├──│ userId       │                    │
   │   │  │ expenseId(FK)│                    │
   │   │  │ amount       │                    │
   │   │  └──────────────┘                    │
   │   │                                      │
   │   │  ┌──────────────┐                    │
   │   │  │refresh_tokens│                    │
   │   │  │              │                    │
   │   └──│ userId (FK)  │                    │
   │      │ tokenHash    │                    │
   │      │ expiresAt    │                    │
   │      │ revokedAt    │                    │
   │      └──────────────┘                    │
   │                                          │
   └──────────────────────────────────────────┘
```

### Tables

| Table | Purpose |
|-------|---------|
| `users` | id, name, email (unique), password_hash, created_at, updated_at |
| `refresh_tokens` | id, user_id (FK → users, CASCADE DELETE), token_hash, expires_at, revoked_at, created_at |
| `groups` | id, name, owner_id (FK → users), created_at, updated_at |
| `group_members` | group_id + user_id (composite PK, both FKs with CASCADE DELETE), joined_at |
| `expenses` | id, group_id (FK → groups, CASCADE DELETE), created_by_id, paid_by_id, description, amount (INTEGER paise), expense_date, split_type (EQUAL/EXACT), created_at, updated_at |
| `expense_shares` | id, expense_id (FK → expenses, CASCADE DELETE), user_id (FK, CASCADE DELETE), amount (INTEGER paise). Unique constraint on (expense_id, user_id) |
| `settlements` | id, group_id (FK → groups, CASCADE DELETE), from_user_id, to_user_id, amount (INTEGER paise), created_by_id, created_at |
| `activities` | id, group_id (FK → groups, CASCADE DELETE), actor_id, type (EXPENSE_ADDED/EXPENSE_EDITED/EXPENSE_DELETED/MEMBER_ADDED/MEMBER_REMOVED/SETTLEMENT_RECORDED), metadata (JSONB), created_at |

### How They Relate

- A **User** can own many **Groups** (one-to-many via `owner_id`) and be a member of many **Groups** (many-to-many via `group_members`).
- A **Group** has many **Expenses**, **Settlements**, **Activities**, and **Members** (via `group_members`).
- An **Expense** belongs to one **Group**, is created by one **User**, paid by one **User**, and has many **ExpenseShares** (one per participant).
- An **ExpenseShare** links an **Expense** to a **User** with the amount that user owes for that expense.
- A **Settlement** records a payment from one **User** to another within a **Group**, created by one **User**.
- An **Activity** logs every mutation (expense added/edited/deleted, member added/removed, settlement recorded) with the actor and metadata.
- All child records cascade-delete when their parent group or user is removed — no orphaned references.

## Financial Precision

### How Money is Stored

All amounts are stored as **INTEGER columns representing paise** (1/100 of a rupee). No floating-point arithmetic is used anywhere in the system.

- **Frontend → API:** Users type decimal amounts (e.g., `100.50`). Before sending, the value is converted: `Math.round(parseFloat(amountStr) * 100)`. So `₹100.50` becomes `10050` paise.
- **API → Database:** The integer is stored directly. Prisma schema declares `amount Int`, SQL migration creates `amount INTEGER NOT NULL`.
- **Database → Frontend:** The integer is divided by 100 for display using `formatCurrency()`.

**Why integers?** Floating-point numbers cannot exactly represent most decimal values. `0.1 + 0.2 = 0.30000000000000004` in IEEE 754. For a financial app where every paisa counts, this is unacceptable. Integer paise guarantee exact arithmetic with zero precision loss.

### Rounding Rule for Uneven Splits

When splitting an amount equally among N participants, the division may not be exact. The algorithm distributes the remainder deterministically:

```
baseShare = floor(totalAmount / participantCount)
remainder = totalAmount - (baseShare * participantCount)
```

Participant IDs are sorted lexicographically. The first `remainder` participants each get `baseShare + 1`. All others get `baseShare`. The shares always sum to the exact total — no money is lost or invented.

**Examples:**
- ₹900 split among 3 → base = 300, remainder = 0 → each pays ₹300
- ₹100 split among 3 → base = 33, remainder = 1 → first user pays ₹34, others pay ₹33. Total: 34 + 33 + 33 = 100
- ₹7 split among 3 → base = 2, remainder = 1 → first user pays ₹3, others pay ₹2. Total: 3 + 2 + 2 = 7

For **EXACT** splits, the user specifies each participant's share explicitly. The API validates that all shares sum to the total amount.

### Balance Calculation

For each user in a group, computed on-the-fly (not stored):

```
netBalance = totalPaid - totalOwed + totalSettledReceived - totalSettledSent
```

- **Positive balance:** the user is owed money (creditor)
- **Negative balance:** the user owes money (debtor)
- **Zero:** fully settled

### Debt Simplification

Uses a greedy matching algorithm to minimize the number of transactions needed to settle all debts:

1. Calculate net balance for each user in the group
2. Partition into debtors (negative balance) and creditors (positive balance)
3. Sort debtors ascending (most negative first) and creditors descending (most positive first)
4. Transfer `min(|debtor|, creditor)` from debtor to creditor
5. Advance pointers and repeat until all balances are zero

**Example:**
- Alice owes ₹500, Bob is owed ₹300, Charlie is owed ₹200
- Alice pays Bob ₹300, Alice pays Charlie ₹200 → 2 transactions instead of 4

## Authentication

### Password Rules

Passwords are validated on both frontend and backend with the same rules:
- Minimum 8 characters
- At least one uppercase letter (A-Z)
- At least one lowercase letter (a-z)
- At least one digit (0-9)

Passwords are hashed with **bcrypt** (10 salt rounds). Plaintext passwords are never stored or transmitted after hashing.

### Refresh Token Flow

**What is stored where:**

| What | Where | Details |
|------|-------|---------|
| Access token (raw) | Frontend JS variable + `localStorage` (`splitmate_access_token`) | 15-minute lifetime |
| Refresh token (raw) | Frontend `localStorage` (`splitmate_refresh_token`) | 30-day lifetime |
| Refresh token (hash) | `refresh_tokens` table in PostgreSQL | bcrypt hash, with `expiresAt` and `revokedAt` |

**What happens on expiry (step by step):**

1. API returns **401** (expired access token)
2. Axios interceptor catches the 401. A **mutex** (`isRefreshing`) prevents multiple simultaneous refresh attempts.
3. If already refreshing, the failed request is pushed to a **queue** (`failedQueue`). All queued requests will retry once the new token arrives.
4. Interceptor calls `POST /api/auth/refresh` with the refresh token in the request body.
5. **Server-side:** The refresh token is hashed with bcrypt and looked up in `refresh_tokens`. If a matching non-revoked, non-expired token exists:
   - It is **revoked** (old token is invalidated — token rotation)
   - A new access + refresh token pair is generated
   - The new refresh token hash is stored in the database
   - Both new tokens are returned
6. **Frontend:** Stores the new tokens, processes the queue (retries all queued requests with the new access token), and retries the original failed request.
7. **On failure:** Tokens are cleared, all queued requests are rejected, and the user is redirected to `/login`.

**Why this design?** Token rotation means a stolen refresh token is only valid for one use. The old token is revoked on the server, so if an attacker tries to reuse it, the legitimate user's next refresh will fail — alerting both parties.

## WebSocket (Real-time Updates)

### How Authentication Works

On connection, the client sends the JWT access token via the `auth` handshake option:

```typescript
socket = io("http://localhost:3001", {
  auth: { token: accessToken },
  transports: ["websocket", "polling"],
});
```

The gateway (`realtime.gateway.ts`) verifies the token in `handleConnection`:

1. Extract `token` from `client.handshake.auth.token`
2. Verify with `jwtService.verifyAsync(token, { secret: JWT_ACCESS_SECRET })`
3. If valid, store `client.data.userId = payload.sub` and keep the connection
4. If invalid, log a warning and call `client.disconnect()`

### How Events Reach Only the Right Group Members

Events are **never** broadcast globally. They are scoped to group rooms:

1. When a client wants to receive events for a group, they emit `joinGroup` with `{ groupId }`
2. The gateway verifies the user is a member of that group via `GroupMember` lookup in the database
3. If authorized, the client joins Socket.IO room `group:{groupId}`
4. All mutations (expense created, settlement recorded, etc.) emit to `group:{groupId}` room only
5. Non-members of that group never join the room and never receive the events

This means a user only receives events for groups they are a member of. A user in Group A will never see events from Group B.

### Events

| Event | Trigger | Payload |
|-------|---------|---------|
| `group.expense.created` | Expense added | `{ expense, actorId }` |
| `group.expense.updated` | Expense edited | `{ expense, actorId }` |
| `group.expense.deleted` | Expense deleted | `{ expenseId, actorId }` |
| `group.settlement.created` | Settlement recorded | `{ settlement, actorId }` |
| `member:added` | Member added to group | `{ groupId, userId, addedBy }` |
| `member:removed` | Member removed from group | `{ groupId, userId, removedBy }` |
| `group:created` | Group created | `{ groupId, name, createdBy }` |
| `group:deleted` | Group deleted | `{ groupId, deletedBy }` |

### Disconnect and Reconnect Handling

- **Disconnect:** The gateway cleans up the `connectedUsers` map entry. Socket.IO handles the rest.
- **Reconnect:** Socket.IO uses automatic reconnection with exponential backoff. When the socket reconnects:
  - The client re-emits `joinGroup` for any active group view
  - The dashboard refetches on reconnect via the `connect` event listener
  - TanStack Query's `refetchOnWindowFocus` and `refetchOnReconnect` ensure stale data is refreshed
  - If the socket drops entirely, the app still works — all operations are REST-based, and the user can refresh to get current state

## What Was Hard and How I Worked Through It

### 1. Deterministic Rounding for Uneven Splits

**Problem:** When splitting ₹100 among 3 people, each person owes ₹33.33... but you can't pay a fraction of a paisa. naive rounding (33 + 33 + 33 = 99) loses a paisa. Rounding up for everyone (34 + 34 + 34 = 102) invents money.

**Solution:** Store everything in integer paise. For equal splits, compute `floor(total / count)` as the base, then distribute the remainder (`total - base * count`) to the first N participants by sorted user ID. This guarantees shares sum to the exact total with zero precision loss. The deterministic ordering (sorted user IDs) means the same split always produces the same result regardless of who requested it.

### 2. Refresh Token Rotation Without Breaking the UX

**Problem:** Token rotation (invalidating the old refresh token on use) is more secure, but if two browser tabs both try to refresh at the same time, one will succeed and the other will fail because the token was already revoked.

**Solution:** The frontend uses a mutex (`isRefreshing` flag) so only one refresh request goes out at a time. All other 401s are queued and retried once the new token arrives. This prevents the race condition while keeping the user logged in across tabs.

### 3. WebSocket Event Scoping

**Problem:** In a multi-group app, you can't broadcast all events to all connected users — that would be a privacy leak and a performance disaster.

**Solution:** Socket.IO rooms. Each group gets a room named `group:{groupId}`. The gateway verifies membership before allowing a client to join a room. Events are only emitted to the specific room. This gives us both security (only members see events) and performance (no wasted bandwidth on uninterested clients).

### 4. Debt Simplification Algorithm

**Problem:** With many users in a group, the naive approach (every debtor pays every creditor individually) creates O(n²) transactions. For a group of 10 people, this could mean dozens of transfers.

**Solution:** A greedy matching algorithm: sort debtors by most-negative, creditors by most-positive, and match them greedily. This minimizes the number of transactions to at most n-1 (where n is the number of participants with non-zero balance). It's the same approach Splitwise uses.

### 5. Monorepo Setup Without Heavy Tooling

**Problem:** Managing a backend and frontend as separate projects means duplicated configs, two `node_modules` directories, and no shared types.

**Solution:** npm workspaces. The root `package.json` declares `workspaces: ["apps/*"]`, so `npm install` installs everything in one go. Scripts in the root `package.json` use `concurrently` to run both apps in development. No Turborepo or Nx overhead — just native npm features.

## Known Issues / What Is Incomplete

### Security

- **Access token stored in localStorage:** While this avoids cookie-based CSRF, it's accessible to any XSS vulnerability. HttpOnly cookies would be more secure but require same-origin or careful CORS + cookie configuration.
- **CORS wildcard on WebSocket gateway:** `cors: { origin: '*' }` is wide open. In production behind nginx this is fine (same origin), but for a real deployment it should be restricted.
- **No rate limiting:** The login, registration, and refresh endpoints have no rate limiting, making brute-force attacks possible.
- **JWT secrets in `.env` files:** The root `.gitignore` only ignores `.env` at the root level, not in `apps/api/` or `prisma/`. These files with secrets are tracked by git.

### Functionality

- **Dashboard WebSocket listeners are dead code:** The dashboard listens for group events like `group.expense.created`, but the client never joins any group room from the dashboard. These listeners never fire — the dashboard relies entirely on `refetchOnWindowFocus`.
- **N+1 query in overall balance:** `getUserOverallBalance` calls `calculateGroupBalances` separately for each group, making 3N database queries for a user in N groups. Should be batched.
- **No concurrent settlement protection:** Two simultaneous settlements could both see valid debt and both be created, over-settling. A `SELECT ... FOR UPDATE` lock would fix this.

### Missing Features

- Only EQUAL and EXACT splits — no percentage-based splits
- No recurring/subscription expenses
- No push or email notifications
- No expense receipts or file attachments
- No user profile editing (name, password)
- No forgot-password flow
- No settlement undo/void

### Test Coverage

Tests exist for `auth.service`, `expenses.service`, `groups.service`, and `balances.service`, but no tests for `settlements.service`, `activities.service`, `realtime.gateway`, or any controller-level integration tests.

## What I Would Improve With More Time

1. **Move tokens to HttpOnly cookies** — Eliminates XSS risk for tokens. Requires same-origin or proxy setup, but the nginx proxy already handles this in production.
2. **Add rate limiting** — `@nestjs/throttler` on auth endpoints (e.g., 5 attempts/minute for login).
3. **Fix the N+1 balance query** — Write a single SQL query or use Prisma's `$queryRaw` to calculate all group balances in one round trip.
4. **Add percentage splits** — A third `SplitType` enum value with corresponding share calculation.
5. **Database indexes** — Add indexes on `group_members(group_id)`, `group_members(user_id)`, `expenses(group_id)`, `settlements(group_id)`, and `activities(group_id)` for faster queries.
6. **Add `SELECT ... FOR UPDATE` for settlements** — Prevent concurrent settlement over-creation.
7. **Improve test coverage** — Add integration tests for controllers, WebSocket gateway tests, and settlement edge cases.
8. **Add password reset flow** — Email-based reset with time-limited tokens.
9. **Add push notifications** — WebSocket events are already there; adding browser push notifications would keep users informed when they're not on the page.
10. **Fix the hardcoded Socket.IO URL** — Use an environment variable or derive from `window.location.origin` so it works in production.

## Where I Used AI and What I Learned

### Where AI Was Used

- **Code generation:** AI helped scaffold NestJS modules, controllers, services, and DTOs following NestJS conventions. It generated the initial Prisma schema and migration SQL.
- **Algorithm design:** The debt simplification algorithm and the equal-split rounding logic were designed with AI assistance — verifying edge cases and ensuring correctness.
- **Test writing:** AI generated the unit test suites for `auth.service`, `expenses.service`, `groups.service`, and `balances.service`, including edge cases I might have missed.
- **Debugging:** AI helped diagnose issues like the refresh token race condition, WebSocket room scoping, and cascade delete behavior in Prisma.
- **Documentation:** This README was written with AI assistance, pulling details from the actual codebase to ensure accuracy.

