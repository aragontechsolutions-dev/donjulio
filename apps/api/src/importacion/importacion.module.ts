import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Injectable,
  MaxFileSizeValidator,
  Module,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { IsBoolean, IsOptional } from "class-validator";
import { Transform } from "class-transformer";
import {
  filasDeCsv,
  IvaRate,
  lineaCsv,
  numeroDeTexto,
  siNo,
  UnidadVenta,
  UserRole,
} from "@donjulio/shared";
import { PrismaService } from "../prisma/prisma.service";
import { Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";

/** Un CSV de catálogo no pesa: más que esto es otra cosa. */
const MAX_CSV_BYTES = 2 * 1024 * 1024;
/** Tope de filas por archivo, para no colgar la API con un pegote. */
const MAX_FILAS = 2000;

/** Columnas de la plantilla, en orden. */
const COLUMNAS = [
  "nombre",
  "categoria",
  "precio",
  "iva",
  "unidadventa",
  "descripcion",
  "esreventa",
  "costocompra",
  "controlastock",
  "disponible",
  "destacado",
  "proveedor",
] as const;

/** Encabezados tal cual se escriben en el archivo que descarga el usuario. */
const ENCABEZADOS = [
  "nombre",
  "categoria",
  "precio",
  "iva",
  "unidadVenta",
  "descripcion",
  "esReventa",
  "costoCompra",
  "controlaStock",
  "disponible",
  "destacado",
  "proveedor",
];

const EJEMPLOS = [
  ["Pan de campo", "Panes", "120", "MINIMA", "UNIDAD", "Masa madre, corteza crocante", "no", "", "si", "si", "no", ""],
  ["Bizcochos de grasa", "Bizcochos", "420", "MINIMA", "KG", "Precio por kilo", "no", "", "si", "si", "no", ""],
  ["Agua mineral 500ml", "Cafetería", "70", "BASICA", "UNIDAD", "", "si", "38", "no", "si", "no", "Distribuidora del Este"],
];

/** Sinónimos aceptados para la tasa de IVA. */
const IVA_ALIAS: Record<string, IvaRate> = {
  basica: IvaRate.BASICA,
  basico: IvaRate.BASICA,
  "22": IvaRate.BASICA,
  "22%": IvaRate.BASICA,
  minima: IvaRate.MINIMA,
  minimo: IvaRate.MINIMA,
  "10": IvaRate.MINIMA,
  "10%": IvaRate.MINIMA,
  exento: IvaRate.EXENTO,
  exenta: IvaRate.EXENTO,
  "0": IvaRate.EXENTO,
  "0%": IvaRate.EXENTO,
};
const UNIDAD_ALIAS: Record<string, UnidadVenta> = {
  unidad: UnidadVenta.UNIDAD,
  u: UnidadVenta.UNIDAD,
  unidades: UnidadVenta.UNIDAD,
  kg: UnidadVenta.KG,
  kilo: UnidadVenta.KG,
  kilos: UnidadVenta.KG,
  peso: UnidadVenta.KG,
  balanza: UnidadVenta.KG,
};

const plano = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Mismo slug que usa el catálogo, para poder reconocer un producto ya cargado. */
const aSlug = (s: string) =>
  plano(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

type Accion = "crear" | "actualizar" | "error";

interface FilaRevisada {
  fila: number;
  accion: Accion;
  nombre: string;
  categoria: string;
  precio: number | null;
  iva: IvaRate | null;
  unidadVenta: UnidadVenta | null;
  proveedor: string | null;
  /** Qué se va a crear además del producto (categoría o proveedor nuevos). */
  avisos: string[];
  errores: string[];
}

class ImportarDto {
  /** Sin `aplicar`, sólo se revisa y se devuelve la vista previa. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  aplicar?: boolean;
}

/**
 * Carga masiva de productos desde una planilla.
 *
 * Son dos pasos a propósito: primero se revisa el archivo y se devuelve fila
 * por fila qué va a pasar, y recién con `aplicar` se escribe. Cargar un
 * catálogo entero a ciegas y descubrir después que la mitad quedó con la
 * categoría equivocada no tiene vuelta atrás.
 */
@Injectable()
export class ImportacionService {
  constructor(private prisma: PrismaService) {}

  /** La plantilla que se descarga: encabezados, ejemplos y la ayuda al pie. */
  plantillaCsv(): string {
    const lineas = [
      lineaCsv(ENCABEZADOS),
      ...EJEMPLOS.map((e) => lineaCsv(e)),
    ];
    return `${lineas.join("\r\n")}\r\n`;
  }

  async procesar(csv: string, aplicar: boolean) {
    // Un .xlsx renombrado a .csv llega como binario: se nota por los NUL.
    if (csv.includes("\u0000")) {
      throw new BadRequestException(
        "El archivo no es un CSV. Si lo armaste en Excel, usá “Guardar como → CSV”.",
      );
    }
    const filas = filasDeCsv(csv);
    if (filas.length === 0) {
      throw new BadRequestException(
        "El archivo no tiene filas. Descargá la plantilla y cargá los productos debajo de los encabezados.",
      );
    }
    if (filas.length > MAX_FILAS) {
      throw new BadRequestException(
        `El archivo tiene ${filas.length} filas y el máximo es ${MAX_FILAS}. Partilo en varios.`,
      );
    }
    if (!Object.keys(filas[0]).includes("nombre")) {
      throw new BadRequestException(
        "No se encontró la columna “nombre”. ¿Descargaste la plantilla? Los encabezados tienen que estar en la primera fila.",
      );
    }

    const [categorias, proveedores, productos] = await Promise.all([
      this.prisma.categoria.findMany({ select: { id: true, nombre: true, slug: true } }),
      this.prisma.proveedor.findMany({ select: { id: true, nombre: true } }),
      this.prisma.producto.findMany({ select: { id: true, slug: true } }),
    ]);
    const catPorNombre = new Map(categorias.map((c) => [plano(c.nombre), c]));
    const provPorNombre = new Map(proveedores.map((p) => [plano(p.nombre), p]));
    const prodPorSlug = new Map(productos.map((p) => [p.slug, p]));

    // Categorías y proveedores que habría que crear, sin repetir.
    const categoriasNuevas = new Map<string, string>();
    const proveedoresNuevos = new Map<string, string>();
    const slugsVistos = new Set<string>();

    const revisadas: FilaRevisada[] = filas.map((f, i) => {
      const errores: string[] = [];
      const avisos: string[] = [];
      const nombre = (f.nombre ?? "").trim();
      const categoria = (f.categoria ?? "").trim();
      const proveedor = (f.proveedor ?? "").trim();

      if (!nombre) errores.push("Falta el nombre.");
      if (!categoria) errores.push("Falta la categoría.");

      const precio = numeroDeTexto(f.precio);
      if (precio == null) errores.push("El precio no es un número.");
      else if (precio < 0) errores.push("El precio no puede ser negativo.");

      const ivaTxt = plano(f.iva ?? "");
      const iva = ivaTxt ? (IVA_ALIAS[ivaTxt] ?? null) : IvaRate.MINIMA;
      if (!iva) errores.push(`IVA “${f.iva}” no reconocido: usá BASICA, MINIMA o EXENTO.`);

      const uTxt = plano(f.unidadventa ?? "");
      const unidadVenta = uTxt ? (UNIDAD_ALIAS[uTxt] ?? null) : UnidadVenta.UNIDAD;
      if (!unidadVenta) errores.push(`Unidad “${f.unidadventa}” no reconocida: usá UNIDAD o KG.`);

      const esReventa = siNo(f.esreventa) ?? false;
      const costoCompra = numeroDeTexto(f.costocompra);
      if (esReventa && costoCompra == null && (f.costocompra ?? "").trim() !== "") {
        errores.push("El costo de compra no es un número.");
      }

      const slug = aSlug(nombre);
      if (slug && slugsVistos.has(slug)) {
        errores.push("El nombre está repetido en el archivo.");
      }
      if (slug) slugsVistos.add(slug);

      if (categoria && !catPorNombre.has(plano(categoria))) {
        categoriasNuevas.set(plano(categoria), categoria);
        avisos.push(`Se va a crear la categoría “${categoria}”.`);
      }
      if (proveedor && !provPorNombre.has(plano(proveedor))) {
        proveedoresNuevos.set(plano(proveedor), proveedor);
        avisos.push(`Se va a crear el proveedor “${proveedor}”.`);
      }

      const existe = slug ? prodPorSlug.has(slug) : false;
      if (existe) avisos.push("Ya existe: se actualizan sus datos.");

      return {
        // +2: la fila 1 son los encabezados y las personas cuentan desde 1.
        fila: i + 2,
        accion: errores.length ? "error" : existe ? "actualizar" : "crear",
        nombre,
        categoria,
        precio,
        iva,
        unidadVenta,
        proveedor: proveedor || null,
        avisos,
        errores,
      };
    });

    const conError = revisadas.filter((r) => r.accion === "error").length;
    const resumen = {
      total: revisadas.length,
      crear: revisadas.filter((r) => r.accion === "crear").length,
      actualizar: revisadas.filter((r) => r.accion === "actualizar").length,
      errores: conError,
      categoriasNuevas: [...categoriasNuevas.values()],
      proveedoresNuevos: [...proveedoresNuevos.values()],
    };

    if (!aplicar) {
      return { aplicado: false, resumen, filas: revisadas };
    }
    // Todo o nada: con una fila mal, no se escribe ninguna. Un catálogo a
    // medio cargar es peor que uno sin cargar.
    if (conError > 0) {
      throw new BadRequestException(
        `El archivo tiene ${conError} fila${conError === 1 ? "" : "s"} con problemas. Corregilas y volvé a subirlo.`,
      );
    }

    const creados = await this.aplicar(revisadas, filas, catPorNombre, provPorNombre, prodPorSlug);
    return { aplicado: true, resumen, filas: revisadas, ...creados };
  }

  /** Escribe el catálogo. Se llama sólo cuando no quedó ninguna fila con error. */
  private async aplicar(
    revisadas: FilaRevisada[],
    filas: Record<string, string>[],
    catPorNombre: Map<string, { id: string; nombre: string }>,
    provPorNombre: Map<string, { id: string; nombre: string }>,
    prodPorSlug: Map<string, { id: string; slug: string }>,
  ) {
    // 1. Las categorías y proveedores que faltan, antes que nada.
    const ordenBase = await this.prisma.categoria.count();
    let orden = ordenBase;
    for (const r of revisadas) {
      const clave = plano(r.categoria);
      if (!catPorNombre.has(clave)) {
        const creada = await this.prisma.categoria.create({
          data: { nombre: r.categoria, slug: await this.slugLibreCategoria(r.categoria), orden: orden++ },
          select: { id: true, nombre: true },
        });
        catPorNombre.set(clave, creada);
      }
      if (r.proveedor) {
        const cp = plano(r.proveedor);
        if (!provPorNombre.has(cp)) {
          const creado = await this.prisma.proveedor.create({
            data: { nombre: r.proveedor },
            select: { id: true, nombre: true },
          });
          provPorNombre.set(cp, creado);
        }
      }
    }

    // 2. Los productos, en una sola transacción.
    const ops = revisadas.map((r, i) => {
      const f = filas[i];
      const categoriaId = catPorNombre.get(plano(r.categoria))!.id;
      const proveedorId = r.proveedor ? (provPorNombre.get(plano(r.proveedor))?.id ?? null) : null;
      const esReventa = siNo(f.esreventa) ?? false;
      const costoCompra = numeroDeTexto(f.costocompra);
      const datos = {
        nombre: r.nombre,
        categoriaId,
        descripcion: (f.descripcion ?? "").trim() || null,
        precio: r.precio!,
        ivaRate: r.iva!,
        unidadVenta: r.unidadVenta!,
        esReventa,
        costoCompra: esReventa ? costoCompra : null,
        controlaStock: siNo(f.controlastock) ?? false,
        disponible: siNo(f.disponible) ?? true,
        destacado: siNo(f.destacado) ?? false,
        proveedorId,
      };
      const slug = aSlug(r.nombre);
      const existente = prodPorSlug.get(slug);
      return existente
        ? this.prisma.producto.update({ where: { id: existente.id }, data: datos })
        : this.prisma.producto.create({ data: { ...datos, slug } });
    });
    await this.prisma.$transaction(ops);

    return {
      categoriasCreadas: [...catPorNombre.values()].length,
      productos: ops.length,
    };
  }

  /** Slug único para una categoría nueva. */
  private async slugLibreCategoria(nombre: string) {
    const base = aSlug(nombre) || "categoria";
    let slug = base;
    for (let i = 2; await this.prisma.categoria.findUnique({ where: { slug }, select: { id: true } }); i++) {
      slug = `${base}-${i}`;
    }
    return slug;
  }
}

@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller("admin/productos/importar")
class ImportacionController {
  constructor(private readonly svc: ImportacionService) {}

  /** Plantilla vacía con ejemplos, para llenar en Excel o Google Sheets. */
  @Get("plantilla")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="productos-don-julio.csv"')
  plantilla() {
    // El BOM hace que Excel abra el archivo en UTF-8 y no rompa los acentos.
    return `﻿${this.svc.plantillaCsv()}`;
  }

  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_CSV_BYTES } }))
  importar(
    @Body() dto: ImportarDto,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        // Sin FileTypeValidator a propósito: valida por los bytes mágicos del
        // archivo y un CSV no tiene ninguno, así que rechazaría todo. El
        // contenido se valida al parsearlo, que además da mejor mensaje.
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_CSV_BYTES, message: "El archivo supera los 2 MB." }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.svc.procesar(file.buffer.toString("utf8"), dto.aplicar === true);
  }
}

@Module({
  controllers: [ImportacionController],
  providers: [ImportacionService],
  exports: [ImportacionService],
})
export class ImportacionModule {}
