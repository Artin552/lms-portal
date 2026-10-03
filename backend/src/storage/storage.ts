import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { config } from '../config';

/**
 * Абстракция файлового хранилища. Сейчас — локальная папка uploads/.
 * Для перехода на S3 достаточно реализовать этот интерфейс (put/get/remove)
 * и вернуть новую реализацию из createStorage().
 */
export interface FileStorage {
  put(data: Buffer, originalName: string): Promise<string>;
  get(key: string): Promise<Readable>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
}

class LocalStorage implements FileStorage {
  constructor(private root: string) {
    fs.mkdirSync(root, { recursive: true });
  }

  /** Ключ содержит только безопасные символы — имя пользователя в путь не попадает */
  private resolve(key: string): string {
    if (!/^[a-z0-9]{2}\/[a-f0-9-]+(\.[a-z0-9]{1,10})?$/.test(key)) throw new Error('Некорректный ключ файла');
    return path.join(this.root, key);
  }

  async put(data: Buffer, originalName: string): Promise<string> {
    const ext = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 11);
    const id = crypto.randomUUID();
    const key = `${id.slice(0, 2)}/${id}${ext.length > 1 ? ext : ''}`;
    const full = this.resolve(key);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, data);
    return key;
  }

  async get(key: string): Promise<Readable> {
    return fs.createReadStream(this.resolve(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.promises.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async remove(key: string): Promise<void> {
    await fs.promises.rm(this.resolve(key), { force: true });
  }
}

export function createStorage(): FileStorage {
  return new LocalStorage(config.uploadDir);
}

export const storage = createStorage();
