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
import { CreateShiftAssignmentDto } from './dto/create-shift-assignment.dto';
import { ShiftAssignmentQueryDto } from './dto/shift-assignment-query.dto';
import {
  PaginatedShiftAssignmentResponseDto,
  ShiftAssignmentResponseDto,
} from './dto/shift-assignment-response.dto';
import { UpdateShiftAssignmentDto } from './dto/update-shift-assignment.dto';
import { ShiftAssignmentsService } from './shift-assignments.service';

const shiftAssignmentRoles = [RoleName.COMPANY_ADMIN, RoleName.HR];

@ApiTags('Shift Assignments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...shiftAssignmentRoles)
@Controller('shift-assignments')
export class ShiftAssignmentsController {
  constructor(private readonly service: ShiftAssignmentsService) {}

  @Get('employee/:employeeId/current')
  @ApiOperation({
    summary: 'Get the current effective shift assignment for an employee',
  })
  @ApiOkResponse({ type: ShiftAssignmentResponseDto, nullable: true })
  currentForEmployee(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.currentForEmployee(employeeId, user);
  }

  @Get('employee/:employeeId/future')
  @ApiOperation({ summary: 'List future shift assignments for an employee' })
  @ApiOkResponse({ type: PaginatedShiftAssignmentResponseDto })
  futureForEmployee(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.futureForEmployee(employeeId, query, user);
  }

  @Get('employee/:employeeId/history')
  @ApiOperation({ summary: 'List historical shift assignments for an employee' })
  @ApiOkResponse({ type: PaginatedShiftAssignmentResponseDto })
  historyForEmployee(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.historyForEmployee(employeeId, query, user);
  }

  @Post()
  @ApiOperation({
    summary: 'Create an effective-dated employee shift assignment',
    description:
      'Uses [effectiveFrom, effectiveTo) range semantics and rejects overlapping non-cancelled assignments for the same employee.',
  })
  @ApiOkResponse({ type: ShiftAssignmentResponseDto })
  create(
    @Body() dto: CreateShiftAssignmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List tenant shift assignments' })
  @ApiOkResponse({ type: PaginatedShiftAssignmentResponseDto })
  findAll(
    @Query() query: ShiftAssignmentQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findAll(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get shift assignment details' })
  @ApiOkResponse({ type: ShiftAssignmentResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findOne(id, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an effective-dated shift assignment' })
  @ApiOkResponse({ type: ShiftAssignmentResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShiftAssignmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel a shift assignment' })
  @ApiOkResponse({ type: ShiftAssignmentResponseDto })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.remove(id, user);
  }
}
