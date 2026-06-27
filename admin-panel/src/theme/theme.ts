import { createTheme } from '@mui/material/styles';
import { appColors } from './palette';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: appColors.primary },
    success: { main: appColors.success },
    warning: { main: appColors.warning },
    error: { main: appColors.danger },
    background: {
      default: appColors.background,
      paper: appColors.card,
    },
    text: {
      primary: appColors.text,
      secondary: appColors.secondaryText,
    },
    divider: appColors.border,
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: { fontSize: 34, fontWeight: 800, letterSpacing: '-0.04em' },
    h2: { fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em' },
    h3: { fontSize: 22, fontWeight: 750, letterSpacing: '-0.02em' },
    h4: { fontSize: 18, fontWeight: 750 },
    button: { textTransform: 'none', fontWeight: 700 },
  },
  shadows: [
    'none',
    '0 1px 2px rgba(17,24,39,0.05)',
    '0 8px 24px rgba(17,24,39,0.06)',
    '0 12px 32px rgba(17,24,39,0.08)',
    ...Array(21).fill('0 16px 40px rgba(17,24,39,0.08)'),
  ] as unknown as import('@mui/material/styles').Shadows,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        '*': { boxSizing: 'border-box' },
        body: { backgroundColor: appColors.background },
        '::selection': { backgroundColor: 'rgba(37,99,235,0.16)' },
        ':focus-visible': { outline: `2px solid ${appColors.primary}`, outlineOffset: 2 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none', borderColor: appColors.border },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 10 } },
    },
    MuiCard: {
      styleOverrides: {
        root: { border: `1px solid ${appColors.border}`, boxShadow: '0 8px 24px rgba(17,24,39,0.04)' },
      },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 999, fontWeight: 700 } },
    },
  },
});
