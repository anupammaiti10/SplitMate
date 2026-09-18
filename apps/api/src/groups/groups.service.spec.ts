import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { GroupsService } from './groups.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

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

const mockRealtimeGateway = {
  emitToGroup: jest.fn(),
};

describe('GroupsService', () => {
  let service: GroupsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RealtimeGateway, useValue: mockRealtimeGateway },
      ],
    }).compile();

    service = module.get<GroupsService>(GroupsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create group and add creator as member', async () => {
      const userId = 'user-1';
      const group = { id: 'group-1', name: 'Trip', ownerId: userId };

      mockPrisma.group.create.mockResolvedValue(group);
      mockPrisma.groupMember.create.mockResolvedValue({});
      mockPrisma.activity.create.mockResolvedValue({});
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        return fn(mockPrisma);
      });

      const result = await service.create({ name: 'Trip' }, userId);

      expect(result).toEqual(group);
      expect(mockPrisma.group.create).toHaveBeenCalledWith({
        data: { name: 'Trip', ownerId: userId },
      });
      expect(mockPrisma.groupMember.create).toHaveBeenCalledWith({
        data: { groupId: 'group-1', userId },
      });
      expect(mockPrisma.activity.create).toHaveBeenCalledWith({
        data: {
          groupId: 'group-1',
          actorId: userId,
          type: 'MEMBER_ADDED',
          metadata: { userId },
        },
      });
    });
  });

  describe('addMember', () => {
    const groupId = 'group-1';
    const ownerId = 'owner-1';

    it('should only allow owner to add members', async () => {
      mockPrisma.group.findUnique.mockResolvedValue({
        id: groupId,
        ownerId: 'someone-else',
      });

      await expect(
        service.addMember(groupId, ownerId, { email: 'new@test.com' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for non-existent group', async () => {
      mockPrisma.group.findUnique.mockResolvedValue(null);

      await expect(
        service.addMember(groupId, ownerId, { email: 'new@test.com' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for non-existent user', async () => {
      mockPrisma.group.findUnique.mockResolvedValue({ id: groupId, ownerId });
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.addMember(groupId, ownerId, { email: 'noone@test.com' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for existing member', async () => {
      mockPrisma.group.findUnique.mockResolvedValue({ id: groupId, ownerId });
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-2' });
      mockPrisma.groupMember.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.addMember(groupId, ownerId, { email: 'existing@test.com' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should add member successfully', async () => {
      mockPrisma.group.findUnique.mockResolvedValue({ id: groupId, ownerId });
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-2', email: 'new@test.com' });
      mockPrisma.groupMember.findUnique.mockResolvedValue(null);
      mockPrisma.groupMember.create.mockResolvedValue({});
      mockPrisma.activity.create.mockResolvedValue({});
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        return fn(mockPrisma);
      });

      const result = await service.addMember(groupId, ownerId, { email: 'new@test.com' });

      expect(result.message).toBe('Member added successfully');
      expect(result.userId).toBe('user-2');
    });
  });

  describe('removeMember', () => {
    const groupId = 'group-1';
    const ownerId = 'owner-1';
    const targetUserId = 'target-1';

    beforeEach(() => {
      mockPrisma.group.findUnique.mockResolvedValue({ id: groupId, ownerId });
    });

    it('should only allow owner to remove members', async () => {
      mockPrisma.group.findUnique.mockResolvedValue({
        id: groupId,
        ownerId: 'someone-else',
      });

      await expect(
        service.removeMember(groupId, ownerId, targetUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for non-member', async () => {
      mockPrisma.groupMember.findUnique.mockResolvedValue(null);

      await expect(
        service.removeMember(groupId, ownerId, targetUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject removal when member has positive balance', async () => {
      mockPrisma.groupMember.findUnique.mockResolvedValue({ id: 'mem-1' });
      mockPrisma.expense.findMany.mockResolvedValue([
        {
          paidById: targetUserId,
          amount: 600,
          shares: [
            { userId: targetUserId, amount: 200 },
            { userId: 'other', amount: 200 },
            { userId: 'another', amount: 200 },
          ],
        },
      ]);
      mockPrisma.settlement.findMany.mockResolvedValue([]);

      await expect(
        service.removeMember(groupId, ownerId, targetUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject removal when member has negative balance', async () => {
      mockPrisma.groupMember.findUnique.mockResolvedValue({ id: 'mem-1' });
      mockPrisma.expense.findMany.mockResolvedValue([
        {
          paidById: 'other',
          amount: 600,
          shares: [
            { userId: targetUserId, amount: 200 },
            { userId: 'other', amount: 200 },
            { userId: 'another', amount: 200 },
          ],
        },
      ]);
      mockPrisma.settlement.findMany.mockResolvedValue([]);

      await expect(
        service.removeMember(groupId, ownerId, targetUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow removal when balance is zero', async () => {
      mockPrisma.groupMember.findUnique.mockResolvedValue({ id: 'mem-1' });
      mockPrisma.expense.findMany.mockResolvedValue([]);
      mockPrisma.settlement.findMany.mockResolvedValue([]);
      mockPrisma.groupMember.delete.mockResolvedValue({});
      mockPrisma.activity.create.mockResolvedValue({});
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        return fn(mockPrisma);
      });

      const result = await service.removeMember(groupId, ownerId, targetUserId);
      expect(result.message).toBe('Member removed successfully');
    });
  });

  describe('delete', () => {
    it('should only allow owner to delete group', async () => {
      mockPrisma.group.findUnique.mockResolvedValue({
        id: 'group-1',
        ownerId: 'owner-1',
      });

      await expect(
        service.delete('group-1', 'not-owner'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for non-existent group', async () => {
      mockPrisma.group.findUnique.mockResolvedValue(null);

      await expect(service.delete('no-group', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should delete group successfully', async () => {
      mockPrisma.group.findUnique.mockResolvedValue({
        id: 'group-1',
        ownerId: 'owner-1',
      });
      mockPrisma.group.delete.mockResolvedValue({});

      const result = await service.delete('group-1', 'owner-1');
      expect(result.message).toBe('Group deleted successfully');
      expect(mockPrisma.group.delete).toHaveBeenCalledWith({
        where: { id: 'group-1' },
      });
    });
  });
});
