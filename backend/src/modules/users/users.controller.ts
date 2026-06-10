import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { AssignRoleDto } from './dto/assign-role.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UserStatusDto } from './dto/user-status.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('change-password')
  @ApiOperation({ summary: 'Change the current user password' })
  changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.changePassword(dto, user);
  }

  @Post()
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN, RoleName.HR)
  @ApiOperation({ summary: 'Create a user within the permitted tenant scope' })
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.create(dto, user);
  }

  @Get()
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN, RoleName.HR)
  @ApiOperation({ summary: 'List manageable users with pagination and search' })
  findAll(
    @Query() query: UserQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.findAll(query, user);
  }

  @Get(':id')
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN, RoleName.HR)
  @ApiOperation({ summary: 'Get a manageable user' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN, RoleName.HR)
  @ApiOperation({ summary: 'Update a manageable user' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN, RoleName.HR)
  @ApiOperation({ summary: 'Soft-delete a manageable user' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.remove(id, user);
  }

  @Patch(':id/status')
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN, RoleName.HR)
  @ApiOperation({ summary: 'Activate or deactivate a manageable user' })
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UserStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.setStatus(id, dto, user);
  }

  @Post(':id/roles')
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN, RoleName.HR)
  @ApiOperation({ summary: 'Assign a role to a manageable user' })
  assignRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.assignRole(id, dto, user);
  }

  @Delete(':id/roles/:roleId')
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN, RoleName.HR)
  @ApiOperation({ summary: 'Remove a role from a manageable user' })
  removeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.removeRole(id, roleId, user);
  }

  @Post(':id/reset-password')
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN, RoleName.HR)
  @ApiOperation({ summary: 'Reset a manageable user password' })
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.resetPassword(id, dto, user);
  }
}
