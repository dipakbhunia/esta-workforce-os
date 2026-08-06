import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { TimeBoundaryService } from '../attendance/time-boundary.service';
import { HolidayCalendarsController } from './holiday-calendars.controller';
import { HolidayCalendarsService } from './holiday-calendars.service';
import { SchedulingController } from './scheduling.controller';
import { ShiftRostersController } from './shift-rosters.controller';
import { ShiftRostersService } from './shift-rosters.service';
import { WeeklyOffRulesController } from './weekly-off-rules.controller';
import { WeeklyOffRulesService } from './weekly-off-rules.service';
import { WorkCalendarService } from './work-calendar.service';

@Module({
  imports: [DatabaseModule],
  controllers: [
    SchedulingController,
    ShiftRostersController,
    WeeklyOffRulesController,
    HolidayCalendarsController,
  ],
  providers: [
    WorkCalendarService,
    ShiftRostersService,
    WeeklyOffRulesService,
    HolidayCalendarsService,
    TimeBoundaryService,
  ],
  exports: [WorkCalendarService],
})
export class SchedulingModule {}
