import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';

@Module({
  controllers: [LeaveController],
  providers: [LeaveService, RolesGuard],
})
export class LeaveModule {}
