import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { InputActivitySnapshot } from '../../shared/contracts';
import {
  addInputActivitySnapshot,
  type InputActivityProvider,
  zeroInputActivitySnapshot,
} from './input-activity-provider';

const failureLogThrottleMs = 60000;
const snapshotLogThrottleMs = 15000;
const restartDelayMs = 15000;

export interface WindowsInputActivityProviderOptions {
  mouseMoveEnabled: boolean;
  scrollEnabled: boolean;
  mouseMoveThrottleMs: number;
}

function inputCounterWorkerScript(options: WindowsInputActivityProviderOptions): string {
  return `
$ErrorActionPreference = "SilentlyContinue"
Add-Type -TypeDefinition @"
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Threading;

public static class EstaInputCounter {
  private const int WH_KEYBOARD_LL = 13;
  private const int WH_MOUSE_LL = 14;
  private const int WM_KEYDOWN = 0x0100;
  private const int WM_SYSKEYDOWN = 0x0104;
  private const int WM_LBUTTONDOWN = 0x0201;
  private const int WM_RBUTTONDOWN = 0x0204;
  private const int WM_MBUTTONDOWN = 0x0207;
  private const int WM_XBUTTONDOWN = 0x020B;
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
  private static long keyboardCallbackCount = 0;
  private static long mouseCallbackCount = 0;
  private static long wheelCallbackCount = 0;
  private static long lastMouseMoveTick = 0;
  private static long mouseMoveThrottleTicks = TimeSpan.FromMilliseconds(500).Ticks;
  private static bool mouseMoveEnabled = true;
  private static bool scrollEnabled = true;
  private static int keyboardHookLastError = 0;
  private static int mouseHookLastError = 0;
  private static string keyboardInstallMode = "not_attempted";
  private static string mouseInstallMode = "not_attempted";
  private static readonly object outputLock = new object();
  private static Timer heartbeatTimer;
  private static Timer snapshotTimer;

  public static void Start(int mouseMoveThrottleMs, bool enableMouseMove, bool enableScroll) {
    mouseMoveThrottleTicks = TimeSpan.FromMilliseconds(Math.Max(mouseMoveThrottleMs, 100)).Ticks;
    mouseMoveEnabled = enableMouseMove;
    scrollEnabled = enableScroll;
    if (keyboardHook == IntPtr.Zero) keyboardHook = InstallHook(WH_KEYBOARD_LL, KeyboardProc, out keyboardHookLastError, out keyboardInstallMode);
    if (mouseHook == IntPtr.Zero) mouseHook = InstallHook(WH_MOUSE_LL, MouseProc, out mouseHookLastError, out mouseInstallMode);
  }

  private static IntPtr InstallHook(int hookId, LowLevelProc callback, out int errorCode, out string installMode) {
    errorCode = 0;
    installMode = "module_handle";
    IntPtr moduleHandle = IntPtr.Zero;
    try {
      using (Process current = Process.GetCurrentProcess())
      using (ProcessModule module = current.MainModule) {
        moduleHandle = GetModuleHandle(module.ModuleName);
      }
    } catch {}

    IntPtr hook = SetWindowsHookEx(hookId, callback, moduleHandle, 0);
    if (hook != IntPtr.Zero) return hook;

    int moduleHandleError = Marshal.GetLastWin32Error();
    installMode = "zero_module_handle_fallback";
    hook = SetWindowsHookEx(hookId, callback, IntPtr.Zero, 0);
    if (hook != IntPtr.Zero) {
      errorCode = 0;
      return hook;
    }

    errorCode = Marshal.GetLastWin32Error();
    if (errorCode == 0) errorCode = moduleHandleError;
    installMode = "failed";
    return IntPtr.Zero;
  }

  public static bool KeyboardHookInstalled() { return keyboardHook != IntPtr.Zero; }
  public static bool MouseHookInstalled() { return mouseHook != IntPtr.Zero; }
  public static bool KeyboardHookHandlePresent() { return keyboardHook != IntPtr.Zero; }
  public static bool MouseHookHandlePresent() { return mouseHook != IntPtr.Zero; }
  public static int KeyboardHookLastError() { return keyboardHookLastError; }
  public static int MouseHookLastError() { return mouseHookLastError; }
  public static string KeyboardHookErrorMessage() { return keyboardHookLastError == 0 ? "" : new Win32Exception(keyboardHookLastError).Message; }
  public static string MouseHookErrorMessage() { return mouseHookLastError == 0 ? "" : new Win32Exception(mouseHookLastError).Message; }
  public static string KeyboardInstallMode() { return keyboardInstallMode; }
  public static string MouseInstallMode() { return mouseInstallMode; }
  public static long KeyboardCallbackCount() { return Interlocked.Read(ref keyboardCallbackCount); }
  public static long MouseCallbackCount() { return Interlocked.Read(ref mouseCallbackCount); }
  public static long WheelCallbackCount() { return Interlocked.Read(ref wheelCallbackCount); }
  public static long TakeKeyboard() { return Interlocked.Exchange(ref keyboardCount, 0); }
  public static long TakeMouseClick() { return Interlocked.Exchange(ref mouseClickCount, 0); }
  public static long TakeMouseMove() { return Interlocked.Exchange(ref mouseMoveCount, 0); }
  public static long TakeScroll() { return Interlocked.Exchange(ref scrollCount, 0); }
  public static int WorkerProcessId() { return Process.GetCurrentProcess().Id; }
  public static string WorkerArchitecture() { return Environment.Is64BitProcess ? "x64" : "x86"; }
  public static bool DesktopAgentElevated() {
    try {
      WindowsIdentity identity = WindowsIdentity.GetCurrent();
      WindowsPrincipal principal = new WindowsPrincipal(identity);
      return principal.IsInRole(WindowsBuiltInRole.Administrator);
    } catch {
      return false;
    }
  }

  public static void StartOutputTimers() {
    snapshotTimer = new Timer(_ => WriteReport("snapshot", true), null, 1000, 1000);
    heartbeatTimer = new Timer(_ => WriteReport("heartbeat", false), null, 10000, 10000);
  }

  public static void WriteSnapshot(string type) {
    WriteReport(type, true);
  }

  private static void WriteReport(string type, bool resetCounts) {
    long currentKeyboardCount = resetCounts ? TakeKeyboard() : Interlocked.Read(ref keyboardCount);
    long currentMouseClickCount = resetCounts ? TakeMouseClick() : Interlocked.Read(ref mouseClickCount);
    long currentMouseMoveCount = resetCounts ? TakeMouseMove() : Interlocked.Read(ref mouseMoveCount);
    long currentScrollCount = resetCounts ? TakeScroll() : Interlocked.Read(ref scrollCount);
    lock (outputLock) {
      Console.WriteLine("{" +
        JsonPair("type", type) + "," +
        JsonPair("keyboardCount", currentKeyboardCount) + "," +
        JsonPair("mouseClickCount", currentMouseClickCount) + "," +
        JsonPair("mouseMoveCount", currentMouseMoveCount) + "," +
        JsonPair("scrollCount", currentScrollCount) + "," +
        JsonPair("keyboardCallbackCount", KeyboardCallbackCount()) + "," +
        JsonPair("mouseCallbackCount", MouseCallbackCount()) + "," +
        JsonPair("wheelCallbackCount", WheelCallbackCount()) + "," +
        JsonPair("keyboardHookInstalled", KeyboardHookInstalled()) + "," +
        JsonPair("mouseHookInstalled", MouseHookInstalled()) + "," +
        JsonPair("keyboardHookHandlePresent", KeyboardHookHandlePresent()) + "," +
        JsonPair("mouseHookHandlePresent", MouseHookHandlePresent()) + "," +
        JsonPair("keyboardHookLastError", KeyboardHookLastError()) + "," +
        JsonPair("mouseHookLastError", MouseHookLastError()) + "," +
        JsonPair("keyboardHookErrorMessage", KeyboardHookErrorMessage()) + "," +
        JsonPair("mouseHookErrorMessage", MouseHookErrorMessage()) + "," +
        JsonPair("keyboardInstallMode", KeyboardInstallMode()) + "," +
        JsonPair("mouseInstallMode", MouseInstallMode()) + "," +
        JsonPair("workerProcessId", WorkerProcessId()) + "," +
        JsonPair("workerArchitecture", WorkerArchitecture()) + "," +
        JsonPair("desktopAgentElevated", DesktopAgentElevated()) + "," +
        JsonPair("hooksAlive", KeyboardHookInstalled() && MouseHookInstalled()) +
      "}");
      Console.Out.Flush();
    }
  }

  private static string JsonPair(string key, string value) {
    return "\\\"" + Escape(key) + "\\\":\\\"" + Escape(value ?? "") + "\\\"";
  }

  private static string JsonPair(string key, long value) {
    return "\\\"" + Escape(key) + "\\\":" + value.ToString(CultureInfo.InvariantCulture);
  }

  private static string JsonPair(string key, int value) {
    return "\\\"" + Escape(key) + "\\\":" + value.ToString(CultureInfo.InvariantCulture);
  }

  private static string JsonPair(string key, bool value) {
    return "\\\"" + Escape(key) + "\\\":" + (value ? "true" : "false");
  }

  private static string Escape(string value) {
    return value.Replace("\\\\", "\\\\\\\\").Replace("\\\"", "\\\\\\\"").Replace("\\r", "\\\\r").Replace("\\n", "\\\\n");
  }

  private static IntPtr KeyboardHookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
    if (nCode >= 0) {
      Interlocked.Increment(ref keyboardCallbackCount);
      int message = wParam.ToInt32();
      if (message == WM_KEYDOWN || message == WM_SYSKEYDOWN) {
        Interlocked.Increment(ref keyboardCount);
      }
    }
    return CallNextHookEx(keyboardHook, nCode, wParam, lParam);
  }

  private static IntPtr MouseHookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
    if (nCode >= 0) {
      Interlocked.Increment(ref mouseCallbackCount);
      long message = wParam.ToInt64();
      if (message == WM_LBUTTONDOWN || message == WM_RBUTTONDOWN || message == WM_MBUTTONDOWN || message == WM_XBUTTONDOWN) {
        Interlocked.Increment(ref mouseClickCount);
      } else if (scrollEnabled && (message == WM_MOUSEWHEEL || message == WM_MOUSEHWHEEL)) {
        Interlocked.Increment(ref wheelCallbackCount);
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

  [DllImport("kernel32.dll", CharSet=CharSet.Auto, SetLastError=true)]
  private static extern IntPtr GetModuleHandle(string lpModuleName);

  [DllImport("user32.dll", SetLastError=true)]
  private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

  public static void RunMessageLoop() {
    MSG message;
    while (GetMessage(out message, IntPtr.Zero, 0, 0) > 0) {
      TranslateMessage(ref message);
      DispatchMessage(ref message);
    }
  }

  [DllImport("user32.dll", SetLastError=true)]
  private static extern int GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

  [DllImport("user32.dll")]
  private static extern bool TranslateMessage(ref MSG lpMsg);

  [DllImport("user32.dll")]
  private static extern IntPtr DispatchMessage(ref MSG lpMsg);

  [StructLayout(LayoutKind.Sequential)]
  private struct MSG {
    public IntPtr hwnd;
    public uint message;
    public UIntPtr wParam;
    public IntPtr lParam;
    public uint time;
    public POINT pt;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct POINT {
    public int x;
    public int y;
  }
}
"@
[EstaInputCounter]::Start(${options.mouseMoveThrottleMs}, $${options.mouseMoveEnabled ? 'true' : 'false'}, $${options.scrollEnabled ? 'true' : 'false'})
[EstaInputCounter]::WriteSnapshot("startup")
[EstaInputCounter]::StartOutputTimers()
[EstaInputCounter]::RunMessageLoop()
`;
}

