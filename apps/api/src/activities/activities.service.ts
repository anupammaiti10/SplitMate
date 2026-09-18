import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginatedActivitiesResponseDto } from './dto/activity-response.dto';

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    groupId: string,
    actorId: string,
    type: ActivityType,
    metadata: Record<string, unknown> = {},
  ) {
    return this.prisma.activity.create({
      data: {
        groupId,
        actorId,
        type,
        metadata,
      },
    });
  }

  async findByGroup(
    groupId: string,
    userId: string,
    page = 1,
    pageSize = 20,
  ): Promise<PaginatedActivitiesResponseDto> {
    const membership = await this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId },
      },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this group');
    }

    const skip = (page - 1) * pageSize;

    const [activities, total] = await Promise.all([
      this.prisma.activity.findMany({
        where: { groupId },
        include: {
          actor: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.activity.count({ where: { groupId } }),
    ]);

    return {
      data: activities.map((a) => ({
        id: a.id,
        groupId: a.groupId,
        actorId: a.actorId,
        type: a.type,
        metadata: a.metadata as Record<string, unknown>,
        createdAt: a.createdAt,
        actor: a.actor,
      })),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }
}
