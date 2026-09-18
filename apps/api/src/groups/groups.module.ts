import { Module, forwardRef } from '@nestjs/common';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { ExpensesModule } from '../expenses/expenses.module';
import { BalancesModule } from '../balances/balances.module';
import { ActivitiesModule } from '../activities/activities.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    forwardRef(() => ExpensesModule),
    forwardRef(() => BalancesModule),
    ActivitiesModule,
    forwardRef(() => RealtimeModule),
  ],
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
