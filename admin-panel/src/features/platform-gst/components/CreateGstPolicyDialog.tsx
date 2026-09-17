import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useRef, useState, type FormEvent } from 'react';
import { createGstPolicy, platformGstKeys } from '../platform-gst-api';
import type { CreateGstPolicyRequest, GstPolicyStatus, GstTaxTreatment } from '../platform-gst.types';
import { localToIso } from '../platform-gst-url';

interface Props { open: boolean; onClose: () => void; onCreated?: () => void }
interface PolicyForm { policyCode: string; status: Exclude<GstPolicyStatus, 'RETIRED'>; treatment: GstTaxTreatment; total: string; cgst: string; sgst: string; igst: string; classification: string; from: string; until: string }
const initial: PolicyForm = { policyCode: '', status: 'DRAFT', treatment: 'NON_TAXABLE', total: '0', cgst: '0', sgst: '0', igst: '0', classification: '', from: '', until: '' };
export function CreateGstPolicyDialog({ open, onClose, onCreated }: Props) {
  const client = useQueryClient(); const [form, setForm] = useState(initial); const [validation, setValidation] = useState(''); const submitting = useRef(false);
  const mutation = useMutation({ mutationFn: createGstPolicy, onSuccess: async () => { await client.invalidateQueries({ queryKey: [...platformGstKeys.all, 'policies'] }); reset(); onClose(); onCreated?.(); }, onSettled: () => { submitting.current = false; } });
  const set = (key: keyof typeof form, value: string) => { setForm(current => ({ ...current, [key]: value })); setValidation(''); };
  const reset = () => { setForm(initial); setValidation(''); mutation.reset(); };
  const close = () => { if (submitting.current) return; reset(); onClose(); };
  const submit = (event: FormEvent) => {
    event.preventDefault(); if (submitting.current) return;
    const rates = [form.total, form.cgst, form.sgst, form.igst];
    if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(form.policyCode.trim())) return setValidation('Policy code must use uppercase letters, numbers, and underscores.');
    if (rates.some(value => !/^\d+$/.test(value) || Number(value) > 10000)) return setValidation('Rates must be whole basis points from 0 to 10000.');
    const [total, cgst, sgst, igst] = rates.map(Number);
    if (form.treatment === 'TAXABLE' && (total !== cgst + sgst || total !== igst || !form.classification.trim())) return setValidation('Taxable policy rates must reconcile and require a service classification.');
    if (form.treatment === 'NON_TAXABLE' && rates.some(value => value !== '0')) return setValidation('Non-taxable policy rates must all be zero.');
    const effectiveFrom = localToIso(form.from); const effectiveUntil = localToIso(form.until);
    if (!effectiveFrom || (form.until && !effectiveUntil) || (effectiveUntil && effectiveFrom >= effectiveUntil)) return setValidation('Enter a valid effective interval; the optional end must be later than the start.');
    const request: CreateGstPolicyRequest = { policyCode: form.policyCode.trim(), status: form.status, currency: 'INR', treatment: form.treatment, totalRateBasisPoints: total, cgstRateBasisPoints: cgst, sgstRateBasisPoints: sgst, igstRateBasisPoints: igst, effectiveFrom, ...(effectiveUntil && { effectiveUntil }), ...(form.classification.trim() && { serviceClassification: form.classification.trim() }) };
    submitting.current = true; mutation.mutate(request);
  };
  return <Dialog open={open} onClose={close} fullWidth maxWidth="md" aria-labelledby="create-gst-policy-title"><form onSubmit={submit} noValidate><DialogTitle id="create-gst-policy-title">Create GST Policy Version</DialogTitle><DialogContent><Stack gap={2} pt={1}>
    <Alert severity="info">This appends an immutable version. It does not enable GST in Billing Settings.</Alert>
    {form.status === 'ACTIVE' ? <Alert severity="warning">ACTIVE policy authority applies for its effective window. Confirm the dates and rates before creating it.</Alert> : null}
    {validation ? <Alert severity="error">{validation}</Alert> : null}{mutation.isError ? <Alert severity="error">{policyError(mutation.error)}</Alert> : null}
    <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}><TextField required fullWidth label="Policy Code" value={form.policyCode} onChange={e => set('policyCode', e.target.value.toUpperCase())} disabled={mutation.isPending} inputProps={{ maxLength: 64 }} /><FormControl fullWidth><InputLabel id="gst-policy-status-label">Status</InputLabel><Select id="gst-policy-status" labelId="gst-policy-status-label" label="Status" value={form.status} onChange={e => set('status', e.target.value)} disabled={mutation.isPending}><MenuItem value="DRAFT">Draft</MenuItem><MenuItem value="ACTIVE">Active</MenuItem></Select></FormControl><TextField label="Currency" value="INR" disabled fullWidth /></Stack>
    <FormControl fullWidth><InputLabel id="gst-policy-treatment-label">Tax Treatment</InputLabel><Select id="gst-policy-treatment" labelId="gst-policy-treatment-label" label="Tax Treatment" value={form.treatment} onChange={e => set('treatment', e.target.value)} disabled={mutation.isPending}><MenuItem value="NON_TAXABLE">Non-taxable</MenuItem><MenuItem value="TAXABLE">Taxable</MenuItem></Select></FormControl>
    <Typography variant="body2" color="text.secondary">Enter whole basis points; 100 basis points equals 1.00%. No rate is assumed.</Typography>
    <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}>{(['total','cgst','sgst','igst'] as const).map(key => <TextField key={key} required fullWidth label={`${key.toUpperCase()} rate (bps)`} value={form[key]} onChange={e => set(key, e.target.value)} disabled={mutation.isPending} inputProps={{ inputMode: 'numeric' }} />)}</Stack>
    <TextField label="Service Classification" value={form.classification} onChange={e => set('classification', e.target.value)} required={form.treatment === 'TAXABLE'} disabled={mutation.isPending} inputProps={{ maxLength: 64 }} />
    <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}><TextField required fullWidth type="datetime-local" label="Effective From" value={form.from} onChange={e => set('from', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} disabled={mutation.isPending} /><TextField fullWidth type="datetime-local" label="Effective Until (optional)" value={form.until} onChange={e => set('until', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} disabled={mutation.isPending} /></Stack>
    {mutation.isPending ? <Typography role="status">Creating policy version…</Typography> : null}
  </Stack></DialogContent><DialogActions><Button onClick={close} disabled={mutation.isPending}>Cancel</Button><Button type="submit" variant="contained" disabled={mutation.isPending} startIcon={mutation.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>Create Version</Button></DialogActions></form></Dialog>;
}
export function policyError(error: unknown) { if (axios.isAxiosError(error) && error.response?.status === 409) return 'This policy version conflicts with existing policy authority.'; if (axios.isAxiosError(error) && error.response?.status === 422) return 'The policy values do not reconcile. Review the interval, treatment, rates, and classification.'; return 'The policy version could not be created. Check connectivity and try again.'; }
