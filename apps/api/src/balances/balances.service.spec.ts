import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { BalancesService } from './balances.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  user: { findUnique: jest.fn(), create: jest.fn() },
  group: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
  groupMember: {
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
  },
  expense: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  expenseShare: {
    createMany: jest.fn(),
    deleteMany: jest.fn(),
    findMany: jest.fn(),
  },
  settlement: { findMany: jest.fn(), create: jest.fn() },
  activity: { create: jest.fn() },
  refreshToken: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('BalancesService', () => {
  let service: BalancesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalancesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BalancesService>(BalancesService);
    jest.clearAllMocks();
  });

  describe('calculateGroupBalances', () => {
    it('should calculate correct balances when Alice pays 900 split equally among Alice, Bob, Charlie', async () => {
      const groupId = 'group-1';

      mockPrisma.group.findUnique.mockResolvedValue({ id: groupId });
      mockPrisma.settlement.findMany.mockResolvedValue([]);
      mockPrisma.groupMember.findMany.mockResolvedValue([
        { userId: 'alice', user: { id: 'alice', name: 'Alice' } },
        { userId: 'bob', user: { id: 'bob', name: 'Bob' } },
        { userId: 'charlie', user: { id: 'charlie', name: 'Charlie' } },
      ]);
      mockPrisma.expense.findMany.mockResolvedValue([
        {
          paidById: 'alice',
          amount: 900,
          shares: [
            { userId: 'alice', amount: 300 },
            { userId: 'bob', amount: 300 },
            { userId: 'charlie', amount: 300 },
          ],
        },
      ]);

      const result = await service.calculateGroupBalances(groupId);

      const alice = result.members.find((m) => m.userId === 'alice');
      const bob = result.members.find((m) => m.userId === 'bob');
      const charlie = result.members.find((m) => m.userId === 'charlie');

      expect(alice!.netBalance).toBe(600);
      expect(bob!.netBalance).toBe(-300);
      expect(charlie!.netBalance).toBe(-300);
      expect(result.totalPositive).toBe(600);
      expect(result.totalNegative).toBe(-600);
    });

    it('should throw NotFoundException for non-existent group', async () => {
      mockPrisma.group.findUnique.mockResolvedValue(null);

      await expect(service.calculateGroupBalances('no-group')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return zero balances when no expenses exist', async () => {
      const groupId = 'group-1';

      mockPrisma.group.findUnique.mockResolvedValue({ id: groupId });
      mockPrisma.settlement.findMany.mockResolvedValue([]);
      mockPrisma.groupMember.findMany.mockResolvedValue([
        { userId: 'alice', user: { id: 'alice', name: 'Alice' } },
        { userId: 'bob', user: { id: 'bob', name: 'Bob' } },
      ]);
      mockPrisma.expense.findMany.mockResolvedValue([]);

      const result = await service.calculateGroupBalances(groupId);

      expect(result.members.every((m) => m.netBalance === 0)).toBe(true);
      expect(result.totalPositive).toBe(0);
      expect(result.totalNegative).toBe(0);
    });
  });

  describe('simplifyDebts', () => {
    it('should simplify debts correctly for Alice pays 900 split equally', async () => {
      const groupId = 'group-1';

      mockPrisma.group.findUnique.mockResolvedValue({ id: groupId });
      mockPrisma.settlement.findMany.mockResolvedValue([]);
      mockPrisma.groupMember.findMany.mockResolvedValue([
        { userId: 'alice', user: { id: 'alice', name: 'Alice' } },
        { userId: 'bob', user: { id: 'bob', name: 'Bob' } },
        { userId: 'charlie', user: { id: 'charlie', name: 'Charlie' } },
      ]);
      mockPrisma.expense.findMany.mockResolvedValue([
        {
          paidById: 'alice',
          amount: 900,
          shares: [
            { userId: 'alice', amount: 300 },
            { userId: 'bob', amount: 300 },
            { userId: 'charlie', amount: 300 },
          ],
        },
      ]);

      const debts = await service.simplifyDebts(groupId);

      expect(debts).toHaveLength(2);
      expect(debts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            fromUserId: 'bob',
            toUserId: 'alice',
            amount: 300,
          }),
          expect.objectContaining({
            fromUserId: 'charlie',
            toUserId: 'alice',
            amount: 300,
          }),
        ]),
      );
    });

    it('should return no debts when all balances are zero', async () => {
      const groupId = 'group-1';

      mockPrisma.group.findUnique.mockResolvedValue({ id: groupId });
      mockPrisma.settlement.findMany.mockResolvedValue([]);
      mockPrisma.groupMember.findMany.mockResolvedValue([
        { userId: 'alice', user: { id: 'alice', name: 'Alice' } },
        { userId: 'bob', user: { id: 'bob', name: 'Bob' } },
      ]);
      mockPrisma.expense.findMany.mockResolvedValue([
        {
          paidById: 'alice',
          amount: 100,
          shares: [
            { userId: 'alice', amount: 50 },
            { userId: 'bob', amount: 50 },
          ],
        },
        {
          paidById: 'bob',
          amount: 100,
          shares: [
            { userId: 'alice', amount: 50 },
            { userId: 'bob', amount: 50 },
          ],
        },
      ]);

      const debts = await service.simplifyDebts(groupId);

      expect(debts).toHaveLength(0);
    });
  });

  describe('with settlements', () => {
    it('should account for settlements and produce correct simplified debts', async () => {
      const groupId = 'group-1';

      mockPrisma.group.findUnique.mockResolvedValue({ id: groupId });
      mockPrisma.groupMember.findMany.mockResolvedValue([
        { userId: 'alice', user: { id: 'alice', name: 'Alice' } },
        { userId: 'bob', user: { id: 'bob', name: 'Bob' } },
        { userId: 'charlie', user: { id: 'charlie', name: 'Charlie' } },
      ]);
      mockPrisma.expense.findMany.mockResolvedValue([
        {
          paidById: 'alice',
          amount: 900,
          shares: [
            { userId: 'alice', amount: 300 },
            { userId: 'bob', amount: 300 },
            { userId: 'charlie', amount: 300 },
          ],
        },
      ]);
      mockPrisma.settlement.findMany.mockResolvedValue([
        { fromUserId: 'alice', toUserId: 'bob', amount: 300 },
      ]);

      const result = await service.calculateGroupBalances(groupId);

      const alice = result.members.find((m) => m.userId === 'alice');
      const bob = result.members.find((m) => m.userId === 'bob');
      const charlie = result.members.find((m) => m.userId === 'charlie');

      expect(alice!.netBalance).toBe(300);
      expect(bob!.netBalance).toBe(0);
      expect(charlie!.netBalance).toBe(-300);

      const debts = await service.simplifyDebts(groupId);
      expect(debts).toHaveLength(1);
      expect(debts[0]).toEqual({
        fromUserId: 'charlie',
        toUserId: 'alice',
        amount: 300,
      });
    });
  });

  describe('fully settled group', () => {
    it('should return no simplified debts when all balances are zero', async () => {
      const groupId = 'group-1';

      mockPrisma.group.findUnique.mockResolvedValue({ id: groupId });
      mockPrisma.groupMember.findMany.mockResolvedValue([
        { userId: 'alice', user: { id: 'alice', name: 'Alice' } },
        { userId: 'bob', user: { id: 'bob', name: 'Bob' } },
      ]);
      mockPrisma.expense.findMany.mockResolvedValue([
        {
          paidById: 'alice',
          amount: 100,
          shares: [
            { userId: 'alice', amount: 50 },
            { userId: 'bob', amount: 50 },
          ],
        },
        {
          paidById: 'bob',
          amount: 100,
          shares: [
            { userId: 'alice', amount: 50 },
            { userId: 'bob', amount: 50 },
          ],
        },
      ]);
      mockPrisma.settlement.findMany.mockResolvedValue([]);

      const result = await service.calculateGroupBalances(groupId);
      expect(result.members.every((m) => m.netBalance === 0)).toBe(true);

      const debts = await service.simplifyDebts(groupId);
      expect(debts).toHaveLength(0);
    });
  });

  describe('getUserOverallBalance', () => {
    it('should aggregate balances across multiple groups', async () => {
      const userId = 'alice';

      mockPrisma.groupMember.findMany.mockImplementation(async (args: any) => {
        if (args.where?.groupId) {
          if (args.where.groupId === 'g1') {
            return [
              { userId: 'alice', user: { id: 'alice', name: 'Alice' } },
              { userId: 'bob', user: { id: 'bob', name: 'Bob' } },
            ];
          }
          if (args.where.groupId === 'g2') {
            return [
              { userId: 'alice', user: { id: 'alice', name: 'Alice' } },
              { userId: 'charlie', user: { id: 'charlie', name: 'Charlie' } },
            ];
          }
        }
        return [
          { groupId: 'g1', group: { id: 'g1', name: 'Trip' } },
          { groupId: 'g2', group: { id: 'g2', name: 'Roommates' } },
        ];
      });

      mockPrisma.group.findUnique
        .mockResolvedValueOnce({ id: 'g1' })
        .mockResolvedValueOnce({ id: 'g2' });

      mockPrisma.expense.findMany
        .mockResolvedValueOnce([
          {
            paidById: 'alice',
            amount: 200,
            shares: [
              { userId: 'alice', amount: 100 },
              { userId: 'bob', amount: 100 },
            ],
          },
        ])
        .mockResolvedValueOnce([
          {
            paidById: 'charlie',
            amount: 60,
            shares: [
              { userId: 'alice', amount: 30 },
              { userId: 'charlie', amount: 30 },
            ],
          },
        ]);

      mockPrisma.settlement.findMany.mockResolvedValue([]);

      const result = await service.getUserOverallBalance(userId);

      expect(result.groups).toHaveLength(2);
      expect(result.totalOwed).toBe(100);
      expect(result.totalYouOwe).toBe(30);
      expect(result.netBalance).toBe(70);

      const tripGroup = result.groups.find((g) => g.groupName === 'Trip');
      const roommatesGroup = result.groups.find((g) => g.groupName === 'Roommates');
      expect(tripGroup!.netBalance).toBe(100);
      expect(roommatesGroup!.netBalance).toBe(-30);
    });
  });
});
