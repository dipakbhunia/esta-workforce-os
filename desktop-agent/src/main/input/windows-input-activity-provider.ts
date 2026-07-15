import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { InputActivitySnapshot } from '../../shared/contracts';
import {
  addInputActivitySnapshot,
  type InputActivityProvider,
  zeroInputActivitySnapshot,
} from './input-activity-provider';

const failureLogThrottleMs = 60000;
const restartDelayMs = 15000;

export interface WindowsInputActivityProviderOptions {
  mouseMoveEnabled: boolean;
  scrollEnabled: boolean;
  mouseMoveThrottleMs: number;
}

function inputCounterWorkerScript(options: WindowsInputActivityProviderOptions): string {
  return `
$ErrorActionPreference = "SilentlyContinue"
Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Threading;

public static class EstaInputCounter {
  private const int WH_KEYBOARD_LL = 13;
  private const int WH_MOUSE_LL = 14;
  private const int WM_KEYDOWN = 0x0100;
  private const int WM_SYSKEYDOWN = 0x0104;
  private const int WM_LBUTTONDOWN = 0x0201;
  private const int WM_RBUTTONDOWN = 0x0204;
  private const int WM_MBUTTONDOWN = 0x0207;
  private const int WM_MOUSEMOVE = 0x0200;
  private const int WM_MOUSEWHEEL = 0x020A;
  private const int WM_MOUSEHWHEEL = 0x020E;

  private delegate IntPtr LowLevelProc(int nCode, IntPtr wParam, IntPtr lParam);
  private static readonly LowLevelProc KeyboardProc = KeyboardHookCallback;
  private static readonly LowLevelProc MouseProc = MouseHookCallback;
  private static IntPtr keyboardHook = IntPtr.Zero;
  private static IntPtr mouseHook = IntPtr.Zero;
  private static long keyboardCount = 0;
  private static long mouseClickCount = 0;
  private static long mouseMoveCount = 0;
  private static long scrollCount = 0;
  private static long lastMouseMoveTick = 0;
  private static long mouseMoveThrottleTicks = TimeSpan.FromMilliseconds(500).Ticks;
  private static bool mouseMoveEnabled = true;
  private static bool scrollEnabled = true;

  public static void Start(int mouseMoveThrottleMs, bool enableMouseMove, bool enableScroll) {
    mouseMoveThrottleTicks = TimeSpan.FromMilliseconds(Math.Max(mouseMoveThrottleMs, 100)).Ticks;
    mouseMoveEnabled = enableMouseMove;
    scrollEnabled = enableScroll;
    if (keyboardHook == IntPtr.Zero) keyboardHook = SetWindowsHookEx(WH_KEYBOARD_LL, KeyboardProc, IntPtr.Zero, 0);
    if (mouseHook == IntPtr.Zero) mouseHook = SetWindowsHookEx(WH_MOUSE_LL, MouseProc, IntPtr.Zero, 0);
  }

  public static long TakeKeyboard() { return Interlocked.Exchange(ref keyboardCount, 0); }
  public static long TakeMouseClick() { return Interlocked.Exchange(ref mouseClickCount, 0); }
  public static long TakeMouseMove() { return Interlocked.Exchange(ref mouseMoveCount, 0); }
  public static long TakeScroll() { return Interlocked.Exchange(ref scrollCount, 0); }

  private static IntPtr KeyboardHookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
    if (nCode >= 0) {
      int message = wParam.ToInt32();
      if (message == WM_KEYDOWN || message == WM_SYSKEYDOWN) {
        Interlocked.Increment(ref keyboardCount);
      }
    }
    return CallNextHookEx(keyboardHook, nCode, wParam, lParam);
  }

  private static IntPtr MouseHookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
    if (nCode >= 0) {
      int message = wParam.ToInt32();
      if (message == WM_LBUTTONDOWN || message == WM_RBUTTONDOWN || message == WM_MBUTTONDOWN) {
        Interlocked.Increment(ref mouseClickCount);
      } else if (scrollEnabled && (message == WM_MOUSEWHEEL || message == WM_MOUSEHWHEEL)) {
        Interlocked.Increment(ref scrollCount);
      } else if (mouseMoveEnabled && message == WM_MOUSEMOVE) {
        long now = DateTime.UtcNow.Ticks;
        long previous = Interlocked.Read(ref lastMouseMoveTick);
        if (now - previous >= mouseMoveThrottleTicks && Interlocked.CompareExchange(ref lastMouseMoveTick, now, previous) == previous) {
          Interlocked.Increment(ref mouseMoveCount);
        }
      }
    }
    return CallNextHookEx(mouseHook, nCode, wParam, lParam);
  }

  [DllImport("user32.dll", SetLastError=true)]
  private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelProc lpfn, IntPtr hMod, uint dwThreadId);

  [DllImport("user32.dll", SetLastError=true)]
  private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
}
"@
[EstaInputCounter]::Start(${options.mouseMoveThrottleMs}, $${options.mouseMoveEnabled ? 'true' : 'false'}, $${options.scrollEnabled ? 'true' : 'false'})
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1000
$timer.Add_Tick({
  [PSCustomObject]@{
    keyboardCount = [EstaInputCounter]::TakeKeyboard()
    mouseClickCount = [EstaInputCounter]::TakeMouseClick()
    mouseMoveCount = [EstaInputCounter]::TakeMouseMove()
    scrollCount = [EstaInputCounter]::TakeScroll()
  } | ConvertTo-Json -Compress
  [Console]::Out.Flush()
})
$timer.Start()
[System.Windows.Forms.Application]::Run()
`;
}

