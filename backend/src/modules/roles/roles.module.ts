import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  controllers: [RolesController],
  providers: [RolesService, RolesGuard],
})
export class RolesModule {}
