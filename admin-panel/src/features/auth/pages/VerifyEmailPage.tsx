import { Alert, Button, CircularProgress, Stack } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { verifyEmail } from '../services/auth-api';
import { PublicIdentityCard } from './ForgotPasswordPage';

type State = 'missing' | 'pending' | 'success' | 'invalid';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const [token] = useState(() => params.get('token') ?? '');
  const [state, setState] = useState<State>(token ? 'pending' : 'missing');
  const started = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.search) navigate(location.pathname, { replace: true });
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    void verifyEmail(token).then(() => setState('success')).catch(() => setState('invalid'));
  }, [token]);

  return <PublicIdentityCard title="Verify email" description="Confirm ownership of your current platform administrator email address.">
    <Stack spacing={2} aria-live="polite">
      {state === 'pending' ? <Stack direction="row" alignItems="center" gap={1}><CircularProgress size={22} /><span>Verifying your email…</span></Stack> : null}
      {state === 'success' ? <Alert severity="success">Your current email address has been verified.</Alert> : null}
      {state === 'missing' || state === 'invalid' ? <Alert severity="error">This verification link is invalid, expired, or has already been used. Request a new link from Account security.</Alert> : null}
      <Button component={Link} to={state === 'success' ? '/account/security' : '/login'}>{state === 'success' ? 'Return to account security' : 'Back to sign in'}</Button>
    </Stack>
  </PublicIdentityCard>;
}
