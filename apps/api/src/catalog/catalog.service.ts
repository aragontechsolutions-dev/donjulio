import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateCategoriaDto,
  CreateProductoDto,
  UpdateCategoriaDto,
  UpdateProductoDto,
} from "./catalog.dto";

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

  private async ensureCategoria(id: string) {
    const c = await this.prisma.categoria.findUnique({ where: { id } });
    if (!c) throw new NotFoundException("Categoría no encontrada");
  }

  private async ensureProducto(id: string) {
    const p = await this.prisma.producto.findUnique({ where: { id } });
    if (!p) throw new NotFoundException("Producto no encontrado");
  }
}
