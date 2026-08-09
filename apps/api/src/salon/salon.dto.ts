import { Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import { PaymentMethod } from "@donjulio/shared";
import { CartItemDto } from "../orders/orders.dto";

export class CreateZonaDto {
  @IsString() nombre!: string;
}

export class CreateMesaDto {
  @IsInt() numero!: number;
  @IsOptional() @IsString() zonaId?: string;
  @IsOptional() @IsInt() @Min(1) capacidad?: number;
}

export class AddItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items!: CartItemDto[];
}

/** Comanda por mesa (abre la cuenta si no existe). Pensada para la PWA offline. */
export class ComandaDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items!: CartItemDto[];

  /** Id de transacción del cliente para idempotencia ante reintentos. */
  @IsOptional() @IsString() clientTxnId?: string;
}

export class CobrarDto {
  @IsEnum(PaymentMethod) metodoPago!: PaymentMethod;
  @IsOptional() @IsString() rutReceptor?: string;
  @IsOptional() @IsNumber() @Min(0) propina?: number;
}
