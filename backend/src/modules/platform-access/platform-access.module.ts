import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UsersModule } from '../users/users.module';
import { PlatformAccessController } from './platform-access.controller';
import { PlatformAccessService } from './platform-access.service';

@Module({
  imports: [UsersModule],
  controllers: [PlatformAccessController],
  providers: [PlatformAccessService, RolesGuard],
})
export class PlatformAccessModule {}
