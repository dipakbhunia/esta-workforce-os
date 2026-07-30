import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AttendanceService } from './attendance.service';

@Injectable()
export class StaleAttendanceScheduler {
  private readonly logger = new Logger(StaleAttendanceScheduler.name);
  private running = false;
  private lastEvaluationAt = 0;

  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async evaluateOpenAttendance(): Promise<void> {
    if (this.config.get<boolean>('ATTENDANCE_STALE_EVALUATION_ENABLED') === false) {
      return;
    }
    const intervalMinutes = Number(
      this.config.get<number | string>(
        'ATTENDANCE_STALE_EVALUATION_INTERVAL_MINUTES',
      ) ?? 5,
    );
    const intervalMs = Math.max(1, intervalMinutes) * 60000;
    const now = Date.now();
    if (now - this.lastEvaluationAt < intervalMs) return;
    if (this.running) {
      this.logger.warn('Skipped stale attendance evaluation because a previous run is still active.');
      return;
    }

    this.running = true;
    this.lastEvaluationAt = now;
    try {
      const closed = await this.attendanceService.enforceStaleAttendanceSessions();
      this.logger.log(`Stale attendance evaluation complete. Auto-closed ${closed} session(s).`);
    } catch (error) {
      this.logger.error('Stale attendance evaluation failed.', error as Error);
    } finally {
      this.running = false;
    }
  }
}
