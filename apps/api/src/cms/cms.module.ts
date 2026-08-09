import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Put,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@donjulio/shared";
import { PrismaService } from "../prisma/prisma.service";
import { Public, Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";

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
}

@Module({
  controllers: [CmsController],
  providers: [CmsService],
})
export class CmsModule {}
