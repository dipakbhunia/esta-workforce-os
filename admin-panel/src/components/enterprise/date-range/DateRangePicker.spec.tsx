import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DateRangePicker } from './DateRangePicker';
import { createDateRangeValue, formatDateOnly } from './date-range-utils';

describe('DateRangePicker reference date', () => {
  it('uses the supplied UTC calendar anchor for presets and maximum selection', () => {
    const today = new Date(2026, 9, 9);
    const onChange = vi.fn();
    const value = createDateRangeValue('last30Days', today);

    render(
      <DateRangePicker
        value={value}
        onChange={onChange}
        defaultPreset="last30Days"
        maxDate={formatDateOnly(today)}
        today={today}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Date Range:/ }));
    expect(screen.getAllByRole('button', { name: 'Select 2026-10-10' })[0]).toBeDisabled();

    fireEvent.click(screen.getByText('Last 7 Days'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onChange).toHaveBeenCalledWith({
      preset: 'last7Days',
      dateFrom: '2026-10-03',
      dateTo: '2026-10-09',
    });
  });
});
