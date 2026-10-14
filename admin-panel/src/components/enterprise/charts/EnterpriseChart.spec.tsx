import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EnterpriseBarChart, EnterpriseChartLegend } from './EnterpriseChart';

const duplicatePlans = [
  { id: 'plan-a', label: 'Renewal D', value: 1 },
  { id: 'plan-b', label: 'Renewal D', value: 2 },
];

describe('EnterpriseBarChart stable item identity', () => {
  it.each([true, false])('renders duplicate labels without key warnings when horizontal=%s', (horizontal) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<EnterpriseBarChart data={duplicatePlans} itemKey="id" categoryKey="label" valueKey="value" horizontal={horizontal} />);

    expect(screen.getAllByText('Renewal D')).toHaveLength(2);
    expect(screen.getAllByLabelText(/Renewal D:/)).toHaveLength(2);
    expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining('same key'), expect.anything());
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('same key');
  });

  it('preserves item identity across reorder and value updates', () => {
    const { rerender } = render(<EnterpriseBarChart data={duplicatePlans} itemKey="id" categoryKey="label" valueKey="value" horizontal />);
    rerender(<EnterpriseBarChart data={[
      { id: 'plan-b', label: 'Renewal D', value: 7 },
      { id: 'plan-a', label: 'Renewal D', value: 4 },
    ]} itemKey="id" categoryKey="label" valueKey="value" horizontal />);

    expect(screen.getAllByLabelText(/Renewal D:/).map((node) => node.getAttribute('aria-label'))).toEqual([
      'Renewal D: 7',
      'Renewal D: 4',
    ]);
  });

  it('keeps the category identity fallback compatible for unique-label callers', () => {
    render(<EnterpriseBarChart data={[{ label: 'Active', value: 3 }, { label: 'Paused', value: 1 }]} categoryKey="label" valueKey="value" />);
    expect(screen.getByLabelText('Active: 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Paused: 1')).toBeInTheDocument();
  });
});

describe('EnterpriseChartLegend stable item identity', () => {
  it('renders duplicate labels with explicit stable IDs without key warnings', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<EnterpriseChartLegend items={[
      { id: 'plan-a', label: 'Renewal D', color: '#111', value: 1 },
      { id: 'plan-b', label: 'Renewal D', color: '#222', value: 2 },
    ]} />);

    expect(screen.getByText('Renewal D: 1')).toBeInTheDocument();
    expect(screen.getByText('Renewal D: 2')).toBeInTheDocument();
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('same key');
  });
});
