import * as bcrypt from 'bcrypt';

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config"; // Ensures your .env variables load correctly

// 1. Create a native PG connection pool using your environment variable
const pool = new pg.Pool({
  connectionString:
    "postgresql://postgres:postgres@localhost:5432/splitmate?schema=public",
});

// 2. Wrap it inside Prisma's driver adapter
const adapter = new PrismaPg(pool);

// 3. Pass the adapter straight into your Prisma Client instance
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  const passwordHash = await bcrypt.hash('Test1234', 10);

  const alice = await prisma.user.upsert({
    where: { email: 'alice@test.com' },
    update: {},
    create: {
      email: 'alice@test.com',
      name: 'Alice',
      passwordHash,
    },
  });

  const bob = await prisma.user.upsert({
    where: { email: 'bob@test.com' },
    update: {},
    create: {
      email: 'bob@test.com',
      name: 'Bob',
      passwordHash,
    },
  });

  const charlie = await prisma.user.upsert({
    where: { email: 'charlie@test.com' },
    update: {},
    create: {
      email: 'charlie@test.com',
      name: 'Charlie',
      passwordHash,
    },
  });

  console.log('Created users:', { alice, bob, charlie });

  const group = await prisma.group.create({
    data: {
      name: 'Goa Trip',
      ownerId: alice.id,
      members: {
        create: [
          { userId: alice.id },
          { userId: bob.id },
          { userId: charlie.id },
        ],
      },
    },
    include: { members: true },
  });

  console.log('Created group:', group.name);

  const expense = await prisma.expense.create({
    data: {
      description: 'Dinner',
      amount: 90000,
      splitType: 'EQUAL',
      paidById: alice.id,
      createdById: alice.id,
      groupId: group.id,
      expenseDate: new Date(),
      shares: {
        create: [
          { userId: alice.id, amount: 30000 },
          { userId: bob.id, amount: 30000 },
          { userId: charlie.id, amount: 30000 },
        ],
      },
    },
    include: { shares: true },
  });

  console.log('Created expense:', expense.description, 'amount:', expense.amount);

  await prisma.activity.create({
    data: {
      type: 'EXPENSE_ADDED',
      actorId: alice.id,
      groupId: group.id,
      metadata: {
        expenseId: expense.id,
        description: 'Dinner',
        amount: 90000,
      },
    },
  });

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
