import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@UseGuards(JwtAuthGuard)
@Controller('groups/:groupId/expenses')
export class ExpensesController {
  constructor(
    private readonly expensesService: ExpensesService,
    @Inject(forwardRef(() => RealtimeGateway))
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('groupId') groupId: string,
    @Body() dto: CreateExpenseDto,
    @CurrentUser('userId') userId: string,
  ) {
    const expense = await this.expensesService.create(groupId, dto, userId);

    this.realtimeGateway?.emitToGroup(groupId, 'group.expense.created', {
      expense,
      actorId: userId,
    });

    return expense;
  }

  @Get()
  async findAll(
    @Param('groupId') groupId: string,
    @CurrentUser('userId') userId: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 20,
    @Query('sortBy') sortBy: string = 'createdAt',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'desc',
  ) {
    return this.expensesService.findAll(
      groupId,
      userId,
      page,
      pageSize,
      sortBy,
      sortOrder,
    );
  }

  @Get(':expenseId')
  async findOne(
    @Param('groupId') groupId: string,
    @Param('expenseId') expenseId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.expensesService.findById(expenseId, groupId, userId);
  }

  @Patch(':expenseId')
  async update(
    @Param('groupId') groupId: string,
    @Param('expenseId') expenseId: string,
    @Body() dto: UpdateExpenseDto,
    @CurrentUser('userId') userId: string,
  ) {
    const expense = await this.expensesService.update(
      groupId,
      expenseId,
      dto,
      userId,
    );

    this.realtimeGateway?.emitToGroup(groupId, 'group.expense.updated', {
      expense,
      actorId: userId,
    });

    return expense;
  }

  @Delete(':expenseId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('groupId') groupId: string,
    @Param('expenseId') expenseId: string,
    @CurrentUser('userId') userId: string,
  ) {
    await this.expensesService.delete(groupId, expenseId, userId);

    this.realtimeGateway?.emitToGroup(groupId, 'group.expense.deleted', {
      expenseId,
      actorId: userId,
    });
  }
}
