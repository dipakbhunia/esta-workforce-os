import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { issue } = vi.hoisted(() => ({ issue: vi.fn() }));
vi.mock('../platform-invoices-api', async (original) => ({
  ...(await original<typeof import('../platform-invoices-api')>()),
  issuePlatformInvoice: issue,
}));
import { IssueInvoiceDialog } from './IssueInvoiceDialog';

const paymentId = '123e4567-e89b-42d3-a456-426614174000';
const result = { data: { id: 'invoice-id' } };

describe('IssueInvoiceDialog', () => {
  beforeEach(() => { issue.mockReset(); });

  it('rejects empty and malformed IDs accessibly without a request', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Issue Invoice' }));
    expect(screen.getByLabelText(/Payment ID/)).toHaveAccessibleDescription('Payment ID is required.');
    fireEvent.change(screen.getByLabelText(/Payment ID/), { target: { value: 'not-a-uuid' } });
    expect(issue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Issue Invoice' }));
    expect(screen.getByLabelText(/Payment ID/)).toHaveAccessibleDescription('Enter a valid Payment UUID.');
    expect(issue).not.toHaveBeenCalled();
  });

  it('does not request while typing and trims only surrounding whitespace on submit', async () => {
    issue.mockResolvedValue(result);
    const { onIssued } = renderDialog();
    fireEvent.change(screen.getByLabelText(/Payment ID/), { target: { value: `  ${paymentId}  ` } });
    expect(issue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Issue Invoice' }));
    await waitFor(() => expect(issue).toHaveBeenCalledWith({ paymentId }, expect.anything()));
    await waitFor(() => expect(onIssued).toHaveBeenCalledWith('invoice-id'));
  });

  it('prevents duplicate submission, preserves pending state, invalidates lists, and returns the Invoice ID', async () => {
    let resolve!: (value: typeof result) => void;
    issue.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const { client, onClose, onIssued } = renderDialog();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    fireEvent.change(screen.getByLabelText(/Payment ID/), { target: { value: paymentId } });
    fireEvent.click(screen.getByRole('button', { name: 'Issue Invoice' }));
    fireEvent.submit(screen.getByRole('button', { name: 'Issue Invoice' }).closest('form')!);
    expect(await screen.findByRole('status')).toHaveTextContent('Issuing Invoice');
    expect(screen.getByRole('button', { name: 'Issuing…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Issuing…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(issue).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    resolve(result);
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['platform-invoices', 'list'] }));
    await waitFor(() => expect(onIssued).toHaveBeenCalledWith('invoice-id'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/newly created/i)).not.toBeInTheDocument();
  });

  it.each([
    [404, 'source Payment was not found'],
    [409, 'not eligible for Invoice issuance'],
    [422, 'required billing configuration or commercial evidence is incomplete'],
    [500, 'Invoice could not be issued. Check connectivity'],
  ])('maps %s safely, hides raw content, and retains the Payment ID', async (status, safeText) => {
    issue.mockRejectedValue({ isAxiosError: true, response: { status, data: { message: 'raw database and secret detail' } } });
    renderDialog();
    fireEvent.change(screen.getByLabelText(/Payment ID/), { target: { value: paymentId } });
    fireEvent.click(screen.getByRole('button', { name: 'Issue Invoice' }));
    expect(await screen.findByText(new RegExp(safeText, 'i'))).toBeInTheDocument();
    expect(screen.queryByText(/raw database and secret detail/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Payment ID/)).toHaveValue(paymentId);
    expect(screen.getByRole('button', { name: 'Issue Invoice' })).toBeEnabled();
  });

  it('cancels without mutation and reopens with clean state', async () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/Payment ID/), { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Issue Invoice' }));
    expect(screen.getByText('Enter a valid Payment UUID.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(issue).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
    expect(screen.getByLabelText(/Payment ID/)).toHaveValue('');
    expect(screen.queryByText('Enter a valid Payment UUID.')).not.toBeInTheDocument();
  });
});

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const onClose = vi.fn();
  const onIssued = vi.fn();
  render(<QueryClientProvider client={client}><IssueInvoiceDialog open onClose={onClose} onIssued={onIssued} /></QueryClientProvider>);
  return { client, onClose, onIssued };
}

function Harness() {
  const [open, setOpen] = useState(true);
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>
    <button onClick={() => setOpen(true)}>Open dialog</button>
    <IssueInvoiceDialog open={open} onClose={() => setOpen(false)} onIssued={() => undefined} />
  </QueryClientProvider>;
}
