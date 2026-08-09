import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { StorageProvider, UploadResult } from "./storage-provider.interface";

/**
 * Sube imágenes a Supabase Storage. Requiere:
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY (sólo backend; nunca exponer al cliente)
 *  - SUPABASE_STORAGE_BUCKET (bucket público, ej. "donjulio")
 */
@Injectable()
export class SupabaseStorageProvider implements StorageProvider {
  readonly name = "supabase";
  private readonly logger = new Logger(SupabaseStorageProvider.name);
  private client: SupabaseClient | null = null;

  constructor(private readonly config: ConfigService) {}

  private get bucket() {
    return this.config.get<string>("SUPABASE_STORAGE_BUCKET", "donjulio");
  }

  private getClient(): SupabaseClient {
    if (this.client) return this.client;
    const url = this.config.get<string>("SUPABASE_URL");
    const key = this.config.get<string>("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) {
      throw new Error(
        "SupabaseStorageProvider requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.",
      );
    }
    this.client = createClient(url, key, { auth: { persistSession: false } });
    return this.client;
  }

  async upload(file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
  }): Promise<UploadResult> {
    const path = `${new Date().getFullYear()}/${randomUUID()}${extname(file.originalname) || ".bin"}`;
    const { error } = await this.getClient()
      .storage.from(this.bucket)
      .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
    if (error) {
      this.logger.error(`Error subiendo a Supabase Storage: ${error.message}`);
      throw new Error(error.message);
    }
    const { data } = this.getClient().storage.from(this.bucket).getPublicUrl(path);
    return { url: data.publicUrl, path };
  }
}
