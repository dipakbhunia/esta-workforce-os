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
import {
  CompanySeatDetailsQueryDto,
  UsageSeatsQueryDto,
} from './dto/usage-seats-query.dto';
import { UsageSeatsQueryService } from './usage-seats-query.service';

@ApiTags('Usage & Seats')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.SUPER_ADMIN)
@Controller('usage-seats')
export class UsageSeatsController {
  constructor(private readonly usageSeats: UsageSeatsQueryService) {}

  @Get()
  findAll(@Query() query: UsageSeatsQueryDto) {
    return this.usageSeats.findAll(query);
  }

  @Get('companies/:companyId')
  findCompany(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query() query: CompanySeatDetailsQueryDto,
  ) {
    return this.usageSeats.findCompany(companyId, query);
  }
}
