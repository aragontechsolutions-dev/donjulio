import {
  ArrayMaxSize,
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
import { Type } from "class-transformer";
import { UnitOfMeasure } from "@donjulio/shared";

/** Opciones de "insumos por página" que ofrece el panel. */
export const INSUMOS_POR_PAGINA = [10, 20, 50, 100] as const;

export class CreateProveedorDto {
  @IsString() nombre!: string;
  @IsOptional() @IsString() contacto?: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsString() email?: string;
}

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
