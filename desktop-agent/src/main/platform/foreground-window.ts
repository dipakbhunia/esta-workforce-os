import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { ForegroundWindowMetadata } from '../../shared/contracts';

const sampleIntervalMs = 5000;
const freshCacheMs = 30000;
const restartDelayMs = 15000;
const failureLogThrottleMs = 60000;

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
    [PSCustomObject]@{
      processId = if ($processId -gt 0) { [int]$processId } else { $null }
      processName = if ($process) { $process.ProcessName } else { $null }
      executableName = if ($path) { [System.IO.Path]::GetFileName($path) } elseif ($process) { $process.ProcessName + ".exe" } else { $null }
      applicationName = if ($process) { $process.ProcessName } else { $null }
      windowTitle = $builder.ToString()
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
  error?: string;
}

export class ForegroundWindowSampler {
  private worker: ChildProcessWithoutNullStreams | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private stdoutBuffer = '';
  private lastSuccess: ForegroundWindowMetadata | null = null;
  private lastSuccessAt = 0;
  private lastFailureLogAt = 0;
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
        };
        this.lastSuccessAt = Date.now();
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
