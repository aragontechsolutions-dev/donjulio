import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { IsEnum, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { AuthUser, MermaMotivo, StockMovementType, UserRole } from "@donjulio/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CurrentUser, Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";
import { InventoryModule } from "../inventory/inventory.module";
import { InventoryService } from "../inventory/inventory.service";

const num = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : typeof d === "number" ? d : d.toNumber();

class CreateMermaDto {
  @IsOptional() @IsString() productoId?: string;
  @IsOptional() @IsString() insumoId?: string;
  @IsOptional() @IsString() productionLotId?: string;
  @IsEnum(MermaMotivo) motivo!: MermaMotivo;
  @IsNumber() @Min(0) cantidad!: number;
  @IsOptional() @IsNumber() @Min(0) costo?: number;
}

@Injectable()
export class MermasService {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
  ) {}

  list() {
    return this.prisma.merma.findMany({
      orderBy: { createdAt: "desc" },
      include: { producto: true, insumo: true },
      take: 200,
    });
  }

  async create(dto: CreateMermaDto, usuarioId?: string) {
    let costo = dto.costo ?? 0;

    // Si la merma es de un insumo, descuenta stock y calcula el costo.
    if (dto.insumoId) {
      const insumo = await this.prisma.insumo.findUnique({
        where: { id: dto.insumoId },
      });
      if (insumo) {
        if (dto.costo == null) costo = num(insumo.costoUnitario) * dto.cantidad;
        await this.inventory.applyMovement(
          dto.insumoId,
          StockMovementType.MERMA,
          -dto.cantidad,
          { costoUnitario: num(insumo.costoUnitario), motivo: `Merma: ${dto.motivo}`, usuarioId },
        );
      }
    }

    return this.prisma.merma.create({
      data: {
        productoId: dto.productoId,
        insumoId: dto.insumoId,
        productionLotId: dto.productionLotId,
        motivo: dto.motivo,
        cantidad: dto.cantidad,
        costo,
        usuarioId,
      },
    });
  }
}

@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.PRODUCCION, UserRole.CAJERO)
@Controller("admin/mermas")
class MermasController {
  constructor(private readonly svc: MermasService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Post()
  create(@Body() dto: CreateMermaDto, @CurrentUser() user: AuthUser) {
    return this.svc.create(dto, user.id);
  }
}

@Module({
  imports: [InventoryModule],
  controllers: [MermasController],
  providers: [MermasService],
  exports: [MermasService],
})
export class MermasModule {}
