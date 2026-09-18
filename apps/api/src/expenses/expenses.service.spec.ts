import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { PrismaService } from '../prisma/prisma.service';
import { SplitType } from './dto/create-expense.dto';

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

describe('ExpensesService', () => {
  let service: ExpensesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ExpensesService>(ExpensesService);
    jest.clearAllMocks();
  });

  describe('equalSplit', () => {
    it('should divide 1000 by 3 as 334, 333, 333', () => {
      const result = service.equalSplit(1000, ['alice', 'bob', 'charlie']);
      const amounts = result.map((s) => s.amount);
      expect(amounts).toEqual([334, 333, 333]);
      expect(amounts.reduce((a, b) => a + b, 0)).toBe(1000);
    });

    it('should divide 100 by 2 as 50, 50', () => {
      const result = service.equalSplit(100, ['alice', 'bob']);
      expect(result.map((s) => s.amount)).toEqual([50, 50]);
    });

    it('should divide 100 by 1 as 100', () => {
      const result = service.equalSplit(100, ['alice']);
      expect(result).toEqual([{ userId: 'alice', amount: 100 }]);
    });

    it('should divide 7 by 3 as 3, 2, 2 deterministically', () => {
      const result = service.equalSplit(7, ['a', 'b', 'c']);
      const amounts = result.map((s) => s.amount);
      expect(amounts).toEqual([3, 2, 2]);
      expect(amounts.reduce((a, b) => a + b, 0)).toBe(7);
    });

    it('should sort participant IDs before splitting', () => {
      const result = service.equalSplit(10, ['charlie', 'alice', 'bob']);
      expect(result[0].userId).toBe('alice');
      expect(result[1].userId).toBe('bob');
      expect(result[2].userId).toBe('charlie');
    });

    it('should throw BadRequestException for empty participants', () => {
      expect(() => service.equalSplit(100, [])).toThrow(BadRequestException);
    });
  });

  describe('create expense validation', () => {
    const groupId = 'group-1';
    const userId = 'user-1';

    beforeEach(() => {
      mockPrisma.groupMember.findUnique.mockResolvedValue({ id: 'mem-1' });
    });

    it('should reject amount <= 0', async () => {
      await expect(
        service.create(
          groupId,
          {
            description: 'Test',
            amount: 0,
            paidById: userId,
            expenseDate: '2024-01-01',
            splitType: SplitType.EQUAL,
            participantIds: [userId],
          },
          userId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject negative amount', async () => {
      await expect(
        service.create(
          groupId,
          {
            description: 'Test',
            amount: -50,
            paidById: userId,
            expenseDate: '2024-01-01',
            splitType: SplitType.EQUAL,
            participantIds: [userId],
          },
          userId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject non-member payer', async () => {
      mockPrisma.groupMember.findUnique
        .mockResolvedValueOnce({ id: 'mem-1' })
        .mockResolvedValueOnce(null);

      await expect(
        service.create(
          groupId,
          {
            description: 'Test',
            amount: 100,
            paidById: 'non-member',
            expenseDate: '2024-01-01',
            splitType: SplitType.EQUAL,
            participantIds: [userId],
          },
          userId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject non-member participant in EQUAL split', async () => {
      mockPrisma.groupMember.findUnique
        .mockResolvedValueOnce({ id: 'mem-1' })
        .mockResolvedValueOnce({ id: 'mem-2' })
        .mockResolvedValueOnce(null);

      await expect(
        service.create(
          groupId,
          {
            description: 'Test',
            amount: 100,
            paidById: userId,
            expenseDate: '2024-01-01',
            splitType: SplitType.EQUAL,
            participantIds: [userId, 'non-member'],
          },
          userId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject empty participants for EQUAL split', async () => {
      await expect(
        service.create(
          groupId,
          {
            description: 'Test',
            amount: 100,
            paidById: userId,
            expenseDate: '2024-01-01',
            splitType: SplitType.EQUAL,
            participantIds: [],
          },
          userId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject shares total != amount for EXACT split', async () => {
      mockPrisma.groupMember.findUnique
        .mockResolvedValueOnce({ id: 'mem-1' })
        .mockResolvedValueOnce({ id: 'mem-2' })
        .mockResolvedValueOnce({ id: 'mem-3' });

      await expect(
        service.create(
          groupId,
          {
            description: 'Test',
            amount: 100,
            paidById: userId,
            expenseDate: '2024-01-01',
            splitType: SplitType.EXACT,
            shares: [
              { userId: userId, amount: 60 },
              { userId: 'user-2', amount: 20 },
            ],
          },
          userId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject EXACT split with empty shares', async () => {
      await expect(
        service.create(
          groupId,
          {
            description: 'Test',
            amount: 100,
            paidById: userId,
            expenseDate: '2024-01-01',
            splitType: SplitType.EXACT,
            shares: [],
          },
          userId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update/delete authorization', () => {
    const groupId = 'group-1';
    const expenseId = 'expense-1';
    const creatorId = 'creator-1';
    const ownerId = 'owner-1';
    const otherUserId = 'other-1';

    const existingExpense = {
      id: expenseId,
      groupId,
      createdById: creatorId,
      description: 'Dinner',
      amount: 1000,
      paidById: creatorId,
      expenseDate: new Date('2024-01-01'),
      splitType: 'EQUAL',
      shares: [
        { userId: creatorId, amount: 500 },
        { userId: 'user-2', amount: 500 },
      ],
      payer: { id: creatorId, name: 'Creator', email: 'c@test.com' },
      creator: { id: creatorId, name: 'Creator', email: 'c@test.com' },
    };

    beforeEach(() => {
      mockPrisma.groupMember.findUnique.mockResolvedValue({ id: 'mem-1' });
      mockPrisma.expense.findUnique.mockResolvedValue(existingExpense);
    });

    it('should allow creator to update', async () => {
      mockPrisma.group.findUnique.mockResolvedValue({ ownerId: ownerId });
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        await fn(mockPrisma);
      });
      mockPrisma.expense.findUnique.mockResolvedValue(existingExpense);

      await service.update(
        groupId,
        expenseId,
        {
          description: 'Updated',
          participantIds: [creatorId, 'user-2'],
        },
        creatorId,
      );
    });

    it('should allow owner to update', async () => {
      mockPrisma.group.findUnique.mockResolvedValue({ ownerId: ownerId });
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        await fn(mockPrisma);
      });
      mockPrisma.expense.findUnique.mockResolvedValue(existingExpense);

      await service.update(
        groupId,
        expenseId,
        {
          description: 'Updated',
          participantIds: [creatorId, 'user-2'],
        },
        ownerId,
      );
    });

    it('should reject non-creator non-owner from updating', async () => {
      mockPrisma.group.findUnique.mockResolvedValue({ ownerId: ownerId });

      await expect(
        service.update(
          groupId,
          expenseId,
          { description: 'Updated' },
          otherUserId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow creator to delete', async () => {
      mockPrisma.group.findUnique.mockResolvedValue({ ownerId: ownerId });
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        await fn(mockPrisma);
      });

      await service.delete(groupId, expenseId, creatorId);
    });

    it('should allow owner to delete', async () => {
      mockPrisma.group.findUnique.mockResolvedValue({ ownerId: ownerId });
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        await fn(mockPrisma);
      });

      await service.delete(groupId, expenseId, ownerId);
    });

    it('should reject non-creator non-owner from deleting', async () => {
      mockPrisma.group.findUnique.mockResolvedValue({ ownerId: ownerId });

      await expect(
        service.delete(groupId, expenseId, otherUserId),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
