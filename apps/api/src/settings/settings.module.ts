import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Patch,
  UseGuards,
} from "@nestjs/common";
import { IsBoolean, IsInt, IsOptional, Max, Min } from "class-validator";
import { AuthUser, UserRole } from "@donjulio/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CurrentUser, Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";

/** Minutos de inactividad por rol (0 = sin cierre automático). */
class UpdateSesionDto {
  @IsOptional() @IsInt() @Min(0) @Max(1440) adminMin?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1440) cajeroMin?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1440) produccionMin?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1440) mozoMin?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1440) deliveryMin?: number;
}

const CAMPO_POR_ROL: Record<string, keyof UpdateSesionDto> = {
  [UserRole.ADMIN]: "adminMin",
  [UserRole.CAJERO]: "cajeroMin",
  [UserRole.PRODUCCION]: "produccionMin",
  [UserRole.MOZO]: "mozoMin",
  [UserRole.DELIVERY]: "deliveryMin",
};

/** Definiciones de IVA. Las decide el contador, no el código. */
class UpdateFiscalDto {
  @IsOptional() @IsBoolean() preciosConIvaIncluido?: boolean;
  @IsOptional() @IsBoolean() salonTasaBasica?: boolean;
}

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  /** Config singleton; la crea con los valores por defecto la primera vez. */
  async getSesion() {
    const c = await this.prisma.sesionConfig.findUnique({ where: { id: "default" } });
    return c ?? this.prisma.sesionConfig.create({ data: { id: "default" } });
  }

  async updateSesion(dto: UpdateSesionDto) {
    await this.getSesion();
    return this.prisma.sesionConfig.update({ where: { id: "default" }, data: dto });
  }

  /** Config fiscal singleton, con los valores por defecto la primera vez. */
  async getFiscal() {
    const c = await this.prisma.fiscalConfig.findUnique({ where: { id: "default" } });
    return c ?? this.prisma.fiscalConfig.create({ data: { id: "default" } });
  }

  async updateFiscal(dto: UpdateFiscalDto) {
    await this.getFiscal();
    return this.prisma.fiscalConfig.update({ where: { id: "default" }, data: dto });
  }

  /** Minutos que le aplican al rol del usuario que consulta. */
  async miTimeout(role: string) {
    const cfg = await this.getSesion();
    const campo = CAMPO_POR_ROL[role];
    return { minutos: campo ? ((cfg as Record<string, unknown>)[campo] as number) : 0 };
  }
}

@UseGuards(RolesGuard)
@Controller("admin/config")
class SettingsController {
  constructor(private readonly svc: SettingsService) {}

  /** Cualquier usuario autenticado necesita saber su propio tiempo de sesión. */
  @Get("sesion/mia")
  mia(@CurrentUser() user: AuthUser) {
    return this.svc.miTimeout(user.role);
  }

  @Roles(UserRole.ADMIN)
  @Get("sesion")
  getSesion() {
    return this.svc.getSesion();
  }

  @Roles(UserRole.ADMIN)
  @Patch("sesion")
  updateSesion(@Body() dto: UpdateSesionDto) {
    return this.svc.updateSesion(dto);
  }

  @Roles(UserRole.ADMIN)
  @Get("fiscal")
  getFiscal() {
    return this.svc.getFiscal();
  }

  @Roles(UserRole.ADMIN)
  @Patch("fiscal")
  updateFiscal(@Body() dto: UpdateFiscalDto) {
    return this.svc.updateFiscal(dto);
  }
}

@Module({
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
