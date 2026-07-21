import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { ForegroundWindowMetadata } from '../../shared/contracts';

const sampleIntervalMs = 5000;
const freshCacheMs = 30000;
const restartDelayMs = 15000;
const failureLogThrottleMs = 60000;
const browserLogThrottleMs = 10000;

const windowsForegroundWindowWorkerScript = `
$ErrorActionPreference = "SilentlyContinue"
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
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

function Get-BrowserName([string]$processName) {
  $name = ""
  if ($processName) {
    $name = $processName.ToLowerInvariant()
  }
  switch ($name) {
    "chrome" { return "Google Chrome" }
    "msedge" { return "Microsoft Edge" }
    "firefox" { return "Mozilla Firefox" }
    "brave" { return "Brave" }
    "bravebrowser" { return "Brave" }
    "opera" { return "Opera" }
    "launcher" { return "Opera" }
    default { return $null }
  }
}

function Normalize-BrowserHostname([string]$candidate) {
  $value = ""
  if ($candidate) {
    $value = $candidate.Trim()
  }
  if (-not $value -or $value.Length -gt 2048) { return $null }
  if ($value -match "\s") { return $null }
  if ($value -match "^(chrome|edge|brave|opera|firefox|about|file|data|javascript|view-source|devtools|chrome-extension|moz-extension):") {
    return $null
  }

  $uriValue = $value
  if ($uriValue -notmatch "^[a-zA-Z][a-zA-Z0-9+.-]*://") {
    $uriValue = "https://$uriValue"
  }

  try {
    $uri = [System.Uri]::new($uriValue)
    if ($uri.Scheme -ne "http" -and $uri.Scheme -ne "https") { return $null }
    $host = $uri.Host.TrimEnd(".").ToLowerInvariant()
    if (-not $host -or $host.Length -gt 253) { return $null }
    if ($host -eq "localhost" -or $host -match "^\d{1,3}(\.\d{1,3}){3}$" -or $host -match "^\[?[a-f0-9:]+\]?$") {
      return $null
    }
    if ($host.StartsWith("www.")) {
      $host = $host.Substring(4)
    }
    if ($host -notmatch "^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$") {
      return $null
    }
    if (@("unknown", "browser", "chrome", "firefox", "edge", "msedge", "brave", "opera", "electron") -contains $host) {
      return $null
    }
    return $host
  } catch {
    return $null
  }
}

function Get-ActiveBrowserDomain([IntPtr]$handle, [string]$processName) {
  $browserName = Get-BrowserName $processName
  if (-not $browserName) {
    return [PSCustomObject]@{
      browserName = $null
      browserDomain = $null
      browserProviderAvailable = $false
      browserUrlAvailable = $false
      browserLookupStatus = "not_browser"
    }
  }

  try {
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
    if (-not $root) {
      return [PSCustomObject]@{
        browserName = $browserName
        browserDomain = $null
        browserProviderAvailable = $false
        browserUrlAvailable = $false
        browserLookupStatus = "automation_root_unavailable"
      }
    }

    $condition = [System.Windows.Automation.PropertyCondition]::new(
      [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
      [System.Windows.Automation.ControlType]::Edit
    )
    $edits = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
    if (-not $edits -or $edits.Count -eq 0) {
      return [PSCustomObject]@{
        browserName = $browserName
        browserDomain = $null
        browserProviderAvailable = $true
        browserUrlAvailable = $false
        browserLookupStatus = "address_field_not_found"
      }
    }
    foreach ($edit in $edits) {
      $candidates = New-Object System.Collections.Generic.List[string]
      try {
        $valuePattern = $null
        if ($edit.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$valuePattern)) {
          [void]$candidates.Add($valuePattern.Current.Value)
        }
      } catch {}
      try {
        [void]$candidates.Add($edit.Current.Name)
      } catch {}

      foreach ($candidate in $candidates) {
        $domain = Normalize-BrowserHostname $candidate
        if ($domain) {
          return [PSCustomObject]@{
            browserName = $browserName
            browserDomain = $domain
            browserProviderAvailable = $true
            browserUrlAvailable = $true
            browserLookupStatus = "hostname_resolved"
          }
        }
      }
    }
    return [PSCustomObject]@{
      browserName = $browserName
      browserDomain = $null
      browserProviderAvailable = $true
      browserUrlAvailable = $false
      browserLookupStatus = "hostname_unavailable"
    }
  } catch {
    return [PSCustomObject]@{
      browserName = $browserName
      browserDomain = $null
      browserProviderAvailable = $false
      browserUrlAvailable = $false
      browserLookupStatus = "automation_lookup_failed"
    }
  }
}

while ($true) {
  try {
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
    $activeProcessName = $null
    if ($process) {
      $activeProcessName = $process.ProcessName
    }
    $browser = Get-ActiveBrowserDomain $handle $activeProcessName
    [PSCustomObject]@{
      processId = if ($processId -gt 0) { [int]$processId } else { $null }
      processName = if ($process) { $process.ProcessName } else { $null }
      executableName = if ($path) { [System.IO.Path]::GetFileName($path) } elseif ($process) { $process.ProcessName + ".exe" } else { $null }
      applicationName = if ($process) { $process.ProcessName } else { $null }
      windowTitle = $builder.ToString()
      browserName = $browser.browserName
      browserDomain = $browser.browserDomain
      browserWindowTitle = $builder.ToString()
      browserProviderAvailable = $browser.browserProviderAvailable
      browserUrlAvailable = $browser.browserUrlAvailable
      browserLookupStatus = $browser.browserLookupStatus
    } | ConvertTo-Json -Compress
  } catch {
    [PSCustomObject]@{ error = "foreground_lookup_failed" } | ConvertTo-Json -Compress
  }
  Start-Sleep -Milliseconds ${sampleIntervalMs}
}
`;

