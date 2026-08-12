import {
  Controller,
  FileTypeValidator,
  Inject,
  Injectable,
  MaxFileSizeValidator,
  Module,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FileInterceptor } from "@nestjs/platform-express";
import { UserRole } from "@donjulio/shared";
import { Roles } from "../../auth/decorators";
import { RolesGuard } from "../../auth/guards";
import {
  StorageProvider,
  STORAGE_PROVIDER,
  UploadResult,
} from "./storage-provider.interface";
import { LocalStorageProvider } from "./local.provider";
import { SupabaseStorageProvider } from "./supabase.provider";

@Injectable()
export class StorageService {
  constructor(@Inject(STORAGE_PROVIDER) private readonly provider: StorageProvider) {}

  upload(file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
  }): Promise<UploadResult> {
    return this.provider.upload(file);
  }
}

// Límites de subida de imágenes (validados en front y back).
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_IMAGE_TYPES = /^(image\/jpeg|image\/png|image\/webp|image\/gif)$/;

@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.PRODUCCION)
@Controller("admin/storage")
class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post("upload")
  // limits.fileSize corta la subida en memoria antes de bufferizar archivos enormes.
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [
          new MaxFileSizeValidator({
            maxSize: MAX_UPLOAD_BYTES,
            message: "La imagen supera el máximo de 5 MB.",
          }),
          new FileTypeValidator({ fileType: ALLOWED_IMAGE_TYPES }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.storage.upload(file);
  }
}

@Module({
  controllers: [StorageController],
  providers: [
    StorageService,
    LocalStorageProvider,
    SupabaseStorageProvider,
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService, LocalStorageProvider, SupabaseStorageProvider],
      useFactory: (
        config: ConfigService,
        local: LocalStorageProvider,
        supa: SupabaseStorageProvider,
      ) => (config.get("STORAGE_PROVIDER") === "supabase" ? supa : local),
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
