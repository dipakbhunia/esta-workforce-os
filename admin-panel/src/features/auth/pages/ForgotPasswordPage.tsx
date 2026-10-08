import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, Card, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { useState, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { requestPasswordReset } from '../services/auth-api';

const schema = z.object({ email: z.string().email('Enter a valid email address.') });

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false); const [requestError, setRequestError] = useState(false);
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: '' } });
  const submit = handleSubmit(async ({ email }) => { setRequestError(false); try { await requestPasswordReset(email); setSent(true); } catch { setRequestError(true); } });
  return <PublicIdentityCard title="Forgot password" description="Request a secure one-time password reset link.">
    {sent ? <Alert severity="success">If an eligible account exists, a password reset email has been queued.</Alert> : <Stack component="form" spacing={2} onSubmit={submit}>
      {requestError ? <Alert severity="error">The request could not be completed. Please try again.</Alert> : null}
      <Controller control={control} name="email" render={({ field }) => <TextField {...field} autoFocus label="Email" type="email" autoComplete="email" error={Boolean(errors.email)} helperText={errors.email?.message} />} />
      <Button type="submit" variant="contained" disabled={isSubmitting} startIcon={isSubmitting ? <CircularProgress size={18} color="inherit" /> : undefined}>{isSubmitting ? 'Requesting…' : 'Request reset link'}</Button>
    </Stack>}
    <Button component={Link} to="/login">Back to sign in</Button>
  </PublicIdentityCard>;
}

export function PublicIdentityCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'background.default', px: 2 }}><Card sx={{ width: '100%', maxWidth: 480, p: { xs: 3, md: 4 } }}><Stack spacing={3}><Stack spacing={1} textAlign="center"><Typography variant="h2">{title}</Typography><Typography color="text.secondary">{description}</Typography></Stack>{children}</Stack></Card></Box>;
}