interface WindowsForegroundWindowResult {
  processId?: number | null;
  processName?: string | null;
  executableName?: string | null;
  applicationName?: string | null;
  windowTitle?: string | null;
  browserName?: string | null;
  browserDomain?: string | null;
  browserWindowTitle?: string | null;
  browserProviderAvailable?: boolean;
  browserUrlAvailable?: boolean;
  browserLookupStatus?: string | null;
  error?: string;
}

export class ForegroundWindowSampler {
  private worker: ChildProcessWithoutNullStreams | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private stdoutBuffer = '';
  private lastSuccess: ForegroundWindowMetadata | null = null;
  private lastSuccessAt = 0;
  private lastFailureLogAt = 0;
  private lastBrowserLogAt = 0;
  private lastBrowserLogKey = '';
  private stopping = false;

  start(): void {
    if (this.worker || this.restartTimer || this.stopping) return;
    if (process.platform !== 'win32') {
      // TODO: Add macOS support through approved Accessibility APIs during macOS hardening.
      return;
    }
    this.startWorker();
  }

  stop(): void {
    this.stopping = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.worker) {
      this.worker.kill();
      this.worker = null;
    }
  }

  getMetadata(): ForegroundWindowMetadata {
    if (this.lastSuccess && Date.now() - this.lastSuccessAt <= freshCacheMs) {
      return this.lastSuccess;
    }
    return unknownForegroundWindowMetadata();
  }

  private startWorker(): void {
    this.worker = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', windowsForegroundWindowWorkerScript],
      { windowsHide: true },
    );

    this.worker.stdout.setEncoding('utf8');
    this.worker.stderr.setEncoding('utf8');
    this.worker.stdout.on('data', (chunk: string) => this.readStdout(chunk));
    this.worker.stderr.on('data', () => this.logFailure(new Error('Foreground sampler stderr output')));
    this.worker.on('error', (error) => {
      this.logFailure(error);
      this.scheduleRestart();
    });
    this.worker.on('exit', (code, signal) => {
      this.worker = null;
      if (!this.stopping) {
        this.logFailure(new Error(`Foreground sampler exited: code=${code ?? 'null'} signal=${signal ?? 'null'}`));
        this.scheduleRestart();
      }
    });
  }

  private readStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    const lines = this.stdoutBuffer.split(/\r?\n/);
    this.stdoutBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as WindowsForegroundWindowResult;
        if (parsed.error) {
          this.logFailure(new Error(parsed.error));
          continue;
        }
        this.lastSuccess = {
          ...unknownForegroundWindowMetadata(),
          processId: typeof parsed.processId === 'number' ? parsed.processId : null,
          processName: normalizeText(parsed.processName),
          executableName: normalizeText(parsed.executableName),
          applicationName: normalizeText(parsed.applicationName),
          windowTitle: normalizeText(parsed.windowTitle),
          browserName: normalizeText(parsed.browserName),
          browserDomain: normalizeHostname(parsed.browserDomain),
          browserWindowTitle: normalizeText(parsed.browserWindowTitle),
          browserProviderAvailable: parsed.browserProviderAvailable === true,
          browserUrlAvailable: parsed.browserUrlAvailable === true && Boolean(normalizeHostname(parsed.browserDomain)),
          browserLookupStatus: normalizeText(parsed.browserLookupStatus),
        };
        this.lastSuccessAt = Date.now();
        this.logBrowserDiagnostics(this.lastSuccess);
      } catch (error) {
        this.logFailure(error);
      }
    }
  }

  private scheduleRestart(): void {
    if (this.stopping || this.restartTimer) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.startWorker();
    }, restartDelayMs);
  }

  private logFailure(error: unknown): void {
    if (process.env.NODE_ENV === 'production') return;
    const now = Date.now();
    if (now - this.lastFailureLogAt < failureLogThrottleMs) return;
    this.lastFailureLogAt = now;
    console.debug('[Esta Desktop] Foreground window sampler unavailable; using cached fallback', error);
  }

  private logBrowserDiagnostics(metadata: ForegroundWindowMetadata): void {
    if (process.env.NODE_ENV === 'production') return;
    if (!metadata.browserName && metadata.browserLookupStatus !== 'not_browser') return;
    const key = [
      metadata.processName,
      metadata.executableName,
      metadata.browserName,
      metadata.browserLookupStatus,
      metadata.browserDomain,
    ].join('|');
    const now = Date.now();
    if (key === this.lastBrowserLogKey && now - this.lastBrowserLogAt < browserLogThrottleMs) return;
    this.lastBrowserLogKey = key;
    this.lastBrowserLogAt = now;
    console.debug('[Esta Desktop] Browser foreground diagnostic', {
      processName: metadata.processName,
      executableName: metadata.executableName,
      browserName: metadata.browserName,
      hostname: metadata.browserDomain,
      providerAvailable: metadata.browserProviderAvailable,
      urlAvailable: metadata.browserUrlAvailable,
      status: metadata.browserLookupStatus,
      capturedAt: metadata.capturedAt,
    });
  }
}

function unknownForegroundWindowMetadata(): ForegroundWindowMetadata {
  return {
    capturedAt: new Date().toISOString(),
    platform: process.platform,
    processId: null,
    processName: null,
    executableName: null,
    applicationName: null,
    windowTitle: null,
  };
}

function normalizeText(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function normalizeHostname(value?: string | null): string | null {
  const hostname = normalizeText(value)?.toLowerCase().replace(/\.$/, '');
  if (!hostname) return null;
  const withoutWww = hostname.startsWith('www.') ? hostname.slice(4) : hostname;
  return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(withoutWww)
    ? withoutWww
    : null;
}
