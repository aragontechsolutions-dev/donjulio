import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { IsBoolean, IsInt, IsOptional, IsString } from "class-validator";
import { UserRole } from "@donjulio/shared";
import { PrismaService } from "../prisma/prisma.service";
import { Public, Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";

class CreateGaleriaDto {
  @IsString() imagenUrl!: string;
  @IsOptional() @IsString() titulo?: string;
  @IsOptional() @IsInt() orden?: number;
}

class UpdateGaleriaDto {
  @IsOptional() @IsString() titulo?: string | null;
  @IsOptional() @IsInt() orden?: number;
  @IsOptional() @IsBoolean() activa?: boolean;
}

@Injectable()
class CmsService {
  constructor(private prisma: PrismaService) {}

  /** Devuelve todo el contenido editable de la landing en un solo payload. */
  async landing() {
    const [contenido, galeria, testimonios, horarios, contacto] =
      await Promise.all([
        this.prisma.contenidoLanding.findMany(),
        this.prisma.galeria.findMany({
          where: { activa: true },
          orderBy: { orden: "asc" },
        }),
        this.prisma.testimonio.findMany({
          where: { aprobado: true },
          orderBy: { orden: "asc" },
        }),
        this.prisma.horario.findMany({ orderBy: { diaSemana: "asc" } }),
        this.prisma.configContacto.findFirst(),
      ]);

    const contenidoMap = Object.fromEntries(
      contenido.map((c) => [c.clave, c.valor]),
    );
    return { contenido: contenidoMap, galeria, testimonios, horarios, contacto };
  }

  /** Upsert de un bloque de texto del CMS por clave. */
  setContenido(clave: string, valor: string) {
    return this.prisma.contenidoLanding.upsert({
      where: { clave },
      create: { clave, valor },
      update: { valor },
    });
  }

  // ---------- Galería ----------
  /** Todas las fotos (incluidas las ocultas) para el panel. */
  listGaleria() {
    return this.prisma.galeria.findMany({ orderBy: { orden: "asc" } });
  }

  async addGaleria(dto: CreateGaleriaDto) {
    const ultima = await this.prisma.galeria.findFirst({ orderBy: { orden: "desc" } });
    return this.prisma.galeria.create({
      data: { ...dto, orden: dto.orden ?? (ultima?.orden ?? 0) + 1 },
    });
  }

  async updateGaleria(id: string, dto: UpdateGaleriaDto) {
    const f = await this.prisma.galeria.findUnique({ where: { id } });
    if (!f) throw new NotFoundException("Foto no encontrada");
    return this.prisma.galeria.update({ where: { id }, data: dto });
  }

  async removeGaleria(id: string) {
    const f = await this.prisma.galeria.findUnique({ where: { id } });
    if (!f) throw new NotFoundException("Foto no encontrada");
    await this.prisma.galeria.delete({ where: { id } });
    return { ok: true };
  }

  updateContacto(data: Record<string, unknown>) {
    return this.prisma.configContacto.findFirst().then((existing) => {
      if (existing) {
        return this.prisma.configContacto.update({
          where: { id: existing.id },
          data,
        });
      }
      return this.prisma.configContacto.create({ data });
    });
  }
}

@Controller("cms")
class CmsController {
  constructor(private readonly svc: CmsService) {}

  @Public()
  @Get("landing")
  landing() {
    return this.svc.landing();
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Put("contenido")
  setContenido(@Body() body: { clave: string; valor: string }) {
    return this.svc.setContenido(body.clave, body.valor);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Put("contacto")
  updateContacto(@Body() body: Record<string, unknown>) {
    return this.svc.updateContacto(body);
  }

  // ---------- Galería (admin) ----------
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get("galeria")
  listGaleria() {
    return this.svc.listGaleria();
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post("galeria")
  addGaleria(@Body() dto: CreateGaleriaDto) {
    return this.svc.addGaleria(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch("galeria/:id")
  updateGaleria(@Param("id") id: string, @Body() dto: UpdateGaleriaDto) {
    return this.svc.updateGaleria(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete("galeria/:id")
  removeGaleria(@Param("id") id: string) {
    return this.svc.removeGaleria(id);
  }
}

@Module({
  controllers: [CmsController],
  providers: [CmsService],
})
export class CmsModule {}