interface WorkerSnapshot {
  type?: 'startup' | 'heartbeat' | 'snapshot';
  keyboardCount?: number;
  mouseClickCount?: number;
  mouseMoveCount?: number;
  scrollCount?: number;
  keyboardCallbackCount?: number;
  mouseCallbackCount?: number;
  wheelCallbackCount?: number;
  keyboardHookInstalled?: boolean;
  mouseHookInstalled?: boolean;
  keyboardHookHandlePresent?: boolean;
  mouseHookHandlePresent?: boolean;
  keyboardHookLastError?: number;
  mouseHookLastError?: number;
  keyboardHookErrorMessage?: string;
  mouseHookErrorMessage?: string;
  keyboardInstallMode?: string;
  mouseInstallMode?: string;
  workerProcessId?: number;
  workerArchitecture?: string;
  desktopAgentElevated?: boolean;
  hooksAlive?: boolean;
}

export class WindowsInputActivityProvider implements InputActivityProvider {
  private worker: ChildProcessWithoutNullStreams | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private stdoutBuffer = '';
  private pending = zeroInputActivitySnapshot();
  private stopping = false;
  private lastFailureLogAt = 0;
  private lastSnapshotLogAt = 0;
  private lastHookStatusLogAt = 0;
  private lastCallbackLogAt = 0;

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
    this.worker.stderr.on('data', (chunk: string) =>
      this.logFailure(new Error(`Input counter stderr output: ${chunk.trim()}`)),
    );
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
        const parsed = JSON.parse(trimmed) as WorkerSnapshot;
        const snapshot = this.normalize(parsed);
        this.logHookStatus(parsed);
        this.logCallbackDiagnostics(parsed, snapshot);
        this.logSnapshot(snapshot);
        if (parsed.type !== 'heartbeat') {
          addInputActivitySnapshot(this.pending, snapshot);
        }
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

