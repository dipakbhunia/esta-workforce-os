import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ capability: vi.fn(), list: vi.fn() }));
vi.mock('../platform-communication-api', async original => ({
  ...await original<typeof import('../platform-communication-api')>(),
  getEmailCapability: mocks.capability,
  listEmailDeliveries: mocks.list,
}));
vi.mock('../components/PlatformEmailDeliveryList', () => ({
  PlatformEmailDeliveryList: ({ rows, loading, onPaginationChange }: { rows: unknown[]; loading: boolean; onPaginationChange: (page: number, limit: number) => void }) => <div>
    {loading ? 'Loading list' : `Rows ${rows.length}`}
    <button onClick={() => onPaginationChange(2, 20)}>Next mock</button>
    <button onClick={() => onPaginationChange(4, 50)}>Size mock</button>
  </div>,
}));
import EmailDeliveryLogsPage from './EmailDeliveryLogsPage';

const empty = { data: { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } } };
const populated = { data: { data: [{ deliveryId: 'one' }], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } } };
function History() {
  const navigate = useNavigate();
  const location = useLocation();
  return <><button onClick={() => navigate(-1)}>Back mock</button><button onClick={() => navigate(1)}>Forward mock</button><div data-testid="location">{location.search}</div></>;
}
function view(path = '/?page=1&limit=20') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><History /><EmailDeliveryLogsPage /></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  mocks.capability.mockReset().mockResolvedValue({ data: { enabled: true, configured: true, fromEmailConfigured: true } });
  mocks.list.mockReset().mockResolvedValue(empty);
});

describe('EmailDeliveryLogsPage', () => {
  it('loads capability and normalized server query independently', async () => {
    view();
    expect(await screen.findByText(/required configuration is present/)).toBeInTheDocument();
    expect(await screen.findByText('Rows 0')).toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it.each([
    [{ enabled: false, configured: true, fromEmailConfigured: true }, /Email delivery is disabled/],
    [{ enabled: true, configured: false, fromEmailConfigured: true }, /SMTP configuration is incomplete/],
    [{ enabled: true, configured: true, fromEmailConfigured: false }, /Sender email configuration is incomplete/],
  ])('shows bounded capability variant %# while preserving the list', async (capability, message) => {
    mocks.capability.mockResolvedValue({ data: capability });
    view();
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByText('Rows 0')).toBeInTheDocument();
    expect(screen.queryByText(/provider healthy/i)).not.toBeInTheDocument();
  });

  it('keeps the list usable when capability fails', async () => {
    mocks.capability.mockRejectedValue(new Error('secret'));
    view();
    expect(await screen.findByText(/Delivery logs remain available/)).toBeInTheDocument();
    expect(screen.getByText('Rows 0')).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });
});

describe('EmailDeliveryLogsPage URL behavior', () => {
  it('does not apply a draft until Apply, then normalizes and resets page', async () => {
    view('/?page=3&limit=50&keep=yes');
    await screen.findByText('Rows 0');
    const before = mocks.list.mock.calls.length;
    fireEvent.change(screen.getByLabelText('Recipient'), { target: { value: 'OPS@EXAMPLE.COM' } });
    expect(mocks.list).toHaveBeenCalledTimes(before);
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith({ page: 1, limit: 50, recipient: 'ops@example.com' }));
    expect(screen.getByTestId('location')).toHaveTextContent('keep=yes');
  });

  it('resets filters and validation while preserving limit and unrelated params', async () => {
    view('/?page=3&limit=50&recipient=ops%40example.com&keep=yes');
    await screen.findByText('Rows 0');
    fireEvent.change(screen.getByLabelText('Recipient'), { target: { value: 'invalid' } });
    expect(screen.getByText(/valid email address/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith({ page: 1, limit: 50 }));
    expect(screen.getByLabelText('Recipient')).toHaveValue('');
    expect(screen.queryByText(/valid email address/)).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('keep=yes');
  });

  it('resets invalid draft-only input when no filters are applied', async () => {
    view('/?page=4&limit=100&keep=yes');
    await screen.findByText('Rows 0');
    fireEvent.change(screen.getByLabelText('Company ID'), { target: { value: 'invalid-company' } });
    fireEvent.change(screen.getByLabelText('Recipient'), { target: { value: 'invalid-email' } });
    expect(screen.getByText('Enter a valid UUID.')).toBeInTheDocument();
    expect(screen.getByText(/Enter a valid email address/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByLabelText('Company ID')).toHaveValue('');
    expect(screen.getByLabelText('Recipient')).toHaveValue('');
    expect(screen.queryByText('Enter a valid UUID.')).not.toBeInTheDocument();
    expect(screen.queryByText(/Enter a valid email address/)).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith({ page: 1, limit: 100 }));
    expect(screen.getByTestId('location')).toHaveTextContent('keep=yes');
  });

  it('maps page and page-size changes to server queries', async () => {
    view();
    await screen.findByText('Rows 0');
    fireEvent.click(screen.getByText('Next mock'));
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith({ page: 2, limit: 20 }));
    fireEvent.click(screen.getByText('Size mock'));
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith({ page: 1, limit: 50 }));
  });

  it('rehydrates applied filters, draft, page and limit across Back and Forward', async () => {
    view('/?page=2&limit=50&recipient=first%40example.com');
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith({ page: 2, limit: 50, recipient: 'first@example.com' }));
    fireEvent.change(screen.getByLabelText('Recipient'), { target: { value: 'second@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith({ page: 1, limit: 50, recipient: 'second@example.com' }));
    fireEvent.click(screen.getByText('Back mock'));
    await waitFor(() => expect(screen.getByLabelText('Recipient')).toHaveValue('first@example.com'));
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 2, limit: 50, recipient: 'first@example.com' });
    fireEvent.click(screen.getByText('Forward mock'));
    await waitFor(() => expect(screen.getByLabelText('Recipient')).toHaveValue('second@example.com'));
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 1, limit: 50, recipient: 'second@example.com' });
  });
});

