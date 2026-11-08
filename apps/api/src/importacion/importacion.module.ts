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
  "imagen",
] as const;

/**
 * Encabezados del archivo que se descarga: en castellano, como los leería
 * cualquiera en una planilla. Los nombres internos siguen aceptándose al
 * importar (ver ALIAS_COLUMNA), así que un archivo viejo sigue entrando.
 */
const ENCABEZADOS = [
  "Producto",
  "Categoría",
  "Precio",
  "IVA",
  "Se vende por",
  "Descripción",
  "Es reventa",
  "Costo de compra",
  "Lleva stock",
  "Disponible",
  "Destacado",
  "Proveedor",
  // Va al final porque es larga y nadie la escribe a mano: sale llena al
  // exportar y se vuelve a cargar tal cual, así las fotos sobreviven a una
  // mudanza de base.
  "Imagen",
];

/**
 * Cómo se llama cada columna en el archivo → nombre interno.
 *
 * Las claves están normalizadas (sin acentos, sin espacios, en minúscula),
 * que es como las deja el parser. Se aceptan varias formas porque nadie
 * escribe el encabezado igual dos veces.
 */
const ALIAS_COLUMNA: Record<string, string> = {
  producto: "nombre",
  nombre: "nombre",
  articulo: "nombre",
  categoria: "categoria",
  rubro: "categoria",
  precio: "precio",
  preciodeventa: "precio",
  precioventa: "precio",
  iva: "iva",
  tasadeiva: "iva",
  tasaiva: "iva",
  sevendepor: "unidadventa",
  unidadventa: "unidadventa",
  unidad: "unidadventa",
  descripcion: "descripcion",
  esreventa: "esreventa",
  reventa: "esreventa",
  secomprahecho: "esreventa",
  costodecompra: "costocompra",
  costocompra: "costocompra",
  costo: "costocompra",
  llevastock: "controlastock",
  controlastock: "controlastock",
  stock: "controlastock",
  disponible: "disponible",
  destacado: "destacado",
  proveedor: "proveedor",
  imagen: "imagen",
  imagenurl: "imagen",
  "imagen(url)": "imagen",
  urldeimagen: "imagen",
  urlimagen: "imagen",
  foto: "imagen",
};

/**
 * Punto y coma, no coma.
 *
 * El Excel en español usa `;` como separador de listas: con comas abre todo
 * el renglón en una sola celda y el archivo se vuelve ilegible para quien se
 * guía por columnas. Al importar da igual, porque el separador se detecta.
 */
const SEPARADOR = ";";

/** Decimales con coma, que es como los escribe y los lee un Excel en español. */
const numeroCsv = (n: unknown) => (n == null ? "" : String(n).replace(".", ","));

/**
 * Cómo se escriben los valores en el archivo que se descarga.
 *
 * "10%" y "Kilo" en vez de MINIMA y KG: el que llena la planilla no tiene por
 * qué conocer los nombres internos. Al importar se aceptan las dos formas.
 */
const IVA_TEXTO: Record<string, string> = {
  [IvaRate.BASICA]: "22%",
  [IvaRate.MINIMA]: "10%",
  [IvaRate.EXENTO]: "Exento",
};
const UNIDAD_TEXTO: Record<string, string> = {
  [UnidadVenta.UNIDAD]: "Unidad",
  [UnidadVenta.KG]: "Kilo",
};

const EJEMPLOS = [
  ["Pan de campo", "Panes", "120", "10%", "Unidad", "Masa madre, corteza crocante", "no", "", "si", "si", "no", "", ""],
  ["Bizcochos de grasa", "Bizcochos", "420", "10%", "Kilo", "Precio por kilo", "no", "", "si", "si", "no", "", ""],
  ["Agua mineral 500ml", "Cafetería", "70", "22%", "Unidad", "", "si", "38", "no", "si", "no", "Distribuidora del Este", ""],
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

/** Pasa los encabezados del archivo a los nombres internos. */
function renombrarColumnas(fila: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fila)) {
    out[ALIAS_COLUMNA[k] ?? k] = v;
  }
  return out;
}

