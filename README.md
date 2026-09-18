# SplitMate

A Splitwise-style shared-expense application built with React, NestJS, PostgreSQL, and Socket.IO.

## Features

- User registration and authentication (JWT)
- Group creation and management
- Add/remove members (owner-only)
- Shared expenses with EQUAL and EXACT splits
- Deterministic rounding for equal splits
- Balance calculation and debt simplification
- Settlement recording
- Real-time updates via WebSocket
- Activity feed
- Personal expense history
- Server-side pagination and sorting

## Architecture

- **Frontend:** React + TypeScript + Vite + Tailwind CSS + TanStack Query + Socket.IO client
- **Backend:** NestJS + TypeScript + Socket.IO
- **Database:** PostgreSQL with Prisma ORM
- **Authentication:** JWT access tokens (15min) + refresh tokens (30d)

## Data Model

| Entity | Description |
|--------|-------------|
| **User** | id, email, name, password (hashed), createdAt, updatedAt |
| **Group** | id, name, ownerId (FK → User), createdAt, updatedAt |
| **GroupMember** | id, groupId (FK → Group), userId (FK → User), createdAt |
| **Expense** | id, title, amount (integer paise), currency, splitType (EQUAL/EXACT), paidById (FK → User), groupId (FK → Group), createdAt, updatedAt |
| **ExpenseSplit** | id, expenseId (FK → Expense), userId (FK → User), amount (integer paise), createdAt |
| **Settlement** | id, amount (integer paise), fromUserId (FK → User), toUserId (FK → User), groupId (FK → Group), createdAt |
| **Activity** | id, type (enum), description, userId (FK → User), groupId (FK → Group), expenseId (FK → Expense, nullable), createdAt |

### Relationships

- A **User** can own many **Groups** and be a member of many **Groups** via **GroupMember**.
- A **Group** has many **Expenses**, **Settlements**, **Activities**, and **Members**.
- An **Expense** belongs to one **Group**, is paid by one **User**, and has many **ExpenseSplits**.
- An **ExpenseSplit** links an **Expense** to a **User** with an amount owed.
- A **Settlement** records a payment from one **User** to another within a **Group**.

## Authentication

- **Access tokens:** 15 minutes, stored in memory
- **Refresh tokens:** 30 days, stored in memory (returned in response body)
- Token rotation on refresh
- Server-side refresh token revocation
- Passwords hashed with bcrypt (10 rounds)

## Authorization

- Every protected endpoint verifies JWT
- Group operations verify membership
- Owner-only operations verified server-side
- Expense edit/delete requires creator or owner

## Financial Precision

All amounts are stored as integer minor units (paise). No floating-point arithmetic is used anywhere in the system.

## Equal Split Rounding

When splitting an amount equally, the remainder is distributed deterministically:

```
baseAmount = floor(totalAmount / participantCount)
remainder = totalAmount - (baseAmount * participantCount)
```

The first `remainder` participants (sorted by ascending user ID) receive `baseAmount + 1`. All others receive `baseAmount`.

**Example:** ₹900 split among 3 users → each pays ₹300 (no remainder).

## Balance Calculation

For each user in a group:

```
netBalance = totalPaid - totalOwed + totalSettledReceived - totalSettledSent
```

- **Positive balance:** the user is owed money (creditor)
- **Negative balance:** the user owes money (debtor)

## Debt Simplification

Uses a greedy matching algorithm:

1. Calculate net balance for each user
2. Sort debtors (most negative first) and creditors (most positive first)
3. Transfer `min(|debtor|, creditor)` from debtor to creditor
4. Repeat until all balances are zero

**Example:**
- Alice owes ₹500, Bob is owed ₹300, Charlie is owed ₹200
- Alice pays Bob ₹300, Alice pays Charlie ₹200

## WebSocket

- Socket.IO with JWT authentication
- Group-scoped rooms for authorized events
- Events:
  - `group.expense.created`
  - `group.expense.updated`
  - `group.expense.deleted`
  - `group.settlement.created`
  - `member.added`
  - `member.removed`
- Dashboard updates via query invalidation
- Auto-reconnect with state refresh

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register a new user |
| POST | `/auth/login` | Login and receive tokens |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Revoke refresh token |

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/users/me` | Get current user profile |
| GET | `/users/search?q=query` | Search users by name/email |

### Groups

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/groups` | Create a new group |
| GET | `/groups` | List user's groups |
| GET | `/groups/:id` | Get group details |
| DELETE | `/groups/:id` | Delete group (owner only) |
| POST | `/groups/:id/members` | Add member to group (owner only) |
| DELETE | `/groups/:id/members/:userId` | Remove member from group (owner only) |
| GET | `/groups/:id/members` | List group members |

### Expenses

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/groups/:groupId/expenses` | Create an expense |
| GET | `/groups/:groupId/expenses` | List group expenses (paginated, sortable) |
| GET | `/groups/:groupId/expenses/:id` | Get expense details |
| PATCH | `/groups/:groupId/expenses/:id` | Update an expense |
| DELETE | `/groups/:groupId/expenses/:id` | Delete an expense |

### Balances

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/groups/:id/balances` | Get group balances and simplified debts |
| GET | `/dashboard` | Get user's overall balance across all groups |
| GET | `/history` | Get personal expense/settlement history |

### Settlements

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/groups/:id/settlements` | Record a settlement |
| GET | `/groups/:id/settlements` | List group settlements |

### Activities

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/groups/:id/activities` | Get group activity feed (paginated) |

## Running Locally

```bash
# Start database
docker compose up -d

# Install dependencies
npm install

# Set up database
cd prisma
npx prisma migrate dev
npx prisma generate
cd ..
npm run seed

# Start development
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

## Testing

```bash
npm run test
```

## Seed Data

The seed script creates:
- 3 users: Alice (alice@test.com), Bob (bob@test.com), Charlie (charlie@test.com) - all with password `Test1234`
- A group "Goa Trip" with Alice as owner
- A "Dinner" expense of ₹900 split equally (₹300 each)