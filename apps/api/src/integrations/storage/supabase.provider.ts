import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
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

  /**
   * Asegura que el bucket exista (público). Si falta, lo crea con service_role.
   * Evita el 500 típico de "Bucket not found" cuando aún no se creó a mano.
   */
  private async ensureBucket(client: SupabaseClient): Promise<void> {
    const { data } = await client.storage.getBucket(this.bucket);
    if (data) return;
    const { error } = await client.storage.createBucket(this.bucket, {
      public: true,
      fileSizeLimit: "5MB",
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    });
    // Si otro request lo creó en paralelo, ignoramos el "already exists".
    if (error && !/exist/i.test(error.message)) {
      this.logger.error(`No se pudo crear el bucket "${this.bucket}": ${error.message}`);
      throw new ServiceUnavailableException(
        `No se pudo preparar el almacenamiento de imágenes (bucket "${this.bucket}"). Revisá SUPABASE_STORAGE_BUCKET y la service_role key.`,
      );
    }
    this.logger.log(`Bucket de Storage "${this.bucket}" creado (público).`);
  }

  async upload(file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
  }): Promise<UploadResult> {
    const client = this.getClient();
    await this.ensureBucket(client);
    const path = `${new Date().getFullYear()}/${randomUUID()}${extname(file.originalname) || ".bin"}`;
    const { error } = await client.storage
      .from(this.bucket)
      .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
    if (error) {
      this.logger.error(`Error subiendo a Supabase Storage: ${error.message}`);
      throw new ServiceUnavailableException(
        `No se pudo subir la imagen a Supabase Storage: ${error.message}`,
      );
    }
    const { data } = client.storage.from(this.bucket).getPublicUrl(path);
    return { url: data.publicUrl, path };
  }
}
