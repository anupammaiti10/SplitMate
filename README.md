# SplitMate

A Splitwise-style shared-expense application built with React, NestJS, PostgreSQL, and Socket.IO.

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

## Architecture

- **Frontend:** React + TypeScript + Vite + Tailwind CSS + TanStack Query + Socket.IO client
- **Backend:** NestJS + TypeScript + Socket.IO
- **Database:** PostgreSQL with Prisma ORM
- **Authentication:** JWT access tokens (15min) + refresh tokens (30d), bcrypt password hashing
- **Docker:** Multi-stage builds — API (Node 20 Alpine + tini), Frontend (Nginx Alpine), PostgreSQL 16

## Data Model

| Entity | Fields |
|--------|--------|
| **User** | id, name, email (unique), passwordHash, createdAt, updatedAt |
| **RefreshToken** | id, userId (FK → User, cascade delete), tokenHash, expiresAt, revokedAt, createdAt |
| **Group** | id, name, ownerId (FK → User), createdAt, updatedAt |
| **GroupMember** | groupId (FK → Group, cascade delete), userId (FK → User, cascade delete), joinedAt — composite PK (groupId, userId) |
| **Expense** | id, groupId (FK → Group, cascade delete), createdById (FK → User), description, amount (integer paise), paidById (FK → User), expenseDate, splitType (EQUAL/EXACT), createdAt, updatedAt |
| **ExpenseShare** | id, expenseId (FK → Expense, cascade delete), userId (FK → User, cascade delete), amount (integer paise) — unique constraint (expenseId, userId) |
| **Settlement** | id, groupId (FK → Group, cascade delete), fromUserId (FK → User), toUserId (FK → User), amount (integer paise), createdById (FK → User), createdAt |
| **Activity** | id, groupId (FK → Group, cascade delete), actorId (FK → User), type (enum), metadata (JSON), createdAt |

### Activity Types (enum)

`EXPENSE_ADDED`, `EXPENSE_EDITED`, `EXPENSE_DELETED`, `MEMBER_ADDED`, `MEMBER_REMOVED`, `SETTLEMENT_RECORDED`

### Relationships

- A **User** can own many **Groups** and be a member of many **Groups** via **GroupMember**.
- A **Group** has many **Expenses**, **Settlements**, **Activities**, and **Members** (via GroupMember).
- An **Expense** belongs to one **Group**, is created by one **User**, paid by one **User**, and has many **ExpenseShares**.
- An **ExpenseShare** links an **Expense** to a **User** with an amount owed.
- A **Settlement** records a payment from one **User** to another within a **Group**, created by one **User**.
- All child records (expenses, shares, settlements, activities, memberships) cascade-delete when their parent group or user is removed. This prevents orphaned references.

## Authentication

### Password Rules

Passwords are validated on both frontend and backend with the same rules:
- Minimum 8 characters
- At least one uppercase letter (A-Z)
- At least one lowercase letter (a-z)
- At least one digit (0-9)

Passwords are hashed with **bcrypt** (10 salt rounds). Plaintext passwords are never stored or transmitted after hashing.

### JWT Token Flow

- **Access tokens:** 15-minute lifetime, signed with `JWT_ACCESS_SECRET`
- **Refresh tokens:** 30-day lifetime, signed with `JWT_REFRESH_SECRET`

**How tokens are stored and why:**

- **Access token:** Stored in a JavaScript variable (`let accessToken`) in the frontend `api.ts` module. This keeps it out of `localStorage` (not accessible to XSS via `document.cookie`), while still persisting across page loads by syncing to `localStorage` on login.
- **Refresh token:** Stored in `localStorage` under key `splitmate_refresh_token`. Chosen over cookies because the app uses a cross-origin setup (Vite dev server on :5173, API on :3001) and HttpOnly cookies would require extra configuration. The refresh token is sent in the request body (not as a cookie).
- **On the server:** Refresh tokens are stored as bcrypt hashes in the `refresh_tokens` table. The raw token is only ever sent once (in the login/register response). On refresh, the old token is revoked (rotation) and a new one is issued.

**Refresh flow on 401:**

