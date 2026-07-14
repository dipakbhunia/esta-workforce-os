import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { desktopCapturer, nativeImage, screen } from 'electron';
import type {
  QueuedScreenshotCapture,
  ScreenshotCaptureContext,
  ScreenshotFilePayload,
} from '../../shared/contracts';

const DEFAULT_MAX_CAPTURE_WIDTH = 1600;
const DEFAULT_JPEG_QUALITY = 72;
const DEFAULT_MAX_QUEUE_ITEMS = 200;
const DEFAULT_MAX_QUEUE_BYTES = 200 * 1024 * 1024;
const FAILED_RETRY_MS = 5 * 60 * 1000;

export interface ScreenshotQueueOptions {
  maxCaptureWidth?: number;
  jpegQuality?: number;
  maxQueueItems?: number;
  maxQueueBytes?: number;
}

export class ScreenshotQueue {
  private readonly queuePath: string;
  private readonly captureDirectory: string;
  private locked = false;

  constructor(
    private readonly dataDirectory: string,
    private readonly isScreenLocked: () => boolean,
    private readonly options: ScreenshotQueueOptions = {},
  ) {
    this.captureDirectory = join(dataDirectory, 'screenshots', 'captures');
    this.queuePath = join(dataDirectory, 'screenshots', 'queue.json');
  }

  async capture(context: ScreenshotCaptureContext): Promise<QueuedScreenshotCapture | null> {
    if (this.locked || this.isScreenLocked()) return null;
    this.locked = true;
    try {
      await mkdir(this.captureDirectory, { recursive: true });
      if (!(await this.hasQueueCapacity())) {
        console.warn('[Esta Desktop] Screenshot capture skipped because the local queue is full.');
        return null;
      }
      const display = screen.getPrimaryDisplay();
      const maxCaptureWidth = this.options.maxCaptureWidth ?? DEFAULT_MAX_CAPTURE_WIDTH;
      const jpegQuality = this.options.jpegQuality ?? DEFAULT_JPEG_QUALITY;
      const width = Math.min(maxCaptureWidth, display.size.width);
      const height = Math.round(width * (display.size.height / display.size.width));
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width, height },
      });
      const source = sources[0];
      if (!source || source.thumbnail.isEmpty()) return null;

      const capturedAt = new Date().toISOString();
      const captureId = crypto.randomUUID();
      const image = source.thumbnail.getSize().width > maxCaptureWidth
        ? source.thumbnail.resize({ width: maxCaptureWidth, quality: 'best' })
        : source.thumbnail;
      const buffer = image.toJPEG(jpegQuality);
      const size = nativeImage.createFromBuffer(buffer).getSize();
      const filePath = join(this.captureDirectory, `${captureId}.jpg`);
      await writeFile(filePath, buffer);

      const item: QueuedScreenshotCapture = {
        id: captureId,
        clientCaptureId: captureId,
        deviceId: context.deviceId,
        filePath,
        capturedAt,
        mimeType: 'image/jpeg',
        width: size.width,
        height: size.height,
        sizeBytes: buffer.byteLength,
        checksum: createHash('sha256').update(buffer).digest('hex'),
        attempts: 0,
        nextAttemptAt: null,
        metadata: {
          attendanceId: context.attendanceId ?? null,
          foreground: context.foreground ?? null,
          privacy:
            'Captured only while authenticated and punched in. No keystrokes, clipboard, passwords, or browser page content are collected.',
        },
      };
      await this.writeQueue([...(await this.listAll()), item]);
      return item;
    } finally {
      this.locked = false;
    }
  }

  async listQueue(): Promise<QueuedScreenshotCapture[]> {
    const now = Date.now();
    return (await this.listAll()).filter(
      (item) => !item.nextAttemptAt || new Date(item.nextAttemptAt).getTime() <= now,
    );
  }

  async readFilePayload(id: string): Promise<ScreenshotFilePayload> {
    const item = (await this.listAll()).find((queued) => queued.id === id);
    if (!item) throw new Error('Screenshot queue item not found');
    let buffer: Buffer;
    try {
      buffer = await readFile(item.filePath);
    } catch (error) {
      console.warn('[Esta Desktop] Removing screenshot queue item with missing local file.');
      await this.markUploaded(id);
      throw new Error('Screenshot queue file unavailable');
    }
    if (buffer.byteLength === 0) {
      console.warn('[Esta Desktop] Removing screenshot queue item with empty local file.');
      await this.markUploaded(id);
      throw new Error('Screenshot queue file is empty');
    }
    return { item, base64: buffer.toString('base64') };
  }

  async markUploaded(id: string): Promise<void> {
    const all = await this.listAll();
    const item = all.find((queued) => queued.id === id);
    if (item) await rm(item.filePath, { force: true });
    await this.writeQueue(all.filter((queued) => queued.id !== id));
  }

  async markFailed(id: string, retryAfterMs = FAILED_RETRY_MS): Promise<void> {
    const all = await this.listAll();
    await this.writeQueue(
      all.map((item) =>
        item.id === id
          ? {
              ...item,
              attempts: item.attempts + 1,
              nextAttemptAt: new Date(Date.now() + retryAfterMs).toISOString(),
            }
          : item,
      ),
    );
  }

  private async listAll(): Promise<QueuedScreenshotCapture[]> {
    try {
      const raw = await readFile(this.queuePath, 'utf8');
      const parsed = JSON.parse(raw) as QueuedScreenshotCapture[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async writeQueue(items: QueuedScreenshotCapture[]): Promise<void> {
    await mkdir(dirname(this.queuePath), { recursive: true });
    await writeFile(this.queuePath, JSON.stringify(items, null, 2));
  }

  private async hasQueueCapacity(): Promise<boolean> {
    const items = await this.listAll();
    let totalBytes = 0;
    const existing: QueuedScreenshotCapture[] = [];
    for (const item of items) {
      try {
        const info = await stat(item.filePath);
        totalBytes += info.size;
        existing.push(item);
      } catch {
        // Drop queue metadata if the backing file was manually removed.
      }
    }
    if (existing.length !== items.length) {
      await this.writeQueue(existing);
    }
    const maxQueueItems = this.options.maxQueueItems ?? DEFAULT_MAX_QUEUE_ITEMS;
    const maxQueueBytes = this.options.maxQueueBytes ?? DEFAULT_MAX_QUEUE_BYTES;
    return existing.length < maxQueueItems && totalBytes < maxQueueBytes;
  }
}
