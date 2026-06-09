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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@ApiTags('Companies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @Roles(RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a company (super admin)' })
  @ApiCreatedResponse()
  create(@Body() dto: CreateCompanyDto) {
    return this.companiesService.create(dto);
  }

  @Get()
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN, RoleName.HR)
  @ApiOperation({ summary: 'List accessible companies' })
  @ApiOkResponse()
  findAll(
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.findAll(query, user);
  }

  @Get(':id')
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN, RoleName.HR)
  @ApiOperation({ summary: 'Get an accessible company' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Update an accessible company' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Soft-delete a company (super admin)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.companiesService.remove(id);
  }
}