1. API returns 401 (expired access token)
2. Frontend interceptor catches the 401, queues the failed request
3. Interceptor calls `POST /api/auth/refresh` with the refresh token
4. On success: stores new tokens, retries all queued requests with new access token
5. On failure: clears tokens, redirects to `/login`
6. A mutex (`isRefreshing`) prevents multiple simultaneous refresh attempts

## Authorization

- Every protected endpoint uses `JwtAuthGuard` which verifies the JWT and extracts `userId`
- Public endpoints (`/auth/register`, `/auth/login`) are decorated with `@Public()` and skip JWT verification
- Group operations (`GET /groups`, `POST /groups/:id/expenses`, etc.) verify that the requesting user is a member of the group via `GroupMember` lookup
- Owner-only operations (add/remove members, delete group) verify `group.ownerId === userId` server-side
- Expense edit/delete checks `expense.createdById === userId` OR `group.ownerId === userId` server-side
- Unauthenticated requests to protected endpoints return 401 immediately

## Financial Precision

All amounts are stored as **integer minor units (paise)**. No floating-point arithmetic is used anywhere in the system. The frontend converts display values (e.g., `100.50`) to paise (`10050`) before sending to the API, and converts back for display.

## Equal Split Rounding

When splitting an amount equally, the remainder is distributed deterministically so that shares always sum to the exact total:

```
baseAmount = floor(totalAmount / participantCount)
remainder = totalAmount - (baseAmount * participantCount)
```

The first `remainder` participants (sorted by ascending user ID) receive `baseAmount + 1`. All others receive `baseAmount`.

**Example:** ₹900 split among 3 users → base = 300, remainder = 0 → each pays ₹300.
**Example:** ₹100 split among 3 users → base = 33, remainder = 1 → first user pays ₹34, others pay ₹33. Total = 34 + 33 + 33 = 100.

## Balance Calculation

For each user in a group, computed on-the-fly (not stored):

```
netBalance = totalPaid - totalOwed + totalSettledReceived - totalSettledSent
```

- **Positive balance:** the user is owed money (creditor)
- **Negative balance:** the user owes money (debtor)
- **Zero:** fully settled

## Debt Simplification

Uses a greedy matching algorithm to minimize the number of transactions needed to settle all debts:

1. Calculate net balance for each user in the group
2. Partition into debtors (negative balance) and creditors (positive balance)
3. Sort debtors ascending (most negative first) and creditors descending (most positive first)
4. Transfer `min(|debtor|, creditor)` from debtor to creditor
5. Advance pointers and repeat until all balances are zero

**Example:**
- Alice owes ₹500, Bob is owed ₹300, Charlie is owed ₹200
- Alice pays Bob ₹300, Alice pays Charlie ₹200 → 2 transactions instead of potential 4

## WebSocket (Real-time Updates)

### Choice: Socket.IO

Socket.IO was chosen over native `ws` because it provides automatic reconnection, room-based event scoping, and fallback to HTTP long-polling — all built in. The alternative (raw WebSocket) would require implementing reconnection, heartbeat, and room management manually.

### Authentication

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

### Event Scoping (No Global Broadcast)

Events are **never** broadcast globally. They are scoped to group rooms:

1. When a client wants to receive events for a group, they emit `joinGroup` with `{ groupId }`
2. The gateway verifies the user is a member of that group via `GroupMember` lookup
3. If authorized, the client joins Socket.IO room `group:{groupId}`
4. All mutations (expense created, settlement recorded, etc.) emit to `group:{groupId}` room only
5. A user's dashboard updates via the client-side query invalidation after receiving group events

This means a user only receives events for groups they are a member of. Non-members hear nothing.

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

### Reconnection Handling

Socket.IO enables automatic reconnection by default (exponential backoff). When the socket reconnects:
- The client re-emits `joinGroup` for any active group view
- The dashboard refetches on reconnect via the `connect` event listener
- TanStack Query's `refetchOnWindowFocus` and `refetchOnReconnect` ensure stale data is refreshed
- If the socket drops entirely, the app still works — all operations are REST-based, and the user can refresh to get current state

## API Endpoints

All protected endpoints require `Authorization: Bearer <accessToken>` header. The `/api` prefix is applied globally.

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | Public | Register a new user. Body: `{ name, email, password }` |
| POST | `/api/auth/login` | Public | Login. Body: `{ email, password }`. Returns user + tokens |
| POST | `/api/auth/refresh` | None | Refresh tokens. Body: `{ refreshToken }`. Rotates both tokens |
| POST | `/api/auth/logout` | JWT | Revoke refresh token. Body: `{ refreshToken }` |

