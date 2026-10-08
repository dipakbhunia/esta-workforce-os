import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreatePlatformUserDto, PlatformAuditQueryDto, PlatformRoleAssignmentDto, PlatformRoleQueryDto, PlatformUserQueryDto, PlatformUserStatusDto, UpdatePlatformUserDto } from './dto/platform-access.dto';
import { PlatformAccessService } from './platform-access.service';

@ApiTags('Platform User & Access') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleName.SUPER_ADMIN)
@Controller('platform/access')
export class PlatformAccessController {
  constructor(private readonly service: PlatformAccessService) {}
  @Get('users') listUsers(@Query() q: PlatformUserQueryDto) { return this.service.listUsers(q); }
  @Get('users/:id') getUser(@Param('id', ParseUUIDPipe) id: string) { return this.service.getUser(id); }
  @Post('users') createUser(@Body() dto: CreatePlatformUserDto, @CurrentUser() actor: AuthenticatedUser) { return this.service.createUser(dto, actor); }
  @Post('users/:id/resend-invitation') resendUserInvitation(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) { return this.service.resendUserInvitation(id, actor); }
  @Patch('users/:id') updateUser(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePlatformUserDto, @CurrentUser() actor: AuthenticatedUser) { return this.service.updateUser(id, dto, actor); }
  @Patch('users/:id/status') setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PlatformUserStatusDto, @CurrentUser() actor: AuthenticatedUser) { return this.service.setUserStatus(id, dto, actor); }
  @Delete('users/:id') deleteUser(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) { return this.service.deleteUser(id, actor); }
  @Post('users/:id/roles') assignRole(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PlatformRoleAssignmentDto, @CurrentUser() actor: AuthenticatedUser) { return this.service.assignRole(id, dto, actor); }
  @Delete('users/:id/roles/:roleId') removeRole(@Param('id', ParseUUIDPipe) id: string, @Param('roleId', ParseUUIDPipe) roleId: string, @CurrentUser() actor: AuthenticatedUser) { return this.service.removeRole(id, roleId, actor); }
  @Get('roles') listRoles(@Query() q: PlatformRoleQueryDto) { return this.service.listRoles(q); }
  @Get('roles/permissions') listPermissions() { return this.service.listPermissions(); }
  @Get('roles/:id') getRole(@Param('id', ParseUUIDPipe) id: string) { return this.service.getRole(id); }
  @Get('audit-logs') listAudit(@Query() q: PlatformAuditQueryDto) { return this.service.listAuditLogs(q); }
  @Get('audit-logs/:id') getAudit(@Param('id', ParseUUIDPipe) id: string) { return this.service.getAuditLog(id); }
}
