import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { UnitOfMeasure } from "@donjulio/shared";

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
