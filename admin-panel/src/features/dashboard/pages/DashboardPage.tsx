import { Box, Card, CardContent, Grid, List, ListItem, ListItemText, Stack, Typography } from '@mui/material';
import { Activity, CalendarClock, Clock3, Coffee, TimerReset, TrendingUp, UserCheck, Users } from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { liveColumns, liveRows } from '@/utils/dummy-data';
import { MiniChart } from '../components/MiniChart';

const stats = [
  ['Employees', '248', '+12 this month', Users, '#2563EB'],
  ['Working', '137', 'Live now', UserCheck, '#16A34A'],
  ['On Break', '18', 'Across 4 branches', Coffee, '#F59E0B'],
  ['Offline', '42', 'Expected today', Activity, '#DC2626'],
  ['Late Today', '9', '3.6% of workforce', CalendarClock, '#F59E0B'],
  ['Leave Today', '14', 'Approved leave', TimerReset, '#2563EB'],
  ['Attendance %', '94.2%', '+2.1% vs last week', TrendingUp, '#16A34A'],
  ['Avg Working Hours', '7h 42m', 'Last 7 days', Clock3, '#2563EB'],
] as const;

export default function DashboardPage() {
  return (
    <Stack gap={3}>
      <PageHeader title="Workforce Control Center" description="A calm, real-time command center for HRMS, attendance, leave, and employee monitoring operations." breadcrumbs={['Admin', 'Dashboard']} />
      <Grid container spacing={2}>
        {stats.map(([label, value, helper, icon, tone]) => (
          <Grid key={label} size={{ xs: 12, sm: 6, lg: 3 }}><StatCard label={label} value={value} helper={helper} icon={icon} tone={tone} /></Grid>
        ))}
      </Grid>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card><CardContent><Typography variant="h4" sx={{ mb: 2 }}>Attendance Trend</Typography><MiniChart /></CardContent></Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Card><CardContent><Typography variant="h4" sx={{ mb: 2 }}>Employee Status</Typography><MiniChart variant="pie" /></CardContent></Card>
        </Grid>
      </Grid>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}><DataTable title="Live Employees" rows={liveRows} columns={liveColumns} /></Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Card sx={{ height: '100%' }}><CardContent>
            <Typography variant="h4">Today's Events</Typography>
            <List>
              {['Payroll cutoff at 5 PM', '3 onboarding sessions', 'Branch policy review', 'Quarterly engagement pulse'].map((item) => (
                <ListItem key={item} disableGutters><ListItemText primary={item} secondary="Dummy event" /></ListItem>
              ))}
            </List>
          </CardContent></Card>
        </Grid>
      </Grid>
      <Card><CardContent><Typography variant="h4" sx={{ mb: 1 }}>Recent Activity Timeline</Typography><Box sx={{ color: 'text.secondary' }}>10:42 AM - Neha Sharma started Lunch Break. 10:18 AM - Aarav Mehta punched in from Windows device.</Box></CardContent></Card>
    </Stack>
  );
}
