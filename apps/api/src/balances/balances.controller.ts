import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BalancesService } from './balances.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class BalancesController {
  constructor(private readonly balancesService: BalancesService) {}

  @Get('groups/:groupId/balances')
  async getGroupBalances(
    @Param('groupId') groupId: string,
  ) {
    return this.balancesService.getGroupBalanceWithDebts(groupId);
  }

  @Get('dashboard')
  async getDashboard(@CurrentUser('userId') userId: string) {
    return this.balancesService.getUserOverallBalance(userId);
  }

  @Get('history')
  async getHistory(@CurrentUser('userId') userId: string) {
    return this.balancesService.getUserHistory(userId);
  }
}
