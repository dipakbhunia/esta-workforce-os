import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TimeBoundaryService } from './time-boundary.service';

describe('TimeBoundaryService', () => {
  const service = new TimeBoundaryService();

  it('resolves a normal day shift window', () => {
    const window = service.resolveShiftWindow({
      workDate: '2026-07-29',
      startTime: '09:00',
      endTime: '18:00',
      timezone: 'Asia/Kolkata',
    });

    assert.equal(window.crossesMidnight, false);
    assert.equal(window.scheduledMinutes, 540);
    assert.equal(window.scheduledStartAt.toISOString(), '2026-07-29T03:30:00.000Z');
    assert.equal(window.scheduledEndAt.toISOString(), '2026-07-29T12:30:00.000Z');
  });

  it('resolves a cross-midnight night shift window', () => {
    const window = service.resolveShiftWindow({
      workDate: '2026-07-29',
      startTime: '22:00',
      endTime: '07:00',
      timezone: 'Asia/Kolkata',
    });

    assert.equal(window.crossesMidnight, true);
    assert.equal(window.scheduledMinutes, 540);
    assert.equal(window.scheduledStartAt.toISOString(), '2026-07-29T16:30:00.000Z');
    assert.equal(window.scheduledEndAt.toISOString(), '2026-07-30T01:30:00.000Z');
  });

  it('preserves an open attendance work date after midnight', () => {
    const resolution = service.resolveWorkDate({
      timestamp: new Date('2026-07-29T19:30:00.000Z'),
      timezone: 'Asia/Kolkata',
      attendanceDayStartTime: '00:00',
      openAttendanceDate: '2026-07-29',
    });

    assert.equal(resolution.workDate, '2026-07-29');
  });

  it('applies attendance day start boundaries in the resolved timezone', () => {
    const resolution = service.resolveWorkDate({
      timestamp: new Date('2026-07-29T23:30:00.000Z'),
      timezone: 'Asia/Kolkata',
      attendanceDayStartTime: '06:00',
    });

    assert.equal(resolution.workDate, '2026-07-29');
  });

  it('converts date-only work ranges through timezone-aware boundaries', () => {
    const range = service.resolveDateOnlyRange(
      '2026-07-29',
      'Asia/Kolkata',
      '00:00',
    );

    assert.equal(range.rangeStart.toISOString(), '2026-07-28T18:30:00.000Z');
    assert.equal(range.rangeEnd.toISOString(), '2026-07-29T18:29:59.999Z');
  });

  it('handles a DST-capable timezone without fixed offset arithmetic', () => {
    const summer = service.resolveShiftWindow({
      workDate: '2026-07-01',
      startTime: '09:00',
      endTime: '17:00',
      timezone: 'America/New_York',
    });
    const winter = service.resolveShiftWindow({
      workDate: '2026-01-01',
      startTime: '09:00',
      endTime: '17:00',
      timezone: 'America/New_York',
    });

    assert.notEqual(
      summer.scheduledStartAt.toISOString().slice(11, 16),
      winter.scheduledStartAt.toISOString().slice(11, 16),
    );
    assert.equal(summer.scheduledMinutes, 480);
    assert.equal(winter.scheduledMinutes, 480);
  });
});
