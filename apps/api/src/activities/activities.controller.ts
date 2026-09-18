import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ActivitiesService } from './activities.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginatedActivitiesResponseDto } from './dto/activity-response.dto';

@UseGuards(JwtAuthGuard)
@Controller('groups/:groupId/activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get()
  async getActivities(
    @Param('groupId') groupId: string,
    @CurrentUser('userId') userId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<PaginatedActivitiesResponseDto> {
    const pageNum = page ? Math.max(1, parseInt(page, 10)) : 1;
    const size = pageSize ? Math.min(100, Math.max(1, parseInt(pageSize, 10))) : 20;

    return this.activitiesService.findByGroup(groupId, userId, pageNum, size);
  }
}
