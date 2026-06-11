import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class JsonFileStore<T extends object> {
  constructor(
    private readonly filePath: string,
    private readonly defaults: T,
  ) {}

  async read(): Promise<T> {
    try {
      const content = await readFile(this.filePath, 'utf8');
      return { ...this.defaults, ...(JSON.parse(content) as Partial<T>) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { ...this.defaults };
      }
      throw error;
    }
  }

  async write(value: T): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(value, null, 2), 'utf8');
    await rename(temporaryPath, this.filePath);
  }

  async update(update: Partial<T>): Promise<T> {
    const current = await this.read();
    const next = { ...current, ...update };
    await this.write(next);
    return next;
  }
}
