import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreatePlatformGstPolicyDto, PlatformGstPolicyQueryDto, PlatformGstTransactionQueryDto } from './dto/platform-gst.dto';
import { PlatformGstService } from './platform-gst.service';

@ApiTags('Platform GST') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleName.SUPER_ADMIN) @Controller('platform/gst')
export class PlatformGstController {
  constructor(private readonly gst: PlatformGstService) {}
  @Get('policies') listPolicies(@Query() query: PlatformGstPolicyQueryDto) { return this.gst.listPolicies(query); }
  @Post('policies') createPolicy(@Body() dto: CreatePlatformGstPolicyDto, @CurrentUser() actor: AuthenticatedUser) { return this.gst.createPolicy(dto, actor.id); }
  @Get('policies/:id') getPolicy(@Param('id', ParseUUIDPipe) id: string) { return this.gst.getPolicy(id); }
  @Get('transactions') listTransactions(@Query() query: PlatformGstTransactionQueryDto) { return this.gst.listTransactions(query); }
  @Get('transactions/:id') getTransaction(@Param('id', ParseUUIDPipe) id: string) { return this.gst.getTransaction(id); }
}
