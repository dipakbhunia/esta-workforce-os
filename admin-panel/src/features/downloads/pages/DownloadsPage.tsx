import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Card, CardContent, Chip, Divider, Grid, Snackbar, Stack, Tab, Tabs, Tooltip, Typography } from '@mui/material';
import type { ReactNode, SyntheticEvent } from 'react';
import { useState } from 'react';
import { Apple, CheckCircle2, ChevronDown, Copy, Download, Info, MonitorDown } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SectionCard } from '@/components/section-card';
import { StatusChip } from '@/components/status-chip';
import { macAgentRelease, windowsAgentRelease, type DesktopAgentRelease } from '@/features/downloads/config/desktopAgentReleases';

const installationSteps = [
  'Download the official installer when your organization has published it.',
  'Do not rename the setup file before installation.',
  'Run the installer as administrator when Windows requests it.',
  'Sign in with the employee account.',
  'Approve required monitoring permissions where enabled by your organization.',
  'Confirm device registration.',
  'Verify Online status in the admin panel.',
];

const faqs = [
  ['Why is the installer button disabled?', 'The Windows installer has not been published yet. Your administrator will enable downloads when the signed installer is ready.'],
  ['Do I need administrator access?', 'Administrator permission may be required depending on Windows security policy and your organization setup.'],
  ['Which Windows versions are supported?', 'The Desktop Agent foundation targets Windows 10 and Windows 11 on 64-bit systems.'],
  ['Why is Microsoft Visual C++ Runtime required?', 'Some native monitoring dependencies may require Microsoft Visual C++ Runtime 2015-2022 when not already installed.'],
  ['Can one employee use multiple devices?', 'Device registration supports managed devices where enabled by your organization policies.'],
];

const uninstallSteps = [
  'Sign out of the Desktop Agent.',
  'Open Windows Settings.',
  'Go to Apps / Installed Apps.',
  'Find Esta Workforce Desktop Agent.',
  'Uninstall the application.',
  'Contact HR/Admin if the device remains registered after uninstalling.',
];

const validationSteps = [
  'Desktop Agent opens successfully.',
  'Employee login succeeds.',
  'Device appears in Device Inventory.',
  'Live Status becomes Online where enabled by your organization.',
  'Heartbeats and activity sync where monitoring is enabled.',
  'Attendance state displays correctly.',
];

export default function DownloadsPage() {
  const [tab, setTab] = useState<'windows' | 'macos'>('windows');
  const [toast, setToast] = useState('');

  function handleTabChange(_event: SyntheticEvent, value: 'windows' | 'macos') {
    setTab(value);
  }

  async function copyDownloadLink() {
    if (!windowsAgentRelease.downloadUrl) return;
    try {
      await navigator.clipboard.writeText(windowsAgentRelease.downloadUrl);
      setToast('Download link copied.');
    } catch {
      setToast('Could not copy the download link.');
    }
  }

  return (
    <PageLayout>
      <PageHeader
        title="Download Apps"
        description="Download and install the Esta Workforce Desktop Agent for supported operating systems."
        breadcrumbs={['Downloads', 'Download Apps']}
      />

      <Card sx={{ overflow: 'hidden' }}>
        <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', px: { xs: 1, md: 2 } }}>
          <Tabs value={tab} onChange={handleTabChange} aria-label="Desktop agent platform tabs" variant="scrollable" allowScrollButtonsMobile>
            <Tab value="windows" label="Windows" icon={<MonitorDown size={18} />} iconPosition="start" />
            <Tab value="macos" label="macOS" icon={<Apple size={18} />} iconPosition="start" />
          </Tabs>
        </Box>
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          {tab === 'windows' ? <WindowsDownloads onCopy={copyDownloadLink} /> : <MacComingSoon />}
        </CardContent>
      </Card>

      <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast('')} message={toast} />
    </PageLayout>
  );
}

function WindowsDownloads({ onCopy }: { onCopy: () => void }) {
  return (
    <Stack gap={3}>
      <Grid container spacing={3} alignItems="stretch">
        <Grid size={{ xs: 12, lg: 5 }}>
          <PlatformDownloadCard release={windowsAgentRelease} onCopy={onCopy} />
        </Grid>
        <Grid size={{ xs: 12, lg: 7 }}>
          <SectionCard title="Important before installation" description="Review these notes before distributing the Windows installer.">
            <Alert severity="warning" icon={<Info size={20} />} sx={{ mb: 2 }}>
              Do not rename the installer before installation. Administrator permission and internet connectivity may be required for activation and sync.
            </Alert>
            <Grid container spacing={1.5}>
              {windowsAgentRelease.prerequisites.map((item) => (
                <Grid size={{ xs: 12, sm: 6 }} key={item}>
                  <Stack direction="row" gap={1} alignItems="flex-start" sx={{ p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: '#fff' }}>
                    <CheckCircle2 size={17} color="#16A34A" aria-hidden />
                    <Typography variant="body2">{item}</Typography>
                  </Stack>
                </Grid>
              ))}
            </Grid>
          </SectionCard>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <DownloadGuideAccordion title="Standard Installation Guide" items={installationSteps} ordered />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <DownloadFaqAccordion />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <DownloadGuideAccordion title="Uninstallation Steps" items={uninstallSteps} ordered />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <DownloadGuideAccordion title="Validation" items={validationSteps} />
        </Grid>
      </Grid>
    </Stack>
  );
}

