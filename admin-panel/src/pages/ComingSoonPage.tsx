import { Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import { Construction, type LucideIcon } from 'lucide-react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';

interface ComingSoonPageProps {
  moduleName?: string;
  title?: string;
  description?: string;
  plannedPhase?: string;
  icon?: LucideIcon;
}

const pageTitles: Record<string, ComingSoonPageProps> = {
  '/organization/teams': { moduleName: 'Organization', title: 'Teams', description: 'Team grouping will be introduced after department and reporting-line workflows are finalized.', plannedPhase: 'Organization Expansion' },
  '/organization/work-locations': { moduleName: 'Organization', title: 'Work Locations', description: 'Office and field work locations will be connected in a future organization phase.', plannedPhase: 'Organization Expansion' },
  '/employees/documents': { moduleName: 'Employees', title: 'Employee Documents', description: 'Document tracking is reserved for the employee records expansion phase.', plannedPhase: 'Employee Lifecycle' },
  '/employees/onboarding': { moduleName: 'Employees', title: 'Onboarding', description: 'Onboarding workflows will be connected after employee lifecycle setup.', plannedPhase: 'Employee Lifecycle' },
  '/employees/exit-management': { moduleName: 'Employees', title: 'Exit Management', description: 'Exit workflows will be added when offboarding rules are introduced.', plannedPhase: 'Employee Lifecycle' },
  '/employees/assets': { moduleName: 'Employees', title: 'Assets', description: 'Asset assignment will be connected in a future HR operations phase.', plannedPhase: 'Employee Lifecycle' },
  '/attendance/my-attendance': { moduleName: 'Attendance', title: 'My Attendance', description: 'Self-service attendance views will be connected in a later attendance phase.', plannedPhase: 'Attendance Self Service' },
  '/attendance/missed-punch-out-review': { moduleName: 'Attendance', title: 'Missed Punch-Out Review', description: 'Review queues for missed punch-outs will be added after the review workflow is finalized.', plannedPhase: 'Attendance Review' },
  '/attendance/auto-closed-review': { moduleName: 'Attendance', title: 'Auto Closed Review', description: 'Auto-closed attendance review will be connected after approval workflows are finalized.', plannedPhase: 'Attendance Review' },
  '/attendance/overtime-rules': { moduleName: 'Attendance', title: 'Overtime Rules', description: 'Overtime rules are planned for a later attendance policy phase.', plannedPhase: 'Attendance Policy' },
  '/crm/leads': { moduleName: 'CRM', title: 'Leads', description: 'Lead tracking will be introduced when the CRM module begins.', plannedPhase: 'CRM' },
  '/crm/contacts': { moduleName: 'CRM', title: 'Contacts', description: 'CRM contacts will be introduced when the CRM module begins.', plannedPhase: 'CRM' },
  '/crm/companies': { moduleName: 'CRM', title: 'Companies', description: 'CRM company records will be introduced when the CRM module begins.', plannedPhase: 'CRM' },
  '/crm/sales-pipeline': { moduleName: 'CRM', title: 'Sales Pipeline', description: 'Pipeline tracking will be introduced when sales workflows are scoped.', plannedPhase: 'CRM' },
  '/crm/follow-up': { moduleName: 'CRM', title: 'Follow Up', description: 'Follow-up workflows will arrive with CRM activity management.', plannedPhase: 'CRM' },
  '/crm/quotations': { moduleName: 'CRM', title: 'Quotations', description: 'Quotation management will be added in a future CRM phase.', plannedPhase: 'CRM' },
  '/projects/projects': { moduleName: 'Projects & Tasks', title: 'Projects', description: 'Project workspaces will be introduced in the task management module.', plannedPhase: 'Task Management' },
  '/projects/tasks': { moduleName: 'Projects & Tasks', title: 'Tasks', description: 'Task management will be introduced after monitoring is frozen.', plannedPhase: 'Task Management' },
  '/projects/kanban': { moduleName: 'Projects & Tasks', title: 'Boards', description: 'Kanban planning will be part of the task management module.', plannedPhase: 'Task Management' },
  '/projects/calendar': { moduleName: 'Projects & Tasks', title: 'Project Calendar', description: 'Project calendar planning will be introduced with task management.', plannedPhase: 'Task Management' },
  '/hrms/payroll': { moduleName: 'HRMS', title: 'Payroll', description: 'Payroll is reserved for a later HRMS phase and is not implemented in this navigation cleanup.', plannedPhase: 'HRMS' },
  '/hrms/reimbursement': { moduleName: 'HRMS', title: 'Reimbursement', description: 'Reimbursement workflows will be added in a future HRMS phase.', plannedPhase: 'HRMS' },
  '/hrms/recruitment': { moduleName: 'HRMS', title: 'Recruitment', description: 'Recruitment workflows will be added in a future HRMS phase.', plannedPhase: 'HRMS' },
  '/erp/customers': { moduleName: 'ERP Lite', title: 'Customers', description: 'Customer records will be added when ERP Lite begins.', plannedPhase: 'ERP Lite' },
  '/erp/customer-groups': { moduleName: 'ERP Lite', title: 'Customer Groups', description: 'Customer grouping will be added when ERP Lite begins.', plannedPhase: 'ERP Lite' },
  '/erp/vendors': { moduleName: 'ERP Lite', title: 'Vendors', description: 'Vendor management will be added when ERP Lite begins.', plannedPhase: 'ERP Lite' },
  '/erp/purchase-orders': { moduleName: 'ERP Lite', title: 'Purchase Orders', description: 'Purchase order workflows will be added when ERP Lite begins.', plannedPhase: 'ERP Lite' },
  '/erp/inventory': { moduleName: 'ERP Lite', title: 'Inventory', description: 'Inventory management will be added when ERP Lite begins.', plannedPhase: 'ERP Lite' },
  '/erp/finance': { moduleName: 'ERP Lite', title: 'Finance', description: 'Finance views will be added when ERP Lite begins.', plannedPhase: 'ERP Lite' },
  '/erp/invoicing': { moduleName: 'ERP Lite', title: 'Invoicing', description: 'Invoicing will be added when ERP Lite begins.', plannedPhase: 'ERP Lite' },
  '/communication/whatsapp': { moduleName: 'Communication Hub', title: 'WhatsApp', description: 'WhatsApp workflows are reserved for a future communication phase.', plannedPhase: 'Communication Hub' },
  '/communication/email': { moduleName: 'Communication Hub', title: 'Email', description: 'Email workflows are reserved for a future communication phase.', plannedPhase: 'Communication Hub' },
  '/communication/call-tracking': { moduleName: 'Communication Hub', title: 'Call Tracking', description: 'Call tracking is reserved for a future communication phase.', plannedPhase: 'Communication Hub' },
  '/ai/productivity': { moduleName: 'AI Analytics', title: 'AI Productivity', description: 'AI productivity analysis is intentionally deferred.', plannedPhase: 'AI Analytics' },
  '/ai/hr-analytics': { moduleName: 'AI Analytics', title: 'AI HR Analytics', description: 'AI HR analytics are intentionally deferred.', plannedPhase: 'AI Analytics' },
  '/ai/sales-analytics': { moduleName: 'AI Analytics', title: 'AI Sales Analytics', description: 'AI sales analytics are intentionally deferred.', plannedPhase: 'AI Analytics' },
  '/ai/assistant': { moduleName: 'AI Analytics', title: 'AI Assistant', description: 'AI assistant workflows are intentionally deferred.', plannedPhase: 'AI Analytics' },
  '/reports/attendance': { moduleName: 'Reports', title: 'Attendance Reports', description: 'Attendance reporting will be connected after report APIs are introduced.', plannedPhase: 'Reports' },
  '/reports/employees': { moduleName: 'Reports', title: 'Employee Reports', description: 'Employee reporting will be connected after report APIs are introduced.', plannedPhase: 'Reports' },
  '/reports/leave': { moduleName: 'Reports', title: 'Leave Reports', description: 'Leave reporting will be connected after report APIs are introduced.', plannedPhase: 'Reports' },
  '/reports/monitoring': { moduleName: 'Reports', title: 'Monitoring Reports', description: 'Monitoring reporting will be connected after report APIs are introduced.', plannedPhase: 'Reports' },
  '/reports/productivity': { moduleName: 'Reports', title: 'Productivity Reports', description: 'Productivity reporting will be connected after report APIs are introduced.', plannedPhase: 'Reports' },
  '/reports/scheduling': { moduleName: 'Reports', title: 'Scheduling Reports', description: 'Analyze scheduling, roster, weekly-off, and holiday data.', plannedPhase: 'Reports' },
  '/reports/ceo-dashboard': { moduleName: 'Reports', title: 'CEO Dashboard', description: 'Executive reporting will be connected after report APIs are introduced.', plannedPhase: 'Reports' },
  '/reports/hr-dashboard': { moduleName: 'Reports', title: 'HR Dashboard', description: 'HR reporting will be connected after report APIs are introduced.', plannedPhase: 'Reports' },
  '/reports/sales-dashboard': { moduleName: 'Reports', title: 'Sales Dashboard', description: 'Sales reporting will be connected after CRM reporting APIs are introduced.', plannedPhase: 'Reports' },
  '/reports/manager-dashboard': { moduleName: 'Reports', title: 'Manager Dashboard', description: 'Manager reporting will be connected after report APIs are introduced.', plannedPhase: 'Reports' },
  '/settings/company-profile': { moduleName: 'Settings', title: 'Company Profile', description: 'Company profile settings will be connected after settings APIs are introduced.', plannedPhase: 'Settings' },
  '/settings/desktop-agent': { moduleName: 'Settings', title: 'Desktop Agent', description: 'Desktop agent configuration will be connected after agent policy APIs are introduced.', plannedPhase: 'Settings' },
  '/settings/general': { moduleName: 'Settings', title: 'General Settings', description: 'General workspace settings will be added in a later administration phase.', plannedPhase: 'Settings' },
};

export default function ComingSoonPage(props: ComingSoonPageProps) {
  const location = useLocation();
  const config = {
    moduleName: 'Admin',
    title: 'Coming Soon',
    description: 'This workspace is reserved for a future module.',
    plannedPhase: 'Future Phase',
    ...pageTitles[location.pathname],
    ...props,
  };
  const Icon = config.icon ?? Construction;

  return (
    <Stack gap={3}>
      <PageHeader title={config.title} description={config.description} breadcrumbs={['Admin', config.moduleName, config.title]} />
      <Card>
        <CardContent>
          <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 320, textAlign: 'center' }} gap={2}>
            <Icon size={44} color="#2563EB" />
            <Stack alignItems="center" gap={1}>
              <Typography variant="h2">Coming Soon</Typography>
              {config.plannedPhase && <Chip size="small" label={config.plannedPhase} color="primary" variant="outlined" />}
            </Stack>
            <Typography color="text.secondary" sx={{ maxWidth: 560 }}>
              This workspace is planned for a future release. Configuration and actions are not available yet.
            </Typography>
            <Button component={RouterLink} to="/" variant="contained">Back to dashboard</Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
