import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import { UnitOfMeasure } from "@donjulio/shared";

export class RecetaIngredienteDto {
  @IsOptional() @IsString() insumoId?: string;
  @IsOptional() @IsString() subRecetaId?: string;
  @IsNumber() @Min(0) cantidad!: number;
  @IsEnum(UnitOfMeasure) unidad!: UnitOfMeasure;
}

export class CreateRecetaDto {
  @IsString() nombre!: string;
  @IsOptional() @IsString() productoId?: string;
  @IsOptional() @IsBoolean() isSubRecipe?: boolean;
  @IsNumber() @Min(0.0001) yieldQty!: number;
  @IsEnum(UnitOfMeasure) yieldUnit!: UnitOfMeasure;
  @IsOptional() @IsNumber() @Min(0) mermaPct?: number;
  @IsOptional() @IsNumber() @Min(0) manoObraCosto?: number;
  @IsOptional() @IsNumber() @Min(0) overheadCosto?: number;
  @IsOptional() @IsString() notas?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecetaIngredienteDto)
  ingredientes!: RecetaIngredienteDto[];
}

export class UpdateRecetaDto extends CreateRecetaDto {}
