import {
  BadRequestException,
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
import {
  IsBoolean,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
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

/**
 * Datos de contacto y ubicación del local. Los campos de texto admiten `null`
 * para poder borrarlos desde el panel; `lat`/`lng` sólo se aceptan como par
 * (ver `updateContacto`) para no dejar una ubicación a medias.
 */
class UpdateContactoDto {
  @IsOptional() @IsString() @MaxLength(200) direccion?: string | null;
  @IsOptional() @IsString() @MaxLength(50) telefono?: string | null;
  @IsOptional() @IsString() @MaxLength(50) whatsapp?: string | null;
  @IsOptional() @IsString() @MaxLength(120) email?: string | null;
  @IsOptional() @IsString() @MaxLength(200) instagram?: string | null;
  @IsOptional() @IsString() @MaxLength(200) facebook?: string | null;
  @IsOptional() @IsString() @MaxLength(500) mapsUrl?: string | null;
  @IsOptional() @IsLatitude() lat?: number | null;
  @IsOptional() @IsLongitude() lng?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(19) mapZoom?: number | null;
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
    // Se exponen sólo los campos que la landing necesita (no el id ni updatedAt).
    const contactoPublico = contacto
      ? {
          direccion: contacto.direccion,
          telefono: contacto.telefono,
          whatsapp: contacto.whatsapp,
          email: contacto.email,
          instagram: contacto.instagram,
          facebook: contacto.facebook,
          mapsUrl: contacto.mapsUrl,
          lat: contacto.lat,
          lng: contacto.lng,
          mapZoom: contacto.mapZoom,
        }
      : null;
    return {
      contenido: contenidoMap,
      galeria,
      testimonios,
      horarios,
      contacto: contactoPublico,
    };
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

  async updateContacto(dto: UpdateContactoDto) {
    // La coordenada es un par: o vienen las dos, o ninguna. Enviar sólo una
    // dejaría el mapa apuntando a un punto inventado.
    const tieneLat = dto.lat !== undefined;
    const tieneLng = dto.lng !== undefined;
    if (tieneLat !== tieneLng) {
      throw new BadRequestException(
        "Enviá latitud y longitud juntas para mover la ubicación.",
      );
    }
    // Descarta las claves ausentes para no pisar con `undefined` lo ya guardado.
    const data = Object.fromEntries(
      Object.entries(dto).filter(([, v]) => v !== undefined),
    );
    const existing = await this.prisma.configContacto.findFirst();
    if (existing) {
      return this.prisma.configContacto.update({
        where: { id: existing.id },
        data,
      });
    }
    return this.prisma.configContacto.create({ data });
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
  updateContacto(@Body() dto: UpdateContactoDto) {
    return this.svc.updateContacto(dto);
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
