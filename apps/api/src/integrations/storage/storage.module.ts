import {
  Controller,
  Inject,
  Injectable,
  Module,
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

@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.PRODUCCION)
@Controller("admin/storage")
class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post("upload")
  @UseInterceptors(FileInterceptor("file"))
  upload(@UploadedFile() file: Express.Multer.File) {
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
