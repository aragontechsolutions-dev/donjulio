import { Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import { OrderChannel, OrderStatus, OrderType } from "@donjulio/shared";

export class CartItemDto {
  @IsString() productoId!: string;
  @IsInt() @Min(1) cantidad!: number;
  @IsOptional() @IsString() productVariantId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) modificadorIds?: string[];
  @IsOptional() @IsString() notas?: string;
  /** Comensal (silla) al que se imputa el ítem (comandas en mesa). */
  @IsOptional() @IsString() sillaId?: string;
}

export class ClienteDto {
  @IsString() nombre!: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() direccion?: string;
}

export class CheckoutDto {
  @IsEnum(OrderChannel) channel!: OrderChannel;
  @IsEnum(OrderType) orderType!: OrderType;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items!: CartItemDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ClienteDto)
  cliente?: ClienteDto;

  @IsOptional() @IsString() notas?: string;
  /** RUT del cliente si solicita e-Factura (en vez de e-Ticket). */
  @IsOptional() @IsString() rutReceptor?: string;
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus) status!: OrderStatus;
}