describe('EmailDeliveryLogsPage async states', () => {
  it('shows initial loading and then populated success', async () => {
    let resolve!: (value: typeof populated) => void;
    mocks.list.mockReturnValue(new Promise(value => { resolve = value; }));
    view();
    expect(screen.getByText('Loading email delivery logs')).toBeInTheDocument();
    expect(screen.getByText('Loading list')).toBeInTheDocument();
    resolve(populated);
    expect(await screen.findByText('Rows 1')).toBeInTheDocument();
  });

  it('shows sanitized initial failure and retries successfully', async () => {
    mocks.list.mockRejectedValueOnce(new Error('raw database secret')).mockResolvedValueOnce(empty);
    view();
    expect(await screen.findByText(/Email deliveries could not be loaded/)).toBeInTheDocument();
    expect(screen.queryByText('raw database secret')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Rows 0')).toBeInTheDocument();
  });

  it('retains populated rows during refresh failure and recovers on Retry', async () => {
    mocks.list.mockResolvedValueOnce(populated).mockRejectedValueOnce(new Error('private')).mockResolvedValueOnce(populated);
    view();
    expect(await screen.findByText('Rows 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText(/Showing the most recent available data/)).toBeInTheDocument();
    expect(screen.getByText('Rows 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByText(/Showing the most recent available data/)).not.toBeInTheDocument());
    expect(screen.getByText('Rows 1')).toBeInTheDocument();
  });

  it('retains populated rows and shows progress while refresh remains unresolved', async () => {
    let resolveRefresh!: (value: typeof populated) => void;
    mocks.list
      .mockResolvedValueOnce(populated)
      .mockImplementationOnce(() => new Promise(value => { resolveRefresh = value; }));
    view();
    expect(await screen.findByText('Rows 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByLabelText('Updating email delivery logs')).toBeInTheDocument();
    expect(screen.getByText('Rows 1')).toBeInTheDocument();
    expect(screen.queryByText('Loading list')).not.toBeInTheDocument();
    expect(screen.queryByText(/Email deliveries could not be loaded/)).not.toBeInTheDocument();
    resolveRefresh(populated);
    await waitFor(() => expect(screen.queryByLabelText('Updating email delivery logs')).not.toBeInTheDocument());
    expect(screen.getByText('Rows 1')).toBeInTheDocument();
  });
});