function PlatformDownloadCard({ release, onCopy }: { release: DesktopAgentRelease; onCopy: () => void }) {
  const unavailableReason = 'The Windows installer has not been published yet.';

  return (
    <Card sx={{ height: '100%', border: '1px solid', borderColor: 'divider', boxShadow: '0 16px 40px rgba(15, 23, 42, 0.06)' }}>
      <CardContent>
        <Stack gap={2.5}>
          <Stack direction="row" gap={1.5} alignItems="center">
            <Box sx={{ width: 44, height: 44, borderRadius: 3, bgcolor: '#DBEAFE', color: '#1D4ED8', display: 'grid', placeItems: 'center' }}>
              <MonitorDown size={22} aria-hidden />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h3">Esta Workforce Desktop Agent</Typography>
              <Typography variant="body2" color="text.secondary">Official Windows agent package</Typography>
            </Box>
          </Stack>

          <Stack direction="row" gap={1} flexWrap="wrap">
            <StatusChip label={release.enabled ? 'Available' : 'Installer Upload Pending'} tone={release.enabled ? 'success' : 'warning'} />
            <Chip size="small" label={`Platform: ${release.platform}`} />
            <Chip size="small" label={`Channel: ${release.channel ?? 'Stable'}`} />
            <Chip size="small" label={`Version: ${release.version ?? 'Not configured'}`} />
          </Stack>

          <Divider />

          <Grid container spacing={1.5}>
            <Metadata label="Installer" value={release.installerType ?? 'EXE'} />
            <Metadata label="Architecture" value={release.architecture ?? 'x64'} />
            <Metadata label="File size" value={release.fileSize ?? 'Not published'} />
            <Metadata label="Release date" value={release.releaseDate ?? 'Not published'} />
          </Grid>

          {!release.enabled && <Alert severity="info">{unavailableReason}</Alert>}

          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.25}>
            <Tooltip title={release.enabled ? 'Download the Windows installer' : unavailableReason}>
              <span>
                <Button
                  fullWidth
                  variant="contained"
                  startIcon={<Download size={18} />}
                  disabled={!release.enabled}
                  href={release.downloadUrl}
                  aria-label="Download Windows Desktop Agent installer"
                >
                  {release.enabled ? 'Download EXE' : 'Installer Upload Pending'}
                </Button>
              </span>
            </Tooltip>
            <Tooltip title={release.enabled ? 'Copy the configured installer URL' : unavailableReason}>
              <span>
                <Button fullWidth variant="outlined" startIcon={<Copy size={18} />} disabled={!release.enabled} onClick={onCopy} aria-label="Copy Windows Desktop Agent download link">
                  Copy Link
                </Button>
              </span>
            </Tooltip>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function Metadata({ label, value }: { label: string; value: string }) {
  return (
    <Grid size={{ xs: 6 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={800}>{value}</Typography>
    </Grid>
  );
}

function DownloadGuideAccordion({ title, items, ordered = false }: { title: string; items: string[]; ordered?: boolean }) {
  const ListTag = ordered ? 'ol' : 'ul';

  return (
    <DownloadAccordion title={title}>
      <Box component={ListTag} sx={{ m: 0, pl: 2.5 }}>
        {items.map((item) => (
          <Typography component="li" variant="body2" color="text.secondary" sx={{ mb: 1 }} key={item}>
            {item}
          </Typography>
        ))}
      </Box>
    </DownloadAccordion>
  );
}

function DownloadFaqAccordion() {
  return (
    <DownloadAccordion title="Installation FAQs">
      <Stack gap={1.5}>
        {faqs.map(([question, answer]) => (
          <Box key={question}>
            <Typography variant="body2" fontWeight={800}>{question}</Typography>
            <Typography variant="body2" color="text.secondary">{answer}</Typography>
          </Box>
        ))}
      </Stack>
    </DownloadAccordion>
  );
}

function DownloadAccordion({ title, children }: { title: string; children: ReactNode }) {
  const contentId = `${title.replaceAll(' ', '-').toLowerCase()}-content`;

  return (
    <Accordion disableGutters sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ChevronDown size={18} />} aria-controls={contentId} id={`${contentId}-header`}>
        <Typography variant="h4">{title}</Typography>
      </AccordionSummary>
      <AccordionDetails>{children}</AccordionDetails>
    </Accordion>
  );
}

function MacComingSoon() {
  return (
    <Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}>
      <Stack gap={2} alignItems="center" textAlign="center" sx={{ maxWidth: 560 }}>
        <Box sx={{ width: 64, height: 64, borderRadius: 4, bgcolor: '#F3F4F6', color: '#111827', display: 'grid', placeItems: 'center' }}>
          <Apple size={30} aria-hidden />
        </Box>
        <StatusChip label="Coming Soon" tone="info" />
        <Typography variant="h2">Esta Workforce Desktop Agent for macOS</Typography>
        <Typography color="text.secondary">
          The macOS agent is under development and will be available in a future release. Contact your administrator for supported deployment options.
        </Typography>
        {macAgentRelease.enabled ? null : <Typography variant="caption" color="text.secondary">No macOS installer or release date is published yet.</Typography>}
      </Stack>
    </Box>
  );
}
