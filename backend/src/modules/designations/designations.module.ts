import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DesignationsController } from './designations.controller';
import { DesignationsService } from './designations.service';

@Module({
  controllers: [DesignationsController],
  providers: [DesignationsService, RolesGuard],
})
export class DesignationsModule {}
