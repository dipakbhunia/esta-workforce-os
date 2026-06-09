import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';

@Module({
  controllers: [BranchesController],
  providers: [BranchesService, RolesGuard],
})
export class BranchesModule {}
