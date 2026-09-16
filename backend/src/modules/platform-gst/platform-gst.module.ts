import { Module } from '@nestjs/common';
import { PlatformGstController } from './platform-gst.controller';
import { PlatformGstService } from './platform-gst.service';
@Module({ controllers: [PlatformGstController], providers: [PlatformGstService] })
export class PlatformGstModule {}
