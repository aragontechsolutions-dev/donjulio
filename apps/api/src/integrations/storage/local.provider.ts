import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { StorageProvider, UploadResult } from "./storage-provider.interface";

/**
 * Guarda las imágenes en disco (carpeta `uploads/`) y las sirve vía la ruta
 * estática `/uploads` (ver main.ts). Ideal para desarrollo. Devuelve una URL
 * absoluta para que funcione desde cualquier frontend (web/PWA).
 */
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  readonly name = "local";
  private readonly dir = join(process.cwd(), "uploads");

  constructor(private readonly config: ConfigService) {}

  async upload(file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
  }): Promise<UploadResult> {
    await mkdir(this.dir, { recursive: true });
    const name = `${randomUUID()}${extname(file.originalname) || ".bin"}`;
    await writeFile(join(this.dir, name), file.buffer);
    const base =
      this.config.get<string>("PUBLIC_UPLOADS_BASE_URL") ??
      `http://localhost:${this.config.get<number>("API_PORT", 3000)}`;
    return { url: `${base}/uploads/${name}`, path: name };
  }
}
