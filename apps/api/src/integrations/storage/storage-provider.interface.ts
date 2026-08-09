export interface UploadResult {
  url: string;
  path: string;
}

/**
 * Contrato de almacenamiento de imágenes (galería, productos, etc.).
 * Permite intercambiar disco local por Supabase Storage sin tocar la lógica.
 */
export interface StorageProvider {
  readonly name: string;
  upload(file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
  }): Promise<UploadResult>;
}

export const STORAGE_PROVIDER = Symbol("STORAGE_PROVIDER");
