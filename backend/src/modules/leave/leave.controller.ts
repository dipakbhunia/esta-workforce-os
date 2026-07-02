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
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { LeaveBalanceQueryDto } from './dto/leave-balance-query.dto';
import { LeaveRequestQueryDto } from './dto/leave-request-query.dto';
import {
  LeaveApprovalHistoryResponseDto,
  LeaveRequestResponseDto,
  LeaveTypeResponseDto,
  PaginatedLeaveBalanceResponseDto,
  PaginatedLeaveRequestResponseDto,
  PaginatedLeaveTypeResponseDto,
} from './dto/leave-response.dto';
import { UpdateLeaveStatusDto } from './dto/update-leave-status.dto';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';
import { LeaveService } from './leave.service';

const leaveRoles = [
  RoleName.COMPANY_ADMIN,
  RoleName.HR,
  RoleName.MANAGER,
  RoleName.EMPLOYEE,
];

@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class LeaveController {
  constructor(private readonly service: LeaveService) {}

  @Post('leave-types')
  @ApiTags('Leave Types')
  @Roles(RoleName.COMPANY_ADMIN, RoleName.HR)
  @ApiOperation({ summary: 'Create a leave type in the current tenant' })
  @ApiOkResponse({ type: LeaveTypeResponseDto })
  createType(
    @Body() dto: CreateLeaveTypeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.createType(dto, user);
  }

  @Get('leave-types')
  @ApiTags('Leave Types')
  @Roles(...leaveRoles)
  @ApiOperation({ summary: 'List active leave types with pagination and search' })
  @ApiOkResponse({ type: PaginatedLeaveTypeResponseDto })
  listTypes(
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listTypes(query, user);
  }

  @Patch('leave-types/:id')
  @ApiTags('Leave Types')
  @Roles(RoleName.COMPANY_ADMIN, RoleName.HR)
  @ApiOkResponse({ type: LeaveTypeResponseDto })
  updateType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeaveTypeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updateType(id, dto, user);
  }

  @Delete('leave-types/:id')
  @ApiTags('Leave Types')
  @Roles(RoleName.COMPANY_ADMIN, RoleName.HR)
  @ApiOperation({ summary: 'Soft-delete a leave type' })
  @ApiOkResponse({ type: LeaveTypeResponseDto })
  removeType(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.removeType(id, user);
  }

  @Post('leave-requests')
  @ApiTags('Leave Requests')
  @Roles(...leaveRoles)
  @ApiOperation({ summary: 'Apply for leave as the authenticated employee' })
  @ApiOkResponse({ type: LeaveRequestResponseDto })
  apply(
    @Body() dto: CreateLeaveRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.apply(dto, user);
  }

  @Get('leave-requests')
  @ApiTags('Leave Requests')
  @Roles(...leaveRoles)
  @ApiOperation({ summary: 'List leave requests visible to the authenticated role' })
  @ApiOkResponse({ type: PaginatedLeaveRequestResponseDto })
  listRequests(
    @Query() query: LeaveRequestQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listRequests(query, user);
  }

  @Get('leave-requests/:id')
  @ApiTags('Leave Requests')
  @Roles(...leaveRoles)
  @ApiOkResponse({ type: LeaveRequestResponseDto })
  findRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findRequest(id, user);
  }

  @Patch('leave-requests/:id/status')
  @ApiTags('Leave Requests')
  @Roles(RoleName.COMPANY_ADMIN, RoleName.HR, RoleName.MANAGER)
  @ApiOperation({ summary: 'Approve or reject a pending leave request' })
  @ApiOkResponse({ type: LeaveRequestResponseDto })
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeaveStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.review(id, dto, user);
  }

  @Patch('leave-requests/:id/cancel')
  @ApiTags('Leave Requests')
  @Roles(...leaveRoles)
  @ApiOperation({ summary: 'Cancel a pending leave request' })
  @ApiOkResponse({ type: LeaveRequestResponseDto })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.cancel(id, user);
  }

  @Get('leave-requests/:id/history')
  @ApiTags('Leave Requests')
  @Roles(...leaveRoles)
  @ApiOperation({ summary: 'List approval history for a visible leave request' })
  @ApiOkResponse({ type: LeaveApprovalHistoryResponseDto, isArray: true })
  history(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listHistory(id, user);
  }

  @Get('leave-balances')
  @ApiTags('Leave Balances')
  @Roles(...leaveRoles)
  @ApiOperation({ summary: 'List leave balances visible to the authenticated role' })
  @ApiOkResponse({ type: PaginatedLeaveBalanceResponseDto })
  listBalances(
    @Query() query: LeaveBalanceQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listBalances(query, user);
  }

  @Get('leave-balances/:employeeId')
  @ApiTags('Leave Balances')
  @Roles(...leaveRoles)
  @ApiOperation({ summary: 'List leave balances for a visible employee' })
  @ApiOkResponse({ type: PaginatedLeaveBalanceResponseDto })
  listEmployeeBalances(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query() query: LeaveBalanceQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listEmployeeBalances(employeeId, query, user);
  }
}
