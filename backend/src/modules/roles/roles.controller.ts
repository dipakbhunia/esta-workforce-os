import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { RoleQueryDto } from './dto/role-query.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

@ApiTags('Roles and Permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('permissions')
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN)
  @ApiOperation({ summary: 'List the permission catalog' })
  findPermissions() {
    return this.rolesService.findPermissions();
  }

  @Post()
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Create a global or tenant role' })
  create(
    @Body() dto: CreateRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rolesService.create(dto, user);
  }

  @Get()
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN, RoleName.HR)
  @ApiOperation({ summary: 'List accessible roles with pagination and search' })
  findAll(
    @Query() query: RoleQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rolesService.findAll(query, user);
  }

  @Get(':id')
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN, RoleName.HR)
  @ApiOperation({ summary: 'Get an accessible role' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rolesService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Update an accessible role' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rolesService.update(id, dto, user);
  }

  @Put(':id/permissions')
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Replace the permissions assigned to a role' })
  assignPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignPermissionsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rolesService.assignPermissions(id, dto, user);
  }
}