const plano = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Dirección web del producto. Sólo para los que se crean. */
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
      lineaCsv(ENCABEZADOS, SEPARADOR),
      ...EJEMPLOS.map((e) => lineaCsv(e, SEPARADOR)),
    ];
    return `${lineas.join("\r\n")}\r\n`;
  }

  /**
   * El catálogo actual en el formato de la plantilla.
   *
   * Sirve para editarlo en una planilla y volver a subirlo (el emparejamiento
   * es por nombre, así que actualiza), y para llevarse el catálogo entero al
   * mudar la base de servidor.
   */
  async exportarCsv(): Promise<string> {
    const productos = await this.prisma.producto.findMany({
      orderBy: [{ categoria: { orden: "asc" } }, { nombre: "asc" }],
      include: {
        categoria: { select: { nombre: true } },
        proveedor: { select: { nombre: true } },
      },
    });
    const siNoTxt = (b: boolean) => (b ? "si" : "no");
    const lineas = [
      lineaCsv(ENCABEZADOS, SEPARADOR),
      ...productos.map((p) =>
        lineaCsv([
          p.nombre,
          p.categoria.nombre,
          // Sin separador de miles ni símbolo, y con coma decimal: así el
          // Excel en español lo toma como número y no como texto.
          numeroCsv(p.precio),
          IVA_TEXTO[p.ivaRate] ?? p.ivaRate,
          UNIDAD_TEXTO[p.unidadVenta] ?? p.unidadVenta,
          p.descripcion ?? "",
          siNoTxt(p.esReventa),
          numeroCsv(p.costoCompra),
          siNoTxt(p.controlaStock),
          siNoTxt(p.disponible),
          siNoTxt(p.destacado),
          p.proveedor?.nombre ?? "",
          p.imagenUrl ?? "",
        ], SEPARADOR),
      ),
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
    const filas = filasDeCsv(csv).map(renombrarColumnas);
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
        "No se encontró la columna “Producto”. ¿Descargaste la plantilla? Los encabezados tienen que estar en la primera fila.",
      );
    }

    const [categorias, proveedores, productos] = await Promise.all([
      this.prisma.categoria.findMany({ select: { id: true, nombre: true, slug: true } }),
      this.prisma.proveedor.findMany({ select: { id: true, nombre: true } }),
      this.prisma.producto.findMany({ select: { id: true, nombre: true, slug: true } }),
    ]);
    const catPorNombre = new Map(categorias.map((c) => [plano(c.nombre), c]));
    const provPorNombre = new Map(proveedores.map((p) => [plano(p.nombre), p]));
    // Por nombre y no por slug: los slugs se escriben a mano ("torta-choco"),
    // así que recalcularlos desde el nombre no reconocería el producto y la
    // importación terminaría duplicando el catálogo en vez de actualizarlo.
    const prodPorNombre = new Map(productos.map((p) => [plano(p.nombre), p]));
    const slugsUsados = new Set(productos.map((p) => p.slug));

    // Categorías y proveedores que habría que crear, sin repetir.
    const categoriasNuevas = new Map<string, string>();
    const proveedoresNuevos = new Map<string, string>();
    const nombresVistos = new Set<string>();

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

      const imagen = (f.imagen ?? "").trim();
      if (imagen && !/^https?:\/\//i.test(imagen)) {
        errores.push("La imagen tiene que ser una dirección que empiece con http:// o https://.");
      }

      const clave = plano(nombre);
      if (clave && nombresVistos.has(clave)) {
        errores.push("El nombre está repetido en el archivo.");
      }
      if (clave) nombresVistos.add(clave);

      if (categoria && !catPorNombre.has(plano(categoria))) {
        categoriasNuevas.set(plano(categoria), categoria);
        avisos.push(`Se va a crear la categoría “${categoria}”.`);
      }
      if (proveedor && !provPorNombre.has(plano(proveedor))) {
        proveedoresNuevos.set(plano(proveedor), proveedor);
        avisos.push(`Se va a crear el proveedor “${proveedor}”.`);
      }

      const existe = clave ? prodPorNombre.has(clave) : false;
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

    const creados = await this.aplicar(revisadas, filas, catPorNombre, provPorNombre, prodPorNombre, slugsUsados);
    return { aplicado: true, resumen, filas: revisadas, ...creados };
  }

  /** Escribe el catálogo. Se llama sólo cuando no quedó ninguna fila con error. */
  private async aplicar(
    revisadas: FilaRevisada[],
    filas: Record<string, string>[],
    catPorNombre: Map<string, { id: string; nombre: string }>,
    provPorNombre: Map<string, { id: string; nombre: string }>,
    prodPorNombre: Map<string, { id: string; nombre: string; slug: string }>,
    slugsUsados: Set<string>,
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
      const imagen = (f.imagen ?? "").trim();
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
        // La celda vacía no borra la foto: un archivo editado a mano suele
        // venir sin esta columna, y no es razón para dejar el producto pelado.
        // Para sacarla se usa la pantalla del producto.
        ...(imagen ? { imagenUrl: imagen } : {}),
      };
      const existente = prodPorNombre.get(plano(r.nombre));
      if (existente) {
        return this.prisma.producto.update({ where: { id: existente.id }, data: datos });
      }
      // Slug libre: el del nombre puede estar tomado por otro producto.
      const base = aSlug(r.nombre) || "producto";
      let slug = base;
      for (let n = 2; slugsUsados.has(slug); n++) slug = `${base}-${n}`;
      slugsUsados.add(slug);
      return this.prisma.producto.create({ data: { ...datos, slug } });
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
@Controller("admin/productos")
class ImportacionController {
  constructor(private readonly svc: ImportacionService) {}

  /** Plantilla vacía con ejemplos, para llenar en Excel o Google Sheets. */
  @Get("importar/plantilla")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="productos-don-julio.csv"')
  plantilla() {
    // El BOM hace que Excel abra el archivo en UTF-8 y no rompa los acentos.
    return `﻿${this.svc.plantillaCsv()}`;
  }

  /** El catálogo actual, en el mismo formato que la plantilla. */
  @Get("exportar")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="catalogo-don-julio.csv"')
  async exportar() {
    return `\ufeff${await this.svc.exportarCsv()}`;
  }

  @Post("importar")
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
