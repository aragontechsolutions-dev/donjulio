import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@donjulio/shared";
import { Public, Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";
import { CatalogService } from "./catalog.service";
import {
  CreateCategoriaDto,
  CreateProductoDto,
  UpdateCategoriaDto,
  UpdateProductoDto,
  UpsertRotuladoDto,
} from "./catalog.dto";

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  // -------- Público --------
  @Public()
  @Get("menu")
  menu() {
    return this.catalog.publicMenu();
  }

  @Public()
  @Get("productos/destacados")
  destacados() {
    return this.catalog.destacados();
  }

  // -------- Admin: categorías --------
  @Get("admin/categorias")
  listCategorias() {
    return this.catalog.listCategorias();
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post("admin/categorias")
  createCategoria(@Body() dto: CreateCategoriaDto) {
    return this.catalog.createCategoria(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch("admin/categorias/:id")
  updateCategoria(@Param("id") id: string, @Body() dto: UpdateCategoriaDto) {
    return this.catalog.updateCategoria(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete("admin/categorias/:id")
  removeCategoria(@Param("id") id: string) {
    return this.catalog.removeCategoria(id);
  }

  // -------- Admin: productos --------
  @Get("admin/productos")
  listProductos() {
    return this.catalog.listProductos();
  }

  /** Costo, food cost y margen de cada producto (receta o costo de compra). */
  @Get("admin/productos/costeo")
  costeoProductos() {
    return this.catalog.costeoProductos();
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.PRODUCCION)
  @Post("admin/productos")
  createProducto(@Body() dto: CreateProductoDto) {
    return this.catalog.createProducto(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.PRODUCCION)
  @Patch("admin/productos/:id")
  updateProducto(@Param("id") id: string, @Body() dto: UpdateProductoDto) {
    return this.catalog.updateProducto(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete("admin/productos/:id")
  removeProducto(@Param("id") id: string) {
    return this.catalog.removeProducto(id);
  }

  // -------- Rotulado frontal (Decreto 272/018) --------
  @Get("admin/productos/:id/rotulado")
  getRotulado(@Param("id") id: string) {
    return this.catalog.getRotulado(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.PRODUCCION)
  @Put("admin/productos/:id/rotulado")
  upsertRotulado(@Param("id") id: string, @Body() dto: UpsertRotuladoDto) {
    return this.catalog.upsertRotulado(id, dto);
  }
}
