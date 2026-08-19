import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { calcularOctogonos, IvaRate, ProductoCosteo } from "@donjulio/shared";
import { PrismaService } from "../prisma/prisma.service";
import { RecipesService } from "../recipes/recipes.service";
import { InventoryService } from "../inventory/inventory.service";
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

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Texto → slug para la URL pública: sin acentos, en minúsculas y con guiones.
 * Se genera acá para que el panel no tenga que pedirlo en el formulario.
 */
function aSlug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

@Injectable()
export class CatalogService {
  constructor(
    private prisma: PrismaService,
    private recipes: RecipesService,
    private inventory: InventoryService,
  ) {}

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

  async createCategoria(dto: CreateCategoriaDto) {
    const slug = await this.slugLibre("categoria", dto.slug || aSlug(dto.nombre));
    if (!slug) throw new BadRequestException("El nombre no genera una dirección válida.");
    // Al final de la lista, para que el orden lo decida quien la crea.
    const ultima = await this.prisma.categoria.findFirst({ orderBy: { orden: "desc" } });
    return this.prisma.categoria.create({
      data: { nombre: dto.nombre, slug, orden: dto.orden ?? (ultima?.orden ?? 0) + 1 },
    });
  }

  async updateCategoria(id: string, dto: UpdateCategoriaDto) {
    await this.ensureCategoria(id);
    return this.prisma.categoria.update({ where: { id }, data: dto });
  }

  async removeCategoria(id: string) {
    await this.ensureCategoria(id);
    // Borrarla dejaría productos sin categoría (la relación es obligatoria).
    const enUso = await this.prisma.producto.count({ where: { categoriaId: id } });
    if (enUso > 0) {
      throw new BadRequestException(
        `La categoría tiene ${enUso} producto${enUso === 1 ? "" : "s"}. Movelos a otra o desactivala.`,
      );
    }
    return this.prisma.categoria.delete({ where: { id } });
  }

  // ---- Productos (admin) ----
  async listProductos() {
    const productos = await this.prisma.producto.findMany({
      orderBy: { nombre: "asc" },
      include: {
        categoria: true,
        // La receta identifica al producto como elaborado y de dónde sale su costo.
        receta: { select: { id: true, nombre: true } },
      },
    });
    // Unidades producidas sin vender, para los que se venden de lo horneado.
    const stock = await this.inventory.stockProductos(
      productos.filter((p) => p.controlaStock).map((p) => p.id),
    );
    return productos.map((p) => ({
      ...p,
      stockProducido: p.controlaStock ? (stock.get(p.id) ?? 0) : null,
    }));
  }

  async createProducto(dto: CreateProductoDto) {
    await this.ensureCategoria(dto.categoriaId);
    const slug = await this.slugLibre("producto", dto.slug || aSlug(dto.nombre));
    if (!slug) throw new BadRequestException("El nombre no genera una dirección válida.");
    return this.prisma.producto.create({
      data: { ...dto, slug, ...this.normalizarCosto(dto) },
      include: { categoria: true, receta: { select: { id: true, nombre: true } } },
    });
  }

  async updateProducto(id: string, dto: UpdateProductoDto) {
    const actual = await this.ensureProducto(id);
    if (dto.categoriaId) await this.ensureCategoria(dto.categoriaId);
    const slug = dto.slug
      ? await this.slugLibre("producto", aSlug(dto.slug), id)
      : dto.nombre && dto.nombre !== actual.nombre
        ? await this.slugLibre("producto", aSlug(dto.nombre), id)
        : undefined;
    return this.prisma.producto.update({
      where: { id },
      data: { ...dto, ...(slug ? { slug } : {}), ...this.normalizarCosto(dto) },
      include: { categoria: true, receta: { select: { id: true, nombre: true } } },
    });
  }

  async removeProducto(id: string) {
    await this.ensureProducto(id);
    // Si ya se vendió, borrarlo rompería el histórico de pedidos.
    const vendido = await this.prisma.pedidoItem.count({ where: { productoId: id } });
    if (vendido > 0) {
      throw new BadRequestException(
        "El producto ya tiene ventas registradas. Marcalo como no disponible en vez de borrarlo.",
      );
    }
    return this.prisma.producto.delete({ where: { id } });
  }

