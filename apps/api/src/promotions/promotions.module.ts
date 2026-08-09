import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from "class-validator";
import { UserRole } from "@donjulio/shared";
import { PrismaService } from "../prisma/prisma.service";
import { Public, Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";

enum PromoTipo {
  PORCENTAJE = "PORCENTAJE",
  MONTO_FIJO = "MONTO_FIJO",
  PRECIO_FIJO = "PRECIO_FIJO",
}

class CreatePromocionDto {
  @IsString() nombre!: string;
  @IsOptional() @IsString() descripcion?: string;
  @IsOptional() @IsString() productoId?: string;
  @IsOptional() @IsString() categoriaId?: string;
  @IsEnum(PromoTipo) tipoDescuento!: PromoTipo;
  @IsNumber() valor!: number;
  @IsDateString() vigenciaDesde!: string;
  @IsDateString() vigenciaHasta!: string;
}

@Injectable()
class PromotionsService {
  constructor(private prisma: PrismaService) {}

  /** Promociones vigentes hoy (para la landing). */
  vigentes() {
    const now = new Date();
    return this.prisma.promocion.findMany({
      where: {
        activa: true,
        vigenciaDesde: { lte: now },
        vigenciaHasta: { gte: now },
      },
      include: { producto: true, categoria: true },
    });
  }

  listAll() {
    return this.prisma.promocion.findMany({ orderBy: { createdAt: "desc" } });
  }

  create(dto: CreatePromocionDto) {
    return this.prisma.promocion.create({
      data: {
        ...dto,
        vigenciaDesde: new Date(dto.vigenciaDesde),
        vigenciaHasta: new Date(dto.vigenciaHasta),
      },
    });
  }

  remove(id: string) {
    return this.prisma.promocion.delete({ where: { id } });
  }
}

@Controller()
class PromotionsController {
  constructor(private readonly svc: PromotionsService) {}

  @Public()
  @Get("promociones")
  vigentes() {
    return this.svc.vigentes();
  }

  @Get("admin/promociones")
  listAll() {
    return this.svc.listAll();
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post("admin/promociones")
  create(@Body() dto: CreatePromocionDto) {
    return this.svc.create(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete("admin/promociones/:id")
  remove(@Param("id") id: string) {
    return this.svc.remove(id);
  }
}

@Module({
  controllers: [PromotionsController],
  providers: [PromotionsService],
})
export class PromotionsModule {}
