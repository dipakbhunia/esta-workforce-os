import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlatformCommunicationController } from './platform-communication.controller';
import { PlatformCommunicationService } from './platform-communication.service';

@Module({
  imports: [DatabaseModule, NotificationsModule],
  controllers: [PlatformCommunicationController],
  providers: [PlatformCommunicationService],
})
export class PlatformCommunicationModule {}