interface WorkerSnapshot {
  keyboardCount?: number;
  mouseClickCount?: number;
  mouseMoveCount?: number;
  scrollCount?: number;
}

export class WindowsInputActivityProvider implements InputActivityProvider {
  private worker: ChildProcessWithoutNullStreams | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private stdoutBuffer = '';
  private pending = zeroInputActivitySnapshot();
  private stopping = false;
  private lastFailureLogAt = 0;

  constructor(private readonly options: WindowsInputActivityProviderOptions) {}

  async start(): Promise<void> {
    if (this.worker || this.restartTimer) return;
    this.stopping = false;
    this.startWorker();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.worker) {
      this.worker.kill();
      this.worker = null;
    }
    this.pending = zeroInputActivitySnapshot();
  }

  async snapshotAndReset(): Promise<InputActivitySnapshot> {
    const snapshot = this.pending;
    this.pending = zeroInputActivitySnapshot();
    return snapshot;
  }

  private startWorker(): void {
    this.worker = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        inputCounterWorkerScript(this.options),
      ],
      { windowsHide: true },
    );

    this.worker.stdout.setEncoding('utf8');
    this.worker.stderr.setEncoding('utf8');
    this.worker.stdout.on('data', (chunk: string) => this.readStdout(chunk));
    this.worker.stderr.on('data', () => this.logFailure(new Error('Input counter stderr output')));
    this.worker.on('error', (error) => {
      this.logFailure(error);
      this.scheduleRestart();
    });
    this.worker.on('exit', (code, signal) => {
      this.worker = null;
      if (!this.stopping) {
        this.logFailure(new Error(`Input counter exited: code=${code ?? 'null'} signal=${signal ?? 'null'}`));
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
        addInputActivitySnapshot(this.pending, this.normalize(JSON.parse(trimmed) as WorkerSnapshot));
      } catch (error) {
        this.logFailure(error);
      }
    }
  }

  private normalize(value: WorkerSnapshot): InputActivitySnapshot {
    return {
      keyboardCount: safeCount(value.keyboardCount),
      mouseClickCount: safeCount(value.mouseClickCount),
      mouseMoveCount: safeCount(value.mouseMoveCount),
      scrollCount: safeCount(value.scrollCount),
    };
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
    console.debug('[Esta Desktop] Numeric input counter unavailable; using zero counters', error);
  }
}

function safeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}
