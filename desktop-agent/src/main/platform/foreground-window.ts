import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ForegroundWindowMetadata } from '../../shared/contracts';

const execFileAsync = promisify(execFile);

const windowsForegroundWindowScript = `
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class ForegroundWindowReader {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
$handle = [ForegroundWindowReader]::GetForegroundWindow()
$builder = New-Object System.Text.StringBuilder 1024
[void][ForegroundWindowReader]::GetWindowText($handle, $builder, $builder.Capacity)
$processId = 0
[void][ForegroundWindowReader]::GetWindowThreadProcessId($handle, [ref]$processId)
$process = $null
if ($processId -gt 0) {
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
}
$path = $null
try {
  if ($process -and $process.MainModule) {
    $path = $process.MainModule.FileName
  }
} catch {}
[PSCustomObject]@{
  processId = if ($processId -gt 0) { [int]$processId } else { $null }
  processName = if ($process) { $process.ProcessName } else { $null }
  executableName = if ($path) { [System.IO.Path]::GetFileName($path) } elseif ($process) { $process.ProcessName + ".exe" } else { $null }
  applicationName = if ($process) { $process.ProcessName } else { $null }
  windowTitle = $builder.ToString()
} | ConvertTo-Json -Compress
`;

interface WindowsForegroundWindowResult {
  processId?: number | null;
  processName?: string | null;
  executableName?: string | null;
  applicationName?: string | null;
  windowTitle?: string | null;
}

export async function getForegroundWindowMetadata(): Promise<ForegroundWindowMetadata> {
  const base: ForegroundWindowMetadata = {
    capturedAt: new Date().toISOString(),
    platform: process.platform,
    processId: null,
    processName: null,
    executableName: null,
    applicationName: null,
    windowTitle: null,
  };

  if (process.platform !== 'win32') {
    // TODO: Add macOS support through approved Accessibility APIs during macOS hardening.
    return base;
  }

  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', windowsForegroundWindowScript],
      { windowsHide: true, timeout: 3000, maxBuffer: 64 * 1024 },
    );
    const parsed = JSON.parse(stdout) as WindowsForegroundWindowResult;
    return {
      ...base,
      processId: typeof parsed.processId === 'number' ? parsed.processId : null,
      processName: normalizeText(parsed.processName),
      executableName: normalizeText(parsed.executableName),
      applicationName: normalizeText(parsed.applicationName),
      windowTitle: normalizeText(parsed.windowTitle),
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[Esta Desktop] Foreground window metadata unavailable', error);
    }
    return base;
  }
}

function normalizeText(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}
