import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute';

let authState = { authenticated: false, loading: false };

vi.mock('../hooks/useAuth', () => ({ useAuth: () => authState }));

describe('ProtectedRoute', () => {
  it('does not mount protected content while auth hydration is unresolved', () => {
    authState = { authenticated: false, loading: true };
    renderProtected('/tenant');
    expect(screen.queryByTestId('protected-child')).not.toBeInTheDocument();
  });

  it('preserves unknown authenticated paths as Not Found', () => {
    authState = { authenticated: true, loading: false };
    render(
      <MemoryRouter initialEntries={['/unknown-path']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="*" element={<div>Page not found</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Page not found')).toBeInTheDocument();
  });
});

function renderProtected(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path={path} element={<div data-testid="protected-child">Protected</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}
