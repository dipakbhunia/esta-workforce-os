import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PlatformDashboardQueryDto } from './dto/platform-dashboard-query.dto';
import { PlatformDashboardService } from './platform-dashboard.service';

@ApiTags('Platform Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.SUPER_ADMIN)
@Controller('platform-dashboard')
export class PlatformDashboardController {
  constructor(private readonly dashboard: PlatformDashboardService) {}

  @Get()
  getDashboard(@Query() query: PlatformDashboardQueryDto) {
    return this.dashboard.getDashboard(query);
  }
}
