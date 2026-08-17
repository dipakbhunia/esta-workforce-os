import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CancelTrialDto, ConvertTrialDto, ExtendTrialDto, StartTrialDto, TrialQueryDto } from './dto/trial.dto';
import { TrialsService } from './trials.service';

@ApiTags('Trials') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleName.SUPER_ADMIN)
@Controller('trials')
export class TrialsController {
  constructor(private readonly trials: TrialsService) {}
  @Get() findAll(@Query() query: TrialQueryDto) { return this.trials.findAll(query); }
  @Post() start(@Body() dto: StartTrialDto, @CurrentUser() user: AuthenticatedUser) { return this.trials.start(dto, user); }
  @Get(':id') findOne(@Param('id', ParseUUIDPipe) id: string) { return this.trials.findOne(id); }
  @Post(':id/extend') extend(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ExtendTrialDto, @CurrentUser() user: AuthenticatedUser) { return this.trials.extend(id, dto, user); }
  @Post(':id/cancel') cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelTrialDto, @CurrentUser() user: AuthenticatedUser) { return this.trials.cancel(id, dto, user); }
  @Post(':id/convert') convert(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConvertTrialDto, @CurrentUser() user: AuthenticatedUser) { return this.trials.convert(id, dto, user); }
}
