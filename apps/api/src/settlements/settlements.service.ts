import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BalancesService } from '../balances/balances.service';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ActivitiesService } from '../activities/activities.service';
import { ActivityType } from '@prisma/client';

@Injectable()
export class SettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balancesService: BalancesService,
    private readonly activitiesService: ActivitiesService,
    @Inject(forwardRef(() => RealtimeGateway))
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async create(groupId: string, dto: CreateSettlementDto, userId: string) {
    if (dto.amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    if (userId === dto.toUserId) {
      throw new BadRequestException('Cannot settle with yourself');
    }

    await this.verifyGroupMembership(groupId, userId);
    await this.verifyGroupMembership(groupId, dto.toUserId);

    const { members } =
      await this.balancesService.calculateGroupBalances(groupId);

    const payerBalance = members.find((m) => m.userId === userId);
    const recipientBalance = members.find((m) => m.userId === dto.toUserId);

    if (!payerBalance || !recipientBalance) {
      throw new NotFoundException('User not found in group');
    }

    const netFromPayerToRecipient =
      -payerBalance.netBalance + recipientBalance.netBalance;

    const existingSettlements = await this.prisma.settlement.findMany({
      where: {
        groupId,
        fromUserId: userId,
        toUserId: dto.toUserId,
      },
      select: { amount: true },
    });

    const totalAlreadySettled = existingSettlements.reduce(
      (sum, s) => sum + s.amount,
      0,
    );

    const remainingDebt = netFromPayerToRecipient - totalAlreadySettled;

    if (remainingDebt <= 0) {
      throw new BadRequestException(
        'You do not owe this user anything in this group',
      );
    }

    if (dto.amount > remainingDebt) {
      throw new BadRequestException(
        `Settlement amount exceeds outstanding debt. Maximum you can settle: ${remainingDebt}`,
      );
    }

    const settlement = await this.prisma.$transaction(async (tx) => {
      const created = await tx.settlement.create({
        data: {
          groupId,
          fromUserId: userId,
          toUserId: dto.toUserId,
          amount: dto.amount,
          createdById: userId,
        },
      });

      await tx.activity.create({
        data: {
          groupId,
          actorId: userId,
          type: ActivityType.SETTLEMENT_RECORDED,
          metadata: {
            fromUserId: userId,
            toUserId: dto.toUserId,
            amount: dto.amount,
          },
        },
      });

      return created;
    });

    this.realtimeGateway?.emitToGroup(groupId, 'group.settlement.created', {
      settlement,
      actorId: userId,
    });

    return settlement;
  }

  async findByGroup(groupId: string, userId: string) {
    await this.verifyGroupMembership(groupId, userId);

    return this.prisma.settlement.findMany({
      where: { groupId },
      include: {
        fromUser: { select: { id: true, name: true, email: true } },
        toUser: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
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
