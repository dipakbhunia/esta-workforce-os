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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { CompanyQueryDto } from './dto/company-query.dto';
import {
  CompanyPaginatedResponseDto,
  CompanyResponseDto,
} from './dto/company-response.dto';
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
  @ApiCreatedResponse({ type: CompanyResponseDto })
  create(
    @Body() dto: CreateCompanyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.create(dto, user);
  }

  @Get()
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN, RoleName.HR)
  @ApiOperation({ summary: 'List accessible companies' })
  @ApiOkResponse({ type: CompanyPaginatedResponseDto })
  findAll(
    @Query() query: CompanyQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.findAll(query, user);
  }

  @Get(':id')
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN, RoleName.HR)
  @ApiOperation({ summary: 'Get an accessible company' })
  @ApiOkResponse({ type: CompanyResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Update an accessible company' })
  @ApiOkResponse({ type: CompanyResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Archive a company without deleting tenant data (super admin)' })
  @ApiOkResponse({ type: CompanyResponseDto })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.remove(id, user);
  }
}
