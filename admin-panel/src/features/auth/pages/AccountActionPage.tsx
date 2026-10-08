import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, CircularProgress, IconButton, InputAdornment, Stack, TextField } from '@mui/material';
import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { activateAccount, completePasswordReset } from '../services/auth-api';
import { authErrorMessage } from '../utils/errors';
import { PublicIdentityCard } from './ForgotPasswordPage';

const schema = z.object({ password: z.string().min(8, 'Use at least 8 characters.').max(128), passwordConfirmation: z.string() }).refine((value) => value.password === value.passwordConfirmation, { path: ['passwordConfirmation'], message: 'Passwords do not match.' });

export default function AccountActionPage({ mode }: { mode: 'activate' | 'reset' }) {
  const [params] = useSearchParams(); const [token] = useState(() => params.get('token') ?? '');
  const navigate = useNavigate(); const location = useLocation();
  useEffect(() => { if (token && location.search) navigate(location.pathname, { replace: true }); }, [location.pathname, location.search, navigate, token]);
  const [show, setShow] = useState(false); const [complete, setComplete] = useState(false); const [requestError, setRequestError] = useState<string | null>(null);
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { password: '', passwordConfirmation: '' } });
  const submit = handleSubmit(async (values) => { setRequestError(null); try { const action = mode === 'activate' ? activateAccount : completePasswordReset; await action({ token, ...values }); setComplete(true); } catch (error) { setRequestError(authErrorMessage(error)); } });
  const title = mode === 'activate' ? 'Activate account' : 'Reset password';
  return <PublicIdentityCard title={title} description={mode === 'activate' ? 'Create your password to activate your invited account.' : 'Choose a new password for your account.'}>
    {!token ? <Alert severity="error">This link is invalid. Request a new invitation or password reset.</Alert> : complete ? <Alert severity="success">Your password has been set. You can now sign in.</Alert> : <Stack component="form" spacing={2} onSubmit={submit}>
      {requestError ? <Alert severity="error">{requestError}</Alert> : null}
      <Controller control={control} name="password" render={({ field }) => <TextField {...field} label="New password" type={show ? 'text' : 'password'} autoComplete="new-password" error={Boolean(errors.password)} helperText={errors.password?.message} InputProps={{ endAdornment: <InputAdornment position="end"><IconButton aria-label={show ? 'Hide passwords' : 'Show passwords'} onClick={() => setShow((value) => !value)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</IconButton></InputAdornment> }} />} />
      <Controller control={control} name="passwordConfirmation" render={({ field }) => <TextField {...field} label="Confirm password" type={show ? 'text' : 'password'} autoComplete="new-password" error={Boolean(errors.passwordConfirmation)} helperText={errors.passwordConfirmation?.message} />} />
      <Button type="submit" variant="contained" disabled={isSubmitting} startIcon={isSubmitting ? <CircularProgress size={18} color="inherit" /> : undefined}>{isSubmitting ? 'Saving…' : title}</Button>
    </Stack>}
    <Button component={Link} to="/login">Back to sign in</Button>
  </PublicIdentityCard>;
}
