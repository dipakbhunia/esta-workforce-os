import { Box, Button, Divider, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { EnterpriseFilterCard } from '@/components/enterprise/filters';
import { validCompanyId, validDateRange, validRecipient } from '../platform-communication-url';
import { EMAIL_DELIVERY_STATUSES, EMAIL_EVENT_TYPES } from '../platform-communication.types';

export interface EmailDeliveryFilterDraft {
  status: string;
  companyId: string;
  recipient: string;
  eventType: string;
  from: string;
  to: string;
}

interface Props {
  draft: EmailDeliveryFilterDraft;
  fetching: boolean;
  filtered: boolean;
  summary: string;
  onChange: (draft: EmailDeliveryFilterDraft) => void;
  onApply: () => void;
  onReset: () => void;
  onRefresh: () => void;
}

export function PlatformEmailDeliveryFilters({ draft, fetching, filtered, summary, onChange, onApply, onReset, onRefresh }: Props) {
  const datesValid = validDateRange(draft.from, draft.to);
  const companyValid = validCompanyId(draft.companyId);
  const recipientValid = validRecipient(draft.recipient);
  const valid = datesValid && companyValid && recipientValid;
  const hasDraft = Object.values(draft).some(value => value.trim() !== '');
  const set = (key: keyof EmailDeliveryFilterDraft, value: string) => onChange({ ...draft, [key]: value });
  const field = { minWidth: 0 };
  return (
    <EnterpriseFilterCard
      title="Email Delivery Filters"
      description="Draft changes are applied together to the server-backed delivery register."
      loading={fetching}
      search={
        <Stack gap={1.25}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2,minmax(0,1fr))',
                lg: 'repeat(3,minmax(0,1fr))',
              },
              gap: 1.5,
            }}
          >
            <FormControl sx={field}>
              <InputLabel id="delivery-status-label">Status</InputLabel>
              <Select
                labelId="delivery-status-label"
                id="delivery-status"
                label="Status"
                value={draft.status}
                onChange={event => set('status', event.target.value)}
              >
                <MenuItem value="">All statuses</MenuItem>
                {EMAIL_DELIVERY_STATUSES.map(value => (
                  <MenuItem key={value} value={value}>
                    {value}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Company ID"
              value={draft.companyId}
              onChange={event => set('companyId', event.target.value)}
              error={!companyValid}
              helperText={!companyValid ? 'Enter a valid UUID.' : 'Optional exact company identifier'}
            />
            <TextField
              label="Recipient"
              type="email"
              value={draft.recipient}
              onChange={event => set('recipient', event.target.value)}
              error={!recipientValid}
              helperText={
                !recipientValid
                  ? 'Enter a valid email address (maximum 254 characters).'
                  : 'Exact email address'
              }
            />
            <FormControl sx={field}>
              <InputLabel id="delivery-event-label">Event Type</InputLabel>
              <Select
                labelId="delivery-event-label"
                id="delivery-event"
                label="Event Type"
                value={draft.eventType}
                onChange={event => set('eventType', event.target.value)}
              >
                <MenuItem value="">All event types</MenuItem>
                {EMAIL_EVENT_TYPES.map(value => (
                  <MenuItem key={value} value={value}>
                    {value.replaceAll('_', ' ')}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Created From"
              type="datetime-local"
              value={draft.from}
              onChange={event => set('from', event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              error={!datesValid}
            />
            <TextField
              label="Created Before"
              type="datetime-local"
              value={draft.to}
              onChange={event => set('to', event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              error={!datesValid}
              helperText={
                !datesValid
                  ? 'Use valid times with From earlier than Before.'
                  : 'Exclusive upper bound'
              }
            />
          </Box>
          <Divider />
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', sm: 'center' }}
            gap={1}
          >
            <Typography variant="body2" color="text.secondary">{summary}</Typography>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              gap={1}
              flexWrap="wrap"
              sx={{ '& .MuiButton-root': { minHeight: 40, whiteSpace: 'nowrap' } }}
            >
              <Button startIcon={<RotateCcw size={16} />} onClick={onReset} disabled={!filtered && !hasDraft}>Reset</Button>
              <Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={onRefresh} disabled={fetching}>Refresh</Button>
              <Button variant="contained" onClick={onApply} disabled={!valid}>Apply</Button>
            </Stack>
          </Stack>
        </Stack>
      }
    />
  );
}