### Users

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/users/me` | JWT | Get current user profile |
| GET | `/api/users/search?q=query` | JWT | Search users by name or email (excludes self, limit 10) |

### Groups

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/groups` | JWT | Create a group. Body: `{ name }`. Creator becomes owner and first member |
| GET | `/api/groups` | JWT | List all groups the user is a member of (with member/expense counts) |
| GET | `/api/groups/:groupId` | JWT + Member | Get group details (members, expenses, activity) |
| DELETE | `/api/groups/:groupId` | JWT + Owner | Delete group. Cascades to expenses, shares, settlements, activities, memberships |
| POST | `/api/groups/:groupId/members` | JWT + Owner | Add member. Body: `{ email }`. Must be a registered user |
| DELETE | `/api/groups/:groupId/members/:userId` | JWT + Owner | Remove member. Blocked if member has non-zero balance |
| GET | `/api/groups/:groupId/members` | JWT + Member | List group members |

### Expenses

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/groups/:groupId/expenses` | JWT + Member | Create expense. Body: `{ description, amount, paidById, expenseDate, splitType, participantIds?, shares? }` |
| GET | `/api/groups/:groupId/expenses` | JWT + Member | List expenses. Query: `page`, `pageSize`, `sortBy` (createdAt/expenseDate/amount), `sortOrder` (asc/desc). Frontend provides sort dropdown |
| GET | `/api/groups/:groupId/expenses/:expenseId` | JWT + Member | Get expense details with shares |
| PATCH | `/api/groups/:groupId/expenses/:expenseId` | JWT + Creator/Owner | Update expense. Body: any subset of create fields |
| DELETE | `/api/groups/:groupId/expenses/:expenseId` | JWT + Creator/Owner | Delete expense |

### Balances

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/groups/:groupId/balances` | JWT + Member | Get group balances (per-member net balance) and simplified debts |
| GET | `/api/dashboard` | JWT | Get user's overall balance across all groups (totalOwed, totalYouOwe, netBalance, groupCount, topDebtGroup, recentActivity, per-group breakdown) |
| GET | `/api/history` | JWT | Get personal expense/settlement history across all groups (sorted by date desc) |

### Settlements

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/groups/:groupId/settlements` | JWT + Member | Record settlement. Body: `{ toUserId, amount }`. Validates no self-settlement, positive amount, and outstanding debt exists |
| GET | `/api/groups/:groupId/settlements` | JWT + Member | List group settlements |

### Activities

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/groups/:groupId/activities` | JWT + Member | Get activity feed. Query: `page`, `pageSize`. Returns reverse-chronological with actor info |

## Running with Docker (Production-like)

One command to start everything — frontend, backend, and database:

```bash
docker compose up --build
```

- **Frontend:** http://localhost (served by nginx)
- **Backend API:** http://localhost:3001 (proxied through nginx)
- **PostgreSQL:** localhost:5432

The API container automatically runs Prisma migrations and seeds the database on first start.

To stop and remove volumes:

```bash
docker compose down -v
```

## Running Locally (Development)

```bash
# Start database
docker compose up -d postgres

# Install dependencies
npm install

# Set up database
cd prisma
npx prisma migrate dev
npx prisma generate
cd ..
npm run seed

# Start development (both API and frontend)
npm run dev
```

## Environment Variables

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/splitmate?schema=public"

# JWT (change these in production)
JWT_ACCESS_SECRET="your-access-token-secret-change-in-production"
JWT_REFRESH_SECRET="your-refresh-token-secret-change-in-production"
ACCESS_TOKEN_EXPIRES_IN="15m"
REFRESH_TOKEN_EXPIRES_IN="30d"

# Server
PORT=3001

# Client
CLIENT_URL="http://localhost:5173"
```

## Seed Data

The seed script creates:
- 3 users: Alice (alice@test.com), Bob (bob@test.com), Charlie (charlie@test.com) - all with password `Test1234`
- A group "Goa Trip" with Alice as owner
- A "Dinner" expense of ₹900 split equally (₹300 each)
