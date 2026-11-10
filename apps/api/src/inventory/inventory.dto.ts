import {
  ArrayMaxSize,
  IsBoolean,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Transform, Type } from "class-transformer";
import { UnitOfMeasure } from "@donjulio/shared";

/** Opciones de "insumos por página" que ofrece el panel. */
export const INSUMOS_POR_PAGINA = [10, 20, 50, 100] as const;

export class CreateInsumoDto {
  @IsString() nombre!: string;
  @IsEnum(UnitOfMeasure) unidad!: UnitOfMeasure;
  @IsNumber() @Min(0) costoUnitario!: number;
  @IsOptional() @IsNumber() @Min(0) stockActual?: number;
  @IsOptional() @IsNumber() @Min(0) puntoReorden?: number;
  @IsOptional() @IsString() proveedorId?: string;
}

export class UpdateInsumoDto {
  @IsOptional() @IsString() nombre?: string;
  @IsOptional() @IsEnum(UnitOfMeasure) unidad?: UnitOfMeasure;
  @IsOptional() @IsNumber() @Min(0) costoUnitario?: number;
  @IsOptional() @IsNumber() @Min(0) puntoReorden?: number;
  @IsOptional() @IsString() proveedorId?: string;
}

/** Registro de una entrada (compra) o ajuste de inventario. */
export class StockEntryDto {
  @IsNumber() cantidad!: number;
  @IsOptional() @IsNumber() @Min(0) costoUnitario?: number;
  @IsOptional() @IsString() motivo?: string;
  // Datos de lote (opcional, para trazabilidad de perecederos)
  @IsOptional() @IsString() lote?: string;
  @IsOptional() @IsString() vencimiento?: string;
}

/**
 * Entrada de mercadería comprada hecha (reventa): suma al mismo stock del que
 * descuenta la venta, el que llena la producción. Sin esto habría que cargar
 * el mismo artículo dos veces, como insumo y como producto.
 */
export class EntradaProductoDto {
  @IsNumber() @Min(0.001) cantidad!: number;
  /** Lo que costó comprarlo: actualiza el costo del producto. */
  @IsOptional() @IsNumber() @Min(0) costoUnitario?: number;
  /** Nº de remito o lote, para poder rastrear la compra. */
  @IsOptional() @IsString() lote?: string;
  @IsOptional() @IsString() vencimiento?: string;
}

/** Ajuste absoluto: fija el stock a un valor (arqueo de inventario). */
export class StockAdjustDto {
  @IsNumber() @Min(0) stockReal!: number;
  @IsOptional() @IsString() motivo?: string;
}

export class ExpiryQueryDto {
  @IsOptional() @IsInt() dias?: number;
}

/** Listado paginado de insumos, con búsqueda por nombre. */
export class ListInsumosQueryDto {
  /** Texto libre; filtra por nombre sin distinguir mayúsculas ni acentos. */
  @IsOptional() @IsString() @MaxLength(100) q?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @IsIn([...INSUMOS_POR_PAGINA]) perPage?: number;

  /** Incluye los archivados, para poder revisarlos o reactivarlos. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true" || value === "1")
  @IsBoolean()
  incluirArchivados?: boolean;
}

/** Archivar o volver a poner en circulación un insumo. */
export class ArchivarInsumoDto {
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  activo!: boolean;
}

/** Una línea de la entrada múltiple (un insumo del remito). */
export class BulkEntryItemDto {
  @IsString() insumoId!: string;
  @IsNumber() @Min(0.0001) cantidad!: number;
  @IsOptional() @IsNumber() @Min(0) costoUnitario?: number;
  @IsOptional() @IsString() @MaxLength(60) lote?: string;
  @IsOptional() @IsString() vencimiento?: string;
}

/** Recepción de varios insumos de una sola vez (un remito de proveedor). */
export class BulkEntryDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BulkEntryItemDto)
  items!: BulkEntryItemDto[];

  @IsOptional() @IsString() @MaxLength(200) motivo?: string;
}
