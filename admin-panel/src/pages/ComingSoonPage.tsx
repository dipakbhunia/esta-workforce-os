import { Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { Construction } from 'lucide-react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';

const pageTitles: Record<string, { title: string; area: string; description: string }> = {
  '/employees/documents': { title: 'Employee Documents', area: 'Employees', description: 'Document tracking is reserved for the employee records expansion phase.' },
  '/employees/onboarding': { title: 'Onboarding', area: 'Employees', description: 'Onboarding workflows will be connected after employee lifecycle setup.' },
  '/employees/exit-management': { title: 'Exit Management', area: 'Employees', description: 'Exit workflows will be added when offboarding rules are introduced.' },
  '/employees/assets': { title: 'Assets', area: 'Employees', description: 'Asset assignment will be connected in a future HR operations phase.' },
  '/attendance/overtime-rules': { title: 'Overtime Rules', area: 'Attendance', description: 'Overtime rules are planned for a later attendance policy phase.' },
  '/attendance/holiday-calendar': { title: 'Holiday Calendar', area: 'Attendance', description: 'Holiday calendar management will be added after attendance foundation modules.' },
  '/leave/balance': { title: 'Leave Balance', area: 'Leave', description: 'Leave balance views will arrive with the leave expansion phase.' },
  '/monitoring/activity-timeline': { title: 'Activity Timeline', area: 'Monitoring', description: 'Activity timeline views will connect after monitoring data products mature.' },
  '/monitoring/screenshots': { title: 'Screenshots', area: 'Monitoring', description: 'Screenshot review is intentionally not implemented in this navigation phase.' },
  '/monitoring/apps-urls': { title: 'Apps & URLs', area: 'Monitoring', description: 'Application and URL views will connect after monitoring analytics are approved.' },
  '/monitoring/devices': { title: 'Devices', area: 'Monitoring', description: 'Device inventory will connect to the monitoring device foundation later.' },
  '/monitoring/idle-time': { title: 'Idle Time', area: 'Monitoring', description: 'Idle time reports will be added after policy and reporting workflows are finalized.' },
  '/monitoring/productivity': { title: 'Productivity', area: 'Monitoring', description: 'Productivity metrics are planned for a future analytics phase.' },
  '/monitoring/alerts': { title: 'Alerts', area: 'Monitoring', description: 'Monitoring alerts will be introduced with alert policy management.' },
  '/reports/attendance': { title: 'Attendance Reports', area: 'Reports', description: 'Attendance reporting will be connected after report APIs are introduced.' },
  '/reports/employees': { title: 'Employee Reports', area: 'Reports', description: 'Employee reporting will be connected after report APIs are introduced.' },
  '/reports/leave': { title: 'Leave Reports', area: 'Reports', description: 'Leave reporting will be connected after report APIs are introduced.' },
  '/reports/monitoring': { title: 'Monitoring Reports', area: 'Reports', description: 'Monitoring reporting will be connected after report APIs are introduced.' },
  '/settings/company-profile': { title: 'Company Profile', area: 'Settings', description: 'Company profile settings will be connected after settings APIs are introduced.' },
  '/settings/attendance': { title: 'Attendance Settings', area: 'Settings', description: 'Attendance settings will connect to policy management in a later phase.' },
  '/settings/desktop-agent': { title: 'Desktop Agent Settings', area: 'Settings', description: 'Desktop agent configuration will be connected after agent policy APIs are introduced.' },
  '/settings/notifications': { title: 'Notification Settings', area: 'Settings', description: 'Notification preferences will be added after notification infrastructure exists.' },
  '/settings/general': { title: 'General Settings', area: 'Settings', description: 'General workspace settings will be added in a later administration phase.' },
};

export default function ComingSoonPage() {
  const location = useLocation();
  const config = pageTitles[location.pathname] ?? {
    title: 'Coming Soon',
    area: 'Admin',
    description: 'This workspace is reserved for a future module.',
  };

  return (
    <Stack gap={3}>
      <PageHeader title={config.title} description={config.description} breadcrumbs={['Admin', config.area, config.title]} />
      <Card>
        <CardContent>
          <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 320, textAlign: 'center' }} gap={2}>
            <Construction size={44} color="#2563EB" />
            <Typography variant="h2">Coming Soon</Typography>
            <Typography color="text.secondary" sx={{ maxWidth: 560 }}>
              This page is part of the production navigation foundation, but no CRUD, reports, or API integration has been added yet.
            </Typography>
            <Button component={RouterLink} to="/" variant="contained">Back to dashboard</Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
