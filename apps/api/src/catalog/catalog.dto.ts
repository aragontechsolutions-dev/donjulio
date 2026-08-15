import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class CreateCategoriaDto {
  @IsString()
  nombre!: string;

  @IsString()
  slug!: string;

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
  @IsString() nombre!: string;
  @IsString() slug!: string;
  @IsOptional() @IsString() descripcion?: string;
  @IsNumber() @Min(0) precio!: number;
  @IsOptional() @IsString() imagenUrl?: string;
  @IsOptional() @IsBoolean() destacado?: boolean;
  @IsOptional() @IsBoolean() disponible?: boolean;
}

export class UpdateProductoDto {
  @IsOptional() @IsString() categoriaId?: string;
  @IsOptional() @IsString() nombre?: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() descripcion?: string;
  @IsOptional() @IsNumber() @Min(0) precio?: number;
  @IsOptional() @IsString() imagenUrl?: string;
  @IsOptional() @IsBoolean() destacado?: boolean;
  @IsOptional() @IsBoolean() disponible?: boolean;
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
