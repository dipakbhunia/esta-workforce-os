import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';

@Module({
  controllers: [ShiftsController],
  providers: [ShiftsService, RolesGuard],
})
export class ShiftsModule {}
