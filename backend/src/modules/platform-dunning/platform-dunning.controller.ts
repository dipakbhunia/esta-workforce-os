import { Controller, Get, InternalServerErrorException, NotFoundException, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PlatformDunningQueryDto } from './platform-dunning.dto';
import { PlatformDunningService } from './platform-dunning.service';
import { DunningIntegrityError, DunningNotFoundError, PlatformDunningQuery } from './platform-dunning.types';

export function mapDunningReadError(error: unknown): Error {
  if (error instanceof DunningNotFoundError) return new NotFoundException('Renewal not found');
  if (error instanceof DunningIntegrityError) return new InternalServerErrorException('Dunning evidence is inconsistent');
  return new InternalServerErrorException('Dunning records could not be loaded');
}

@ApiTags('Platform Dunning')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.SUPER_ADMIN)
@Controller('platform/dunning')
export class PlatformDunningController {
  constructor(private readonly dunning: PlatformDunningService) {}

  @Get()
  async findAll(@Query() query: PlatformDunningQueryDto) {
    try { return await this.dunning.findAll(toServiceQuery(query)); }
    catch (error) { throw mapDunningReadError(error); }
  }

  @Get(':renewalId')
  async findOne(@Param('renewalId', ParseUUIDPipe) renewalId: string) {
    try { return await this.dunning.findOne(renewalId); }
    catch (error) { throw mapDunningReadError(error); }
  }
}

function toServiceQuery(query: PlatformDunningQueryDto): PlatformDunningQuery {
  return { page: query.page, limit: query.limit, companyId: query.companyId, subscriptionId: query.subscriptionId,
    renewalId: query.renewalId, paymentId: query.paymentId, paymentStatus: query.paymentStatus,
    from: query.from ? new Date(query.from) : undefined, to: query.to ? new Date(query.to) : undefined };
}