  private logHookStatus(value: WorkerSnapshot): void {
    if (process.env.NODE_ENV === 'production') return;
    const now = Date.now();
    if (
      value.keyboardHookInstalled === true &&
      value.mouseHookInstalled === true &&
      now - this.lastHookStatusLogAt < failureLogThrottleMs
    ) {
      return;
    }
    if (now - this.lastHookStatusLogAt < snapshotLogThrottleMs) return;
    this.lastHookStatusLogAt = now;
    console.debug('[Esta Desktop] Numeric input counter hook status', {
      type: value.type,
      keyboardHookInstalled: value.keyboardHookInstalled === true,
      mouseHookInstalled: value.mouseHookInstalled === true,
      keyboardHookHandlePresent: value.keyboardHookHandlePresent === true,
      mouseHookHandlePresent: value.mouseHookHandlePresent === true,
      keyboardHookLastError: value.keyboardHookLastError ?? 0,
      mouseHookLastError: value.mouseHookLastError ?? 0,
      keyboardHookErrorMessage: value.keyboardHookErrorMessage || '',
      mouseHookErrorMessage: value.mouseHookErrorMessage || '',
      keyboardInstallMode: value.keyboardInstallMode || 'unknown',
      mouseInstallMode: value.mouseInstallMode || 'unknown',
      workerProcessId: value.workerProcessId ?? null,
      workerArchitecture: value.workerArchitecture ?? 'unknown',
      desktopAgentElevated: value.desktopAgentElevated === true,
      mouseMoveEnabled: this.options.mouseMoveEnabled,
      scrollEnabled: this.options.scrollEnabled,
      mouseMoveThrottleMs: this.options.mouseMoveThrottleMs,
    });
  }

