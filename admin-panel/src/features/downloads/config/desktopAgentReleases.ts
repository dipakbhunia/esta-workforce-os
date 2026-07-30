// Configure this only after the signed Windows installer is published.
const configuredWindowsDownloadUrl = import.meta.env.VITE_WINDOWS_AGENT_DOWNLOAD_URL?.trim() ?? '';

function isValidDownloadUrl(value: string) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export interface DesktopAgentRelease {
  platform: 'Windows' | 'macOS';
  version?: string;
  architecture?: string;
  installerType?: string;
  downloadUrl?: string;
  releaseDate?: string;
  fileSize?: string;
  channel?: string;
  enabled: boolean;
  prerequisites: string[];
}

export const windowsAgentRelease: DesktopAgentRelease = {
  platform: 'Windows',
  version: '1.0.0',
  architecture: 'x64',
  installerType: 'EXE',
  downloadUrl: isValidDownloadUrl(configuredWindowsDownloadUrl) ? configuredWindowsDownloadUrl : undefined,
  releaseDate: undefined,
  fileSize: undefined,
  channel: 'Stable',
  enabled: isValidDownloadUrl(configuredWindowsDownloadUrl),
  prerequisites: [
    'Windows 10 or Windows 11',
    '64-bit operating system',
    'Minimum 4 GB RAM',
    'Stable internet connection',
    'Permission to install desktop software',
    'Microsoft Visual C++ Runtime 2015-2022 when required',
  ],
};

export const macAgentRelease: DesktopAgentRelease = {
  platform: 'macOS',
  enabled: false,
  prerequisites: [],
};
