import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => RealtimeGateway))
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async create(createGroupDto: CreateGroupDto, userId: string) {
    const group = await this.prisma.$transaction(async (tx) => {
      const newGroup = await tx.group.create({
        data: {
          name: createGroupDto.name,
          ownerId: userId,
        },
      });

      await tx.groupMember.create({
        data: {
          groupId: newGroup.id,
          userId,
        },
      });

      await tx.activity.create({
        data: {
          groupId: newGroup.id,
          actorId: userId,
          type: 'MEMBER_ADDED',
          metadata: { userId },
        },
      });

      return newGroup;
    });

    this.realtimeGateway?.emitToGroup(group.id, 'group:created', {
      groupId: group.id,
      name: group.name,
      createdBy: userId,
    });

    return group;
  }

  async findAll(userId: string) {
    const memberships = await this.prisma.groupMember.findMany({
      where: { userId },
      include: {
        group: {
          include: {
            _count: { select: { members: true, expenses: true } },
          },
        },
      },
    });

    return memberships.map((m) => ({
      ...m.group,
      memberCount: m.group._count.members,
      expenseCount: m.group._count.expenses,
    }));
  }

  async findById(groupId: string, userId: string) {
    const membership = await this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId },
      },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this group');
    }

    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                createdAt: true,
              },
            },
          },
        },
        expenses: {
          select: {
            id: true,
            description: true,
            amount: true,
            paidById: true,
            expenseDate: true,
            splitType: true,
            createdAt: true,
          },
          orderBy: { expenseDate: 'desc' },
        },
      },
    });

    if (!group) {
      throw new NotFoundException(`Group with ID ${groupId} not found`);
    }

    return group;
  }

  async delete(groupId: string, userId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      throw new NotFoundException(`Group with ID ${groupId} not found`);
    }

    if (group.ownerId !== userId) {
      throw new ForbiddenException('Only the group owner can delete the group');
    }

    await this.prisma.group.delete({
      where: { id: groupId },
    });

    this.realtimeGateway?.emitToGroup(groupId, 'group:deleted', {
      groupId,
      deletedBy: userId,
    });

    return { message: 'Group deleted successfully' };
  }

  async addMember(groupId: string, ownerId: string, addMemberDto: AddMemberDto) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      throw new NotFoundException(`Group with ID ${groupId} not found`);
    }

    if (group.ownerId !== ownerId) {
      throw new ForbiddenException('Only the group owner can add members');
    }

    const userToAdd = await this.prisma.user.findUnique({
      where: { email: addMemberDto.email },
    });

    if (!userToAdd) {
      throw new NotFoundException(`User with email ${addMemberDto.email} not found`);
    }

    const existingMembership = await this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId: userToAdd.id },
      },
    });

    if (existingMembership) {
      throw new BadRequestException('User is already a member of this group');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.groupMember.create({
        data: {
          groupId,
          userId: userToAdd.id,
        },
      });

      await tx.activity.create({
        data: {
          groupId,
          actorId: ownerId,
          type: 'MEMBER_ADDED',
          metadata: { userId: userToAdd.id, email: addMemberDto.email },
        },
      });
    });

    this.realtimeGateway?.emitToGroup(groupId, 'member:added', {
      groupId,
      userId: userToAdd.id,
      addedBy: ownerId,
    });

    return { message: 'Member added successfully', userId: userToAdd.id };
  }

  async removeMember(groupId: string, ownerId: string, targetUserId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      throw new NotFoundException(`Group with ID ${groupId} not found`);
    }

    if (group.ownerId !== ownerId) {
      throw new ForbiddenException('Only the group owner can remove members');
    }

    const membership = await this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId: targetUserId },
      },
    });

    if (!membership) {
      throw new NotFoundException('User is not a member of this group');
    }

    const netBalance = await this.calculateNetBalance(groupId, targetUserId);

    if (netBalance !== 0) {
      throw new BadRequestException({
        message: 'Member cannot be removed because their group balance is not settled.',
        code: 'MEMBER_HAS_OUTSTANDING_BALANCE',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.groupMember.delete({
        where: {
          groupId_userId: { groupId, userId: targetUserId },
        },
      });

      await tx.activity.create({
        data: {
          groupId,
          actorId: ownerId,
          type: 'MEMBER_REMOVED',
          metadata: { userId: targetUserId },
        },
      });
    });

    this.realtimeGateway?.emitToGroup(groupId, 'member:removed', {
      groupId,
      userId: targetUserId,
      removedBy: ownerId,
    });

    return { message: 'Member removed successfully' };
  }

  async getMembers(groupId: string, userId: string) {
    const membership = await this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId },
      },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this group');
    }

    const members = await this.prisma.groupMember.findMany({
      where: { groupId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
          },
        },
      },
    });

    return members.map((m) => m.user);
  }

  private async calculateNetBalance(groupId: string, userId: string): Promise<number> {
    const expenses = await this.prisma.expense.findMany({
      where: { groupId },
      include: {
        shares: true,
      },
    });

    let totalPaid = 0;
    let totalOwed = 0;

    for (const expense of expenses) {
      if (expense.paidById === userId) {
        totalPaid += expense.amount;
      }

      const share = expense.shares.find((s) => s.userId === userId);
      if (share) {
        totalOwed += share.amount;
      }
    }

    const settlementsReceived = await this.prisma.settlement.findMany({
      where: {
        groupId,
        toUserId: userId,
      },
    });

    const settlementsSent = await this.prisma.settlement.findMany({
      where: {
        groupId,
        fromUserId: userId,
      },
    });

    const totalReceived = settlementsReceived.reduce((sum, s) => sum + s.amount, 0);
    const totalSent = settlementsSent.reduce((sum, s) => sum + s.amount, 0);

    return totalPaid - totalOwed + totalReceived - totalSent;
  }
}
