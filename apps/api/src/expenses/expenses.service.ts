import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto, SplitType } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { PaginatedExpensesResponse } from './dto/paginated-expenses.dto';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(groupId: string, dto: CreateExpenseDto, userId: string) {
    await this.verifyGroupMembership(groupId, userId);
    await this.verifyGroupMembership(groupId, dto.paidById);

    if (dto.amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    let shares: { userId: string; amount: number }[];

    if (dto.splitType === SplitType.EQUAL) {
      const participantIds = dto.participantIds ?? [];
      if (participantIds.length === 0) {
        throw new BadRequestException(
          'participantIds is required for EQUAL split',
        );
      }
      for (const pid of participantIds) {
        await this.verifyGroupMembership(groupId, pid);
      }
      shares = this.equalSplit(dto.amount, participantIds);
    } else {
      if (!dto.shares || dto.shares.length === 0) {
        throw new BadRequestException('shares is required for EXACT split');
      }
      for (const share of dto.shares) {
        await this.verifyGroupMembership(groupId, share.userId);
      }
      const sum = dto.shares.reduce((acc, s) => acc + s.amount, 0);
      if (sum !== dto.amount) {
        throw new BadRequestException(
          `Sum of shares (${sum}) must equal expense amount (${dto.amount})`,
        );
      }
      shares = dto.shares;
    }

    const expense = await this.prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          groupId,
          createdById: userId,
          description: dto.description,
          amount: dto.amount,
          paidById: dto.paidById,
          expenseDate: new Date(dto.expenseDate),
          splitType: dto.splitType,
        },
      });

      await tx.expenseShare.createMany({
        data: shares.map((s) => ({
          expenseId: created.id,
          userId: s.userId,
          amount: s.amount,
        })),
      });

      await tx.activity.create({
        data: {
          groupId,
          actorId: userId,
          type: 'EXPENSE_ADDED',
          metadata: {
            expenseId: created.id,
            description: dto.description,
            amount: dto.amount,
          },
        },
      });

      return created;
    });

    return this.findById(expense.id, groupId, userId);
  }

  async findAll(
    groupId: string,
    userId: string,
    page: number,
    pageSize: number,
    sortBy: string,
    sortOrder: 'asc' | 'desc',
  ): Promise<PaginatedExpensesResponse> {
    await this.verifyGroupMembership(groupId, userId);

    const allowedSortFields = ['createdAt', 'expenseDate', 'amount'];
    const field = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';

    const [items, totalItems] = await Promise.all([
      this.prisma.expense.findMany({
        where: { groupId },
        include: {
          shares: true,
          payer: { select: { id: true, name: true, email: true } },
          creator: { select: { id: true, name: true, email: true } },
        },
        orderBy: { [field]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.expense.count({ where: { groupId } }),
    ]);

    return {
      items,
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    };
  }

  async findById(expenseId: string, groupId: string, userId: string) {
    await this.verifyGroupMembership(groupId, userId);

    const expense = await this.prisma.expense.findUnique({
      where: { id: expenseId },
      include: {
        shares: true,
        payer: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
      },
    });

    if (!expense || expense.groupId !== groupId) {
      throw new NotFoundException('Expense not found in this group');
    }

    return expense;
  }

  async update(
    groupId: string,
    expenseId: string,
    dto: UpdateExpenseDto,
    userId: string,
  ) {
    const existing = await this.findById(expenseId, groupId, userId);

    if (existing.createdById !== userId) {
      const group = await this.prisma.group.findUnique({
        where: { id: groupId },
        select: { ownerId: true },
      });
      if (group?.ownerId !== userId) {
        throw new ForbiddenException(
          'Only the expense creator or group owner can update this expense',
        );
      }
    }

    const merged = {
      description: dto.description ?? existing.description,
      amount: dto.amount ?? existing.amount,
      paidById: dto.paidById ?? existing.paidById,
      expenseDate: dto.expenseDate ?? existing.expenseDate.toISOString(),
      splitType: dto.splitType ?? existing.splitType,
      participantIds: dto.participantIds,
      shares: dto.shares,
    };

    if (merged.amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    await this.verifyGroupMembership(groupId, merged.paidById);

    let shares: { userId: string; amount: number }[];

    if (merged.splitType === SplitType.EQUAL) {
      const participantIds = merged.participantIds ?? [];
      if (participantIds.length === 0) {
        throw new BadRequestException(
          'participantIds is required for EQUAL split',
        );
      }
      for (const pid of participantIds) {
        await this.verifyGroupMembership(groupId, pid);
      }
      shares = this.equalSplit(merged.amount, participantIds);
    } else {
      if (!merged.shares || merged.shares.length === 0) {
        throw new BadRequestException('shares is required for EXACT split');
      }
      for (const share of merged.shares) {
        await this.verifyGroupMembership(groupId, share.userId);
      }
      const sum = merged.shares.reduce((acc, s) => acc + s.amount, 0);
      if (sum !== merged.amount) {
        throw new BadRequestException(
          `Sum of shares (${sum}) must equal expense amount (${merged.amount})`,
        );
      }
      shares = merged.shares;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.expenseShare.deleteMany({ where: { expenseId } });

      await tx.expense.update({
        where: { id: expenseId },
        data: {
          description: merged.description,
          amount: merged.amount,
          paidById: merged.paidById,
          expenseDate: new Date(merged.expenseDate),
          splitType: merged.splitType,
        },
      });

      await tx.expenseShare.createMany({
        data: shares.map((s) => ({
          expenseId,
          userId: s.userId,
          amount: s.amount,
        })),
      });

      await tx.activity.create({
        data: {
          groupId,
          actorId: userId,
          type: 'EXPENSE_EDITED',
          metadata: {
            expenseId,
            description: merged.description,
            amount: merged.amount,
          },
        },
      });
    });

    return this.findById(expenseId, groupId, userId);
  }

  async delete(groupId: string, expenseId: string, userId: string) {
    const existing = await this.findById(expenseId, groupId, userId);

    if (existing.createdById !== userId) {
      const group = await this.prisma.group.findUnique({
        where: { id: groupId },
        select: { ownerId: true },
      });
      if (group?.ownerId !== userId) {
        throw new ForbiddenException(
          'Only the expense creator or group owner can delete this expense',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.expense.delete({ where: { id: expenseId } });

      await tx.activity.create({
        data: {
          groupId,
          actorId: userId,
          type: 'EXPENSE_DELETED',
          metadata: {
            expenseId,
            description: existing.description,
            amount: existing.amount,
          },
        },
      });
    });
  }

  equalSplit(
    amount: number,
    participantIds: string[],
  ): { userId: string; amount: number }[] {
    const count = participantIds.length;
    if (count === 0) {
      throw new BadRequestException('At least one participant is required');
    }

    const baseShare = Math.floor(amount / count);
    const remainder = amount - baseShare * count;
    const sortedIds = [...participantIds].sort();

    return sortedIds.map((userId, index) => ({
      userId,
      amount: baseShare + (index < remainder ? 1 : 0),
    }));
  }

  private async verifyGroupMembership(groupId: string, userId: string) {
    const membership = await this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId },
      },
    });

    if (!membership) {
      throw new ForbiddenException('User is not a member of this group');
    }
  }
}
