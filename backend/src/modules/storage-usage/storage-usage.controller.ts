import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StorageUsageQueryDto } from './dto/storage-usage-query.dto';
import { StorageUsageQueryService } from './storage-usage-query.service';

@ApiTags('Storage Usage')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.SUPER_ADMIN)
@Controller('storage-usage')
export class StorageUsageController {
  constructor(private readonly storageUsage: StorageUsageQueryService) {}

  @Get()
  findAll(@Query() query: StorageUsageQueryDto) {
    return this.storageUsage.findAll(query);
  }

  @Get('companies/:companyId')
  findCompany(
    @Param('companyId', ParseUUIDPipe) companyId: string,
  ) {
    return this.storageUsage.findCompany(companyId);
  }
}
