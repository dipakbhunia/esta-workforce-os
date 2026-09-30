import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformUser } from '../platform-access.types';
const captured = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));
vi.mock('@/components/data-table', () => ({ DataTable: (props: Record<string, unknown>) => { captured.props = props; return <div data-testid="desktop-grid">Desktop grid</div>; } }));
import { PlatformUserList } from './PlatformUserList';

const user: PlatformUser = { id: 'user-1', companyId: null, email: 'long.platform.user@example.invalid', firstName: 'Platform', lastName: 'Administrator', status: 'ACTIVE', lastLoginAt: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deletedAt: null, roles: [{ assignedAt: '', role: { id: 'role-1', companyId: null, key: 'super_admin', name: 'Super Admin', systemName: 'SUPER_ADMIN', description: null } }, { assignedAt: '', role: { id: 'role-2', companyId: null, key: 'auditor', name: 'Auditor', systemName: null, description: null } }] };
describe('PlatformUserList', () => {
  beforeEach(() => { captured.props = null; });
  it('provides desktop authority data and a complete mobile card without password actions', () => { renderList([user]); expect(screen.getByTestId('platform-users-desktop')).toContainElement(screen.getByTestId('desktop-grid')); const mobile = screen.getByTestId('platform-users-mobile'); expect(mobile).toHaveTextContent('Platform Administrator'); expect(mobile).toHaveTextContent('long.platform.user@example.invalid'); expect(mobile).toHaveTextContent('Super Admin'); expect(mobile).toHaveTextContent('Auditor'); expect(mobile).toHaveTextContent('Never'); expect(mobile).toHaveTextContent('Manage User'); expect(screen.queryByText(/password reset/i)).not.toBeInTheDocument(); expect(captured.props?.rows).toEqual([user]); });
  it('disables sorting and column menus for synthetic and action columns', () => { renderList([user]); const columns = captured.props?.columns as Array<{ field: string; sortable?: boolean; disableColumnMenu?: boolean }>; for (const field of ['user', 'roles', 'actions']) expect(columns.find((column) => column.field === field)).toMatchObject({ sortable: false, disableColumnMenu: true }); });
  it.each([[false, 'No platform users available.'], [true, 'No users match the applied filters.']])('renders the correct empty state when filtered=%s', (filtered, title) => { renderList([], filtered); const gridProps = captured.props?.gridProps as { slots: { noRowsOverlay: () => React.ReactNode } }; render(<>{gridProps.slots.noRowsOverlay()}</>); expect(screen.getAllByText(title).length).toBeGreaterThan(0); });
});
function renderList(rows: PlatformUser[], filtered = false) { return render(<PlatformUserList rows={rows} total={rows.length} page={1} limit={20} loading={false} filtered={filtered} onManage={vi.fn()} onPaginationChange={vi.fn()} />); }
