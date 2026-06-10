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
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { EmployeeQueryDto } from './dto/employee-query.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeesService } from './employees.service';

const employeeViewRoles = [
  RoleName.SUPER_ADMIN,
  RoleName.COMPANY_ADMIN,
  RoleName.HR,
  RoleName.MANAGER,
  RoleName.EMPLOYEE,
];

@ApiTags('Employees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @Roles(RoleName.COMPANY_ADMIN, RoleName.HR)
  @ApiOperation({ summary: 'Create an employee profile in the current tenant' })
  create(
    @Body() dto: CreateEmployeeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employeesService.create(dto, user);
  }

  @Get()
  @Roles(...employeeViewRoles)
  @ApiOperation({
    summary: 'List visible employee profiles with pagination and search',
    description:
      'Super admins see all, tenant administrators see their company, managers see themselves and direct reports, and employees see themselves.',
  })
  findAll(
    @Query() query: EmployeeQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employeesService.findAll(query, user);
  }

  @Get(':id')
  @Roles(...employeeViewRoles)
  @ApiOperation({ summary: 'Get a visible employee profile' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employeesService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(RoleName.COMPANY_ADMIN, RoleName.HR)
  @ApiOperation({ summary: 'Update an employee profile in the current tenant' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employeesService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(RoleName.COMPANY_ADMIN, RoleName.HR)
  @ApiOperation({ summary: 'Soft-delete an employee profile' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employeesService.remove(id, user);
  }
}