  private logCallbackDiagnostics(
    value: WorkerSnapshot,
    snapshot: InputActivitySnapshot,
  ): void {
    if (process.env.NODE_ENV === 'production') return;
    if (value.type !== 'heartbeat') return;
    const now = Date.now();
    if (now - this.lastCallbackLogAt < 10000) return;
    this.lastCallbackLogAt = now;
    console.debug('[Esta Desktop] Numeric input counter callback heartbeat', {
      hooksAlive: value.hooksAlive === true,
      keyboardCallbackCount: value.keyboardCallbackCount ?? 0,
      mouseCallbackCount: value.mouseCallbackCount ?? 0,
      wheelCallbackCount: value.wheelCallbackCount ?? 0,
      keyboardCount: snapshot.keyboardCount,
      mouseClickCount: snapshot.mouseClickCount,
      mouseMoveCount: snapshot.mouseMoveCount,
      scrollCount: snapshot.scrollCount,
    });
  }

  private logSnapshot(snapshot: InputActivitySnapshot): void {
    if (process.env.NODE_ENV === 'production') return;
    const total =
      snapshot.keyboardCount +
      snapshot.mouseClickCount +
      snapshot.mouseMoveCount +
      snapshot.scrollCount;
    if (total <= 0) return;
    const now = Date.now();
    if (now - this.lastSnapshotLogAt < snapshotLogThrottleMs) return;
    this.lastSnapshotLogAt = now;
    console.debug('[Esta Desktop] Numeric input counter aggregate incremented', snapshot);
  }
}

function safeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}
