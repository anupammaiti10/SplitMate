import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SettlementsService } from './settlements.service';
import { CreateSettlementDto } from './dto/create-settlement.dto';

@UseGuards(JwtAuthGuard)
@Controller('groups/:groupId/settlements')
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('groupId') groupId: string,
    @Body() dto: CreateSettlementDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.settlementsService.create(groupId, dto, userId);
  }

  @Get()
  async findAll(
    @Param('groupId') groupId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.settlementsService.findByGroup(groupId, userId);
  }
}
