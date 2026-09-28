import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('associates an optional description without changing confirmation behavior', () => {
    const confirm = vi.fn();
    render(<ConfirmDialog open title="Confirm recovery" description="Review the durable state." descriptionId="confirm-description" onConfirm={confirm} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-describedby', 'confirm-description');
    expect(document.getElementById('confirm-description')).toHaveTextContent('Review the durable state.');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('preserves existing callers that do not provide a description ID', () => {
    render(<ConfirmDialog open description="Existing description" />);
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-describedby');
    expect(screen.getByText('Existing description')).not.toHaveAttribute('id');
  });
});
