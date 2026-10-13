import { describe, expect, it } from 'vitest';
import { resolvePlatformDashboardRange, setPlatformDashboardRange, utcCalendarToday } from './platform-dashboard-range';

const today = new Date(2026, 8, 1);

describe('platform dashboard range URL contract', () => {
  it('anchors the dashboard calendar to the UTC day when IST is already one day ahead', () => {
    const result = utcCalendarToday(new Date('2026-10-09T18:45:00.000Z'));

    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(9);
    expect(result.getDate()).toBe(9);
  });

  it('defaults to the inclusive last 30 UTC calendar days at the local-date boundary', () => {
    const utcToday = utcCalendarToday(new Date('2026-10-09T18:45:00.000Z'));
    const result = resolvePlatformDashboardRange(new URLSearchParams(), utcToday);

    expect(result).toEqual({
      value: { preset: 'last30Days', dateFrom: '2026-09-10', dateTo: '2026-10-09' },
      shouldNormalize: true,
    });
  });

  it('defaults to the inclusive last 30 calendar days', () => {
    const result = resolvePlatformDashboardRange(new URLSearchParams(), today);

    expect(result).toEqual({
      value: { preset: 'last30Days', dateFrom: '2026-08-03', dateTo: '2026-09-01' },
      shouldNormalize: true,
    });
  });

  it('hydrates an exact valid URL pair', () => {
    const result = resolvePlatformDashboardRange(
      new URLSearchParams('from=2026-08-01&to=2026-08-31'),
      today,
    );

    expect(result).toEqual({
      value: { preset: 'customRange', dateFrom: '2026-08-01', dateTo: '2026-08-31' },
      shouldNormalize: false,
    });
  });

  it.each([
    'from=2026-08-01',
    'to=2026-08-31',
    'from=08%2F01%2F2026&to=2026-08-31',
    'from=2026-02-31&to=2026-08-31',
    'from=2026-08-31&to=2026-08-01',
    'from=2026-08-01&to=2026-09-02',
    'from=2025-08-31&to=2026-09-01',
  ])('normalizes an unsupported URL pair without preserving a partial pair: %s', (query) => {
    expect(resolvePlatformDashboardRange(new URLSearchParams(query), today)).toEqual({
      value: { preset: 'last30Days', dateFrom: '2026-08-03', dateTo: '2026-09-01' },
      shouldNormalize: true,
    });
  });

  it('normalizes a local-ahead future URL using the UTC maximum date', () => {
    const utcToday = utcCalendarToday(new Date('2026-10-09T18:45:00.000Z'));

    expect(resolvePlatformDashboardRange(
      new URLSearchParams('from=2026-09-11&to=2026-10-10'),
      utcToday,
    )).toEqual({
      value: { preset: 'last30Days', dateFrom: '2026-09-10', dateTo: '2026-10-09' },
      shouldNormalize: true,
    });
  });

  it('preserves unrelated URL parameters when applying a range', () => {
    const result = setPlatformDashboardRange(
      new URLSearchParams('tab=health&from=2026-08-01&to=2026-08-31'),
      { preset: 'last7Days', dateFrom: '2026-08-26', dateTo: '2026-09-01' },
    );

    expect(result.toString()).toBe('tab=health&from=2026-08-26&to=2026-09-01');
  });
});
