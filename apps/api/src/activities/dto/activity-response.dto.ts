import { ActivityType } from '@prisma/client';

export class ActorDto {
  id: string;
  name: string;
  email: string;
}

export class ActivityResponseDto {
  id: string;
  groupId: string;
  actorId: string;
  type: ActivityType;
  metadata: Record<string, unknown>;
  createdAt: Date;
  actor: ActorDto;
}

export class PaginatedActivitiesResponseDto {
  data: ActivityResponseDto[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}
