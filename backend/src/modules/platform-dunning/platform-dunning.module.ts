import { Module } from '@nestjs/common';
import { PlatformDunningController } from './platform-dunning.controller';
import { PlatformDunningService } from './platform-dunning.service';

@Module({ controllers: [PlatformDunningController], providers: [PlatformDunningService] })
export class PlatformDunningModule {}
