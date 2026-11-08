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
  Query,
  UseGuards,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { UserRole } from "@donjulio/shared";
import { PrismaService } from "../prisma/prisma.service";
import { Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";

const num = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : typeof d === "number" ? d : d.toNumber();

class CreateProveedorDto {
  @IsString() @MaxLength(140) nombre!: string;
  @IsOptional() @IsString() @MaxLength(20) rut?: string | null;
  @IsOptional() @IsString() @MaxLength(140) contacto?: string | null;
  @IsOptional() @IsString() @MaxLength(60) telefono?: string | null;
  @IsOptional() @IsEmail({}, { message: "El email no tiene un formato válido." }) email?: string | null;
  @IsOptional() @IsString() @MaxLength(200) direccion?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) notas?: string | null;
  @IsOptional() @IsBoolean() activo?: boolean;
  /** Rubros que se le compran. */
  @IsOptional() @IsArray() @IsString({ each: true }) categoriaIds?: string[];
}

class UpdateProveedorDto extends CreateProveedorDto {
  @IsOptional() @IsString() @MaxLength(140) declare nombre: string;
}

/**
 * Proveedores: a quién se le compra y qué.
 *
 * Lo que se les compra sale de dos lados que ya existían —los insumos de la
 * producción y los productos de reventa— más los rubros declarados a mano,
 * que sirven para el proveedor nuevo al que todavía no se le cargó nada.
 */
@Injectable()
export class ProveedoresService {
  constructor(private prisma: PrismaService) {}

  /** Listado con el conteo de lo que se le compra, para la tabla del panel. */
  async list(incluirInactivos = false) {
    const proveedores = await this.prisma.proveedor.findMany({
      where: incluirInactivos ? {} : { activo: true },
      orderBy: { nombre: "asc" },
      include: {
        categorias: { select: { id: true, nombre: true }, orderBy: { orden: "asc" } },
        _count: { select: { insumos: true, productos: true } },
      },
    });
    return proveedores.map((p) => ({
      ...p,
      insumos: p._count.insumos,
      productos: p._count.productos,
      _count: undefined,
    }));
  }

  /** Ficha completa: sus datos, sus rubros y todo lo que se le compra. */
  async detalle(id: string) {
    const p = await this.prisma.proveedor.findUnique({
      where: { id },
      include: {
        categorias: { select: { id: true, nombre: true }, orderBy: { orden: "asc" } },
        insumos: {
          orderBy: { nombre: "asc" },
          select: { id: true, nombre: true, unidad: true, costoUnitario: true, stockActual: true },
        },
        productos: {
          orderBy: { nombre: "asc" },
          select: {
            id: true,
            nombre: true,
            precio: true,
            costoCompra: true,
            unidadVenta: true,
            disponible: true,
            categoria: { select: { id: true, nombre: true } },
          },
        },
      },
    });
    if (!p) throw new NotFoundException("Proveedor no encontrado");
    return {
      ...p,
      insumos: p.insumos.map((i) => ({
        ...i,
        costoUnitario: num(i.costoUnitario),
        stockActual: num(i.stockActual),
      })),
      productos: p.productos.map((pr) => ({
        ...pr,
        precio: num(pr.precio),
        costoCompra: pr.costoCompra == null ? null : num(pr.costoCompra),
      })),
    };
  }

  create(dto: CreateProveedorDto) {
    const { categoriaIds, ...datos } = dto;
    return this.prisma.proveedor.create({
      data: {
        ...datos,
        nombre: datos.nombre.trim(),
        ...(categoriaIds ? { categorias: { connect: categoriaIds.map((id) => ({ id })) } } : {}),
      },
      include: { categorias: { select: { id: true, nombre: true } } },
    });
  }

  async update(id: string, dto: UpdateProveedorDto) {
    await this.existe(id);
    const { categoriaIds, ...datos } = dto;
    return this.prisma.proveedor.update({
      where: { id },
      data: {
        ...datos,
        ...(datos.nombre ? { nombre: datos.nombre.trim() } : {}),
        // `set` y no `connect`: la pantalla manda la lista completa de rubros.
        ...(categoriaIds ? { categorias: { set: categoriaIds.map((cid) => ({ id: cid })) } } : {}),
      },
      include: { categorias: { select: { id: true, nombre: true } } },
    });
  }

  /**
   * Un proveedor con compras no se borra: se desactiva. Borrarlo dejaría los
   * insumos y productos sin saber de dónde salieron.
   */
  async remove(id: string) {
    await this.existe(id);
    const [insumos, productos] = await Promise.all([
      this.prisma.insumo.count({ where: { proveedorId: id } }),
      this.prisma.producto.count({ where: { proveedorId: id } }),
    ]);
    if (insumos + productos > 0) {
      const partes = [
        insumos ? `${insumos} insumo${insumos === 1 ? "" : "s"}` : "",
        productos ? `${productos} producto${productos === 1 ? "" : "s"}` : "",
      ].filter(Boolean);
      throw new BadRequestException(
        `No se puede borrar: tiene ${partes.join(" y ")} asociados. Desactivalo en su lugar.`,
      );
    }
    await this.prisma.proveedor.delete({ where: { id } });
    return { ok: true };
  }

  private async existe(id: string) {
    const p = await this.prisma.proveedor.findUnique({ where: { id }, select: { id: true } });
    if (!p) throw new NotFoundException("Proveedor no encontrado");
    return p;
  }
}

@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.PRODUCCION)
@Controller("admin/proveedores")
class ProveedoresController {
  constructor(private readonly svc: ProveedoresService) {}

  @Get()
  list(@Query("inactivos") inactivos?: string) {
    return this.svc.list(inactivos === "true");
  }

  @Get(":id")
  detalle(@Param("id") id: string) {
    return this.svc.detalle(id);
  }

  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateProveedorDto) {
    return this.svc.create(dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateProveedorDto) {
    return this.svc.update(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.svc.remove(id);
  }
}

@Module({
  controllers: [ProveedoresController],
  providers: [ProveedoresService],
  exports: [ProveedoresService],
})
export class ProveedoresModule {}
