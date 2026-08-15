import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { calcularOctogonos } from "@donjulio/shared";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateCategoriaDto,
  CreateProductoDto,
  UpdateCategoriaDto,
  UpdateProductoDto,
  UpsertRotuladoDto,
} from "./catalog.dto";

/** Decimal de Prisma → número (o null) para los cálculos de rotulado. */
const num = (d: Prisma.Decimal | number | null | undefined): number | null =>
  d == null ? null : typeof d === "number" ? d : Number(d);

@Injectable()
export class CatalogService {
  constructor(private prisma: PrismaService) {}

  // ---- Catálogo público (menú agrupado por categoría) ----
  async publicMenu() {
    return this.prisma.categoria.findMany({
      where: { activa: true },
      orderBy: { orden: "asc" },
      include: {
        productos: {
          where: { disponible: true },
          orderBy: { nombre: "asc" },
          // Sellos frontales para mostrarlos en la carta pública.
          include: {
            rotulado: {
              select: {
                excesoAzucares: true,
                excesoSodio: true,
                excesoGrasas: true,
                excesoGrasasSat: true,
                alergenos: true,
              },
            },
          },
        },
      },
    });
  }

  async destacados() {
    return this.prisma.producto.findMany({
      where: { destacado: true, disponible: true },
      orderBy: { nombre: "asc" },
    });
  }

  // ---- Categorías (admin) ----
  listCategorias() {
    return this.prisma.categoria.findMany({ orderBy: { orden: "asc" } });
  }

  createCategoria(dto: CreateCategoriaDto) {
    return this.prisma.categoria.create({ data: dto });
  }

  async updateCategoria(id: string, dto: UpdateCategoriaDto) {
    await this.ensureCategoria(id);
    return this.prisma.categoria.update({ where: { id }, data: dto });
  }

  async removeCategoria(id: string) {
    await this.ensureCategoria(id);
    return this.prisma.categoria.delete({ where: { id } });
  }

  // ---- Productos (admin) ----
  listProductos() {
    return this.prisma.producto.findMany({
      orderBy: { nombre: "asc" },
      include: { categoria: true },
    });
  }

  createProducto(dto: CreateProductoDto) {
    return this.prisma.producto.create({ data: dto });
  }

  async updateProducto(id: string, dto: UpdateProductoDto) {
    await this.ensureProducto(id);
    return this.prisma.producto.update({ where: { id }, data: dto });
  }

  async removeProducto(id: string) {
    await this.ensureProducto(id);
    return this.prisma.producto.delete({ where: { id } });
  }

  // ---- Rotulado frontal (Decreto 272/018) ----
  async getRotulado(productoId: string) {
    await this.ensureProducto(productoId);
    return this.prisma.rotuladoProducto.findUnique({ where: { productoId } });
  }

  /**
   * Crea o actualiza el rotulado. Con `autoOctogonos` (por defecto) los sellos
   * se derivan de los valores nutricionales declarados; si se desactiva, se
   * respetan los que se marquen a mano.
   */
  async upsertRotulado(productoId: string, dto: UpsertRotuladoDto) {
    await this.ensureProducto(productoId);
    const actual = await this.prisma.rotuladoProducto.findUnique({ where: { productoId } });
    const data = { ...actual, ...dto };

    let sellos = {
      excesoAzucares: data.excesoAzucares ?? false,
      excesoSodio: data.excesoSodio ?? false,
      excesoGrasas: data.excesoGrasas ?? false,
      excesoGrasasSat: data.excesoGrasasSat ?? false,
    };
    if (data.autoOctogonos !== false) {
      sellos = calcularOctogonos(
        {
          azucares: num(data.azucares),
          sodioMg: num(data.sodioMg),
          grasasTotales: num(data.grasasTotales),
          grasasSaturadas: num(data.grasasSaturadas),
        },
        data.esLiquido ?? false,
      );
    }
    const payload = { ...dto, ...sellos };

    const rotulado = await this.prisma.rotuladoProducto.upsert({
      where: { productoId },
      create: { productoId, ...payload },
      update: payload,
    });

    // Mantiene sincronizado el flag del producto (se usa en la web y el POS).
    const requiereOctogono =
      sellos.excesoAzucares || sellos.excesoSodio || sellos.excesoGrasas || sellos.excesoGrasasSat;
    await this.prisma.producto.update({ where: { id: productoId }, data: { requiereOctogono } });

    return rotulado;
  }

  private async ensureCategoria(id: string) {
    const c = await this.prisma.categoria.findUnique({ where: { id } });
    if (!c) throw new NotFoundException("Categoría no encontrada");
  }

  private async ensureProducto(id: string) {
    const p = await this.prisma.producto.findUnique({ where: { id } });
    if (!p) throw new NotFoundException("Producto no encontrado");
  }
}
