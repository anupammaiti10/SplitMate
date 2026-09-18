import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { AddMemberDto } from './dto/add-member.dto';

@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  create(
    @Body() createGroupDto: CreateGroupDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.groupsService.create(createGroupDto, userId);
  }

  @Get()
  findAll(@CurrentUser('userId') userId: string) {
    return this.groupsService.findAll(userId);
  }

  @Get(':groupId')
  findById(
    @Param('groupId') groupId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.groupsService.findById(groupId, userId);
  }

  @Delete(':groupId')
  delete(
    @Param('groupId') groupId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.groupsService.delete(groupId, userId);
  }

  @Post(':groupId/members')
  addMember(
    @Param('groupId') groupId: string,
    @Body() addMemberDto: AddMemberDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.groupsService.addMember(groupId, userId, addMemberDto);
  }

  @Delete(':groupId/members/:userId')
  removeMember(
    @Param('groupId') groupId: string,
    @Param('userId') targetUserId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.groupsService.removeMember(groupId, userId, targetUserId);
  }

  @Get(':groupId/members')
  getMembers(
    @Param('groupId') groupId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.groupsService.getMembers(groupId, userId);
  }
}
