import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AttendanceCorrectionsService } from './attendance-corrections.service';
import { AttendanceCorrectionQueryDto } from './dto/attendance-correction-query.dto';
import {
  AttendanceCorrectionPaginatedResponseDto,
  AttendanceCorrectionResponseDto,
} from './dto/attendance-correction-response.dto';
import { CreateAttendanceCorrectionRequestDto } from './dto/create-attendance-correction-request.dto';
import { ReviewAttendanceCorrectionDto } from './dto/review-attendance-correction.dto';

const attendanceCorrectionRoles = [
  RoleName.COMPANY_ADMIN,
  RoleName.HR,
  RoleName.MANAGER,
  RoleName.EMPLOYEE,
];

@ApiTags('Attendance Corrections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attendance-corrections')
export class AttendanceCorrectionsController {
  constructor(private readonly service: AttendanceCorrectionsService) {}

  @Post()
  @Roles(...attendanceCorrectionRoles)
  @ApiOperation({ summary: 'Request attendance correction for own attendance' })
  @ApiCreatedResponse({ type: AttendanceCorrectionResponseDto })
  create(
    @Body() dto: CreateAttendanceCorrectionRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AttendanceCorrectionResponseDto> {
    return this.service.create(dto, user);
  }

  @Get()
  @Roles(...attendanceCorrectionRoles)
  @ApiOperation({ summary: 'List visible attendance correction requests' })
  @ApiOkResponse({ type: AttendanceCorrectionPaginatedResponseDto })
  findAll(
    @Query() query: AttendanceCorrectionQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findAll(query, user);
  }

  @Get(':id')
  @Roles(...attendanceCorrectionRoles)
  @ApiOperation({ summary: 'Get attendance correction request by id' })
  @ApiOkResponse({ type: AttendanceCorrectionResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AttendanceCorrectionResponseDto> {
    return this.service.findOne(id, user);
  }

  @Patch(':id/review')
  @Roles(RoleName.COMPANY_ADMIN, RoleName.HR, RoleName.MANAGER)
  @ApiOperation({ summary: 'Approve or reject a pending attendance correction request' })
  @ApiOkResponse({ type: AttendanceCorrectionResponseDto })
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewAttendanceCorrectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AttendanceCorrectionResponseDto> {
    return this.service.review(id, dto, user);
  }

  @Patch(':id/cancel')
  @Roles(...attendanceCorrectionRoles)
  @ApiOperation({ summary: 'Cancel a pending attendance correction request' })
  @ApiOkResponse({ type: AttendanceCorrectionResponseDto })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AttendanceCorrectionResponseDto> {
    return this.service.cancel(id, user);
  }
}
