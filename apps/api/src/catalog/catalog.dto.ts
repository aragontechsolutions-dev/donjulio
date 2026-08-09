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