  /**
   * El costo de compra sólo aplica a la reventa: si el producto pasa a
   * elaborado, se limpia para que no quede un costo viejo compitiendo con el
   * de la receta.
   */
  private normalizarCosto(dto: CreateProductoDto | UpdateProductoDto) {
    if (dto.esReventa === false) return { costoCompra: null };
    return {};
  }

  /**
   * Costo y rentabilidad de cada producto. El costo sale de la receta si es
   * elaborado, o del costo de compra si es reventa.
   */
  async costeoProductos(): Promise<ProductoCosteo[]> {
    const [productos, costosReceta] = await Promise.all([
      this.prisma.producto.findMany({
        select: { id: true, precio: true, esReventa: true, costoCompra: true, receta: { select: { id: true } } },
      }),
      this.recipes.costoUnitarioDeTodas(),
    ]);

    return productos.map((p) => {
      const precio = num(p.precio) ?? 0;
      const recetaId = p.receta?.id;
      const costoReceta = recetaId ? costosReceta.get(recetaId) : undefined;
      const costoCompra = num(p.costoCompra);

      let origen: ProductoCosteo["origen"] = "SIN_COSTO";
      let costoUnitario: number | null = null;
      if (costoReceta != null && !p.esReventa) {
        origen = "RECETA";
        costoUnitario = costoReceta;
      } else if (costoCompra != null) {
        origen = "COMPRA";
        costoUnitario = costoCompra;
      }

      return {
        productoId: p.id,
        origen,
        costoUnitario,
        precio,
        foodCostPct:
          costoUnitario != null && precio > 0 ? round2((costoUnitario / precio) * 100) : null,
        margen: costoUnitario != null ? round2(precio - costoUnitario) : null,
        ...(recetaId ? { recetaId } : {}),
      };
    });
  }

  /**
   * Devuelve un slug libre, agregando "-2", "-3"… si ya existe. Sin esto, dos
   * productos con nombres parecidos rompen la restricción de unicidad con un
   * error de base que no dice nada.
   */
  private async slugLibre(
    tabla: "producto" | "categoria",
    base: string,
    excluirId?: string,
  ): Promise<string> {
    if (!base) return "";
    const existe = async (slug: string) => {
      const fila =
        tabla === "producto"
          ? await this.prisma.producto.findUnique({ where: { slug }, select: { id: true } })
          : await this.prisma.categoria.findUnique({ where: { slug }, select: { id: true } });
      return fila != null && fila.id !== excluirId;
    };
    if (!(await existe(base))) return base;
    for (let i = 2; i < 100; i++) {
      const intento = `${base}-${i}`;
      if (!(await existe(intento))) return intento;
    }
    return `${base}-${Date.now()}`;
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

  /**
   * Ajusta el IVA de varios productos en una sola transacción.
   *
   * Todo o nada: si un id no existe, no se aplica ninguno. Revisar el catálogo
   * a medias dejaría al usuario sin saber qué quedó cambiado y qué no.
   */
  async ajustarIvaMasivo(productos: { id: string; ivaRate: IvaRate }[]) {
    const ids = productos.map((p) => p.id);
    const existen = await this.prisma.producto.count({ where: { id: { in: ids } } });
    if (existen !== new Set(ids).size) {
      throw new NotFoundException(
        "Alguno de los productos ya no existe. Recargá la pantalla y probá de nuevo.",
      );
    }
    await this.prisma.$transaction(
      productos.map((p) =>
        this.prisma.producto.update({
          where: { id: p.id },
          data: { ivaRate: p.ivaRate },
        }),
      ),
    );
    return { actualizados: productos.length };
  }

  private async ensureCategoria(id: string) {
    const c = await this.prisma.categoria.findUnique({ where: { id } });
    if (!c) throw new NotFoundException("Categoría no encontrada");
  }

  private async ensureProducto(id: string) {
    const p = await this.prisma.producto.findUnique({ where: { id } });
    if (!p) throw new NotFoundException("Producto no encontrado");
    return p;
  }
}
