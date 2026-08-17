import { Box, Drawer } from '@mui/material';
import { useLayoutEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar, SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_WIDTH } from './Sidebar';

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <ScrollToTop />
      <Box component="aside" sx={{ display: { xs: 'none', lg: 'block' }, position: 'fixed', inset: '0 auto 0 0', width: sidebarWidth, transition: 'width 180ms ease' }}>
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />
      </Box>
      <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} sx={{ display: { lg: 'none' } }}>
        <Sidebar collapsed={false} onToggle={() => setMobileOpen(false)} onNavigate={() => setMobileOpen(false)} />
      </Drawer>
      <Box
        sx={{
          ml: { xs: 0, lg: `${sidebarWidth}px` },
          width: { xs: '100%', lg: `calc(100% - ${sidebarWidth}px)` },
          minWidth: 0,
          transition: 'margin-left 180ms ease, width 180ms ease',
        }}
      >
        <Header onOpenMobileSidebar={() => setMobileOpen(true)} />
        <Box component="main" sx={{ p: { xs: 2, md: 3 }, width: '100%', maxWidth: 1680, minWidth: 0, mx: 'auto' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);

  return null;
}
