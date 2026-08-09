import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { ProductionOrderStatus } from "@donjulio/shared";

export class CreateOrdenDto {
  @IsString() recetaId!: string;
  @IsNumber() @Min(0.0001) cantidadLotes!: number;
  @IsOptional() @IsString() planificadaPara?: string;
}

export class AdvanceOrdenDto {
  @IsEnum(ProductionOrderStatus) status!: ProductionOrderStatus;
  /** Permite descontar aunque el stock quede negativo. */
  @IsOptional() @IsBoolean() permitirNegativo?: boolean;
  /** Días hasta vencimiento del lote producido (para trazabilidad). */
  @IsOptional() @IsNumber() diasVencimiento?: number;
}
