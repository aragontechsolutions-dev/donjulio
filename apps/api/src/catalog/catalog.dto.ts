import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { IvaRate } from "@donjulio/shared";

export class CreateCategoriaDto {
  @IsString()
  @MaxLength(80)
  nombre!: string;

  /** Opcional: si no viene, se deriva del nombre. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  slug?: string;

  @IsOptional()
  @IsInt()
  orden?: number;
}

export class UpdateCategoriaDto {
  @IsOptional() @IsString() nombre?: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsInt() orden?: number;
  @IsOptional() @IsBoolean() activa?: boolean;
}

export class CreateProductoDto {
  @IsString() categoriaId!: string;
  @IsString() @MaxLength(120) nombre!: string;
  /** Opcional: si no viene, se deriva del nombre. */
  @IsOptional() @IsString() @MaxLength(140) slug?: string;
  @IsOptional() @IsString() @MaxLength(500) descripcion?: string;
  @IsNumber() @Min(0) precio!: number;
  @IsOptional() @IsString() imagenUrl?: string;
  @IsOptional() @IsBoolean() destacado?: boolean;
  @IsOptional() @IsBoolean() disponible?: boolean;
  @IsOptional() @IsEnum(IvaRate) ivaRate?: IvaRate;
  /** true = se compra hecho y se revende; false = se elabora en el local. */
  @IsOptional() @IsBoolean() esReventa?: boolean;
  /** Sólo para reventa: lo que cuesta comprarlo. */
  @IsOptional() @IsNumber() @Min(0) costoCompra?: number | null;
}

export class UpdateProductoDto {
  @IsOptional() @IsString() categoriaId?: string;
  @IsOptional() @IsString() @MaxLength(120) nombre?: string;
  @IsOptional() @IsString() @MaxLength(140) slug?: string;
  @IsOptional() @IsString() @MaxLength(500) descripcion?: string | null;
  @IsOptional() @IsNumber() @Min(0) precio?: number;
  @IsOptional() @IsString() imagenUrl?: string;
  @IsOptional() @IsBoolean() destacado?: boolean;
  @IsOptional() @IsBoolean() disponible?: boolean;
  @IsOptional() @IsEnum(IvaRate) ivaRate?: IvaRate;
  @IsOptional() @IsBoolean() esReventa?: boolean;
  @IsOptional() @IsNumber() @Min(0) costoCompra?: number | null;
}

/** Rotulado frontal y ficha nutricional (Decreto 272/018). */
export class UpsertRotuladoDto {
  @IsOptional() @IsString() porcion?: string | null;
  @IsOptional() @IsString() ingredientes?: string | null;
  @IsOptional() @IsString() alergenos?: string | null;
  @IsOptional() @IsBoolean() esLiquido?: boolean;

  @IsOptional() @IsNumber() @Min(0) energiaKcal?: number | null;
  @IsOptional() @IsNumber() @Min(0) proteinas?: number | null;
  @IsOptional() @IsNumber() @Min(0) carbohidratos?: number | null;
  @IsOptional() @IsNumber() @Min(0) azucares?: number | null;
  @IsOptional() @IsNumber() @Min(0) grasasTotales?: number | null;
  @IsOptional() @IsNumber() @Min(0) grasasSaturadas?: number | null;
  @IsOptional() @IsNumber() @Min(0) grasasTrans?: number | null;
  @IsOptional() @IsNumber() @Min(0) fibra?: number | null;
  @IsOptional() @IsNumber() @Min(0) sodioMg?: number | null;

  @IsOptional() @IsBoolean() autoOctogonos?: boolean;
  @IsOptional() @IsBoolean() excesoAzucares?: boolean;
  @IsOptional() @IsBoolean() excesoSodio?: boolean;
  @IsOptional() @IsBoolean() excesoGrasas?: boolean;
  @IsOptional() @IsBoolean() excesoGrasasSat?: boolean;
  @IsOptional() @IsBoolean() contieneEdulcorantes?: boolean;
  @IsOptional() @IsBoolean() contieneCafeina?: boolean;
}
