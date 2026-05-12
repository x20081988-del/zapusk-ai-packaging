import fs from 'node:fs';
import path from 'node:path';
import { env } from '../env.js';

// File storage abstraction — local now, S3 later. Swap the implementation
// without touching routes; the interface is intentionally single-method.

export interface Storage {
  saveBuffer(relativePath: string, data: Buffer): Promise<string>;
  resolvePath(relativePath: string): string;
  remove(relativePath: string): Promise<void>;
}

class LocalStorage implements Storage {
  private root = path.resolve(env.UPLOADS_DIR);

  constructor() {
    fs.mkdirSync(this.root, { recursive: true });
  }

  async saveBuffer(relativePath: string, data: Buffer): Promise<string> {
    const full = path.join(this.root, relativePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, data);
    return relativePath;
  }

  resolvePath(relativePath: string): string {
    return path.join(this.root, relativePath);
  }

  async remove(relativePath: string): Promise<void> {
    const full = path.join(this.root, relativePath);
    try {
      await fs.promises.unlink(full);
    } catch {
      // ignore — already gone
    }
  }
}

export const storage: Storage = new LocalStorage();
