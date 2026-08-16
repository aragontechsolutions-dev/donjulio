import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthUser, UserRole } from "@donjulio/shared";
import { CurrentUser, Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";
import { InventoryService } from "./inventory.service";
import {
  BulkEntryDto,
  CreateInsumoDto,
  CreateProveedorDto,
  ListInsumosQueryDto,
  StockAdjustDto,
  StockEntryDto,
  UpdateInsumoDto,
} from "./inventory.dto";

@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.PRODUCCION)
@Controller("admin/inventario")
export class InventoryController {
  constructor(private readonly inv: InventoryService) {}

  @Get("proveedores")
  listProveedores() {
    return this.inv.listProveedores();
  }

  @Post("proveedores")
  createProveedor(@Body() dto: CreateProveedorDto) {
    return this.inv.createProveedor(dto);
  }

  /** Lista liviana y completa, para los selectores de recetas y mermas.
   *  Va antes que las rutas con :id para que "opciones" no se lea como un id. */
  @Get("insumos/opciones")
  listInsumosOpciones() {
    return this.inv.listInsumosOpciones();
  }

  @Get("insumos")
  listInsumos(@Query() query: ListInsumosQueryDto) {
    return this.inv.listInsumos(query);
  }

  @Post("insumos")
  createInsumo(@Body() dto: CreateInsumoDto) {
    return this.inv.createInsumo(dto);
  }

  @Patch("insumos/:id")
  updateInsumo(@Param("id") id: string, @Body() dto: UpdateInsumoDto) {
    return this.inv.updateInsumo(id, dto);
  }

  @Get("insumos/:id/movimientos")
  movimientos(@Param("id") id: string) {
    return this.inv.movimientos(id);
  }

  /** Recepción de varios insumos de una vez (remito completo). */
  @Post("entradas")
  entradas(@Body() dto: BulkEntryDto, @CurrentUser() user: AuthUser) {
    return this.inv.registrarEntradas(dto, user.id);
  }

  @Post("insumos/:id/entrada")
  entrada(
    @Param("id") id: string,
    @Body() dto: StockEntryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.inv.registrarEntrada(id, dto, user.id);
  }

  @Post("insumos/:id/ajuste")
  ajuste(
    @Param("id") id: string,
    @Body() dto: StockAdjustDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.inv.ajustarStock(id, dto, user.id);
  }

  @Get("alertas/reorden")
  alertasReorden() {
    return this.inv.alertasReorden();
  }

  @Get("alertas/vencimiento")
  alertasVencimiento(@Query("dias") dias?: string) {
    return this.inv.alertasVencimiento(dias ? Number(dias) : 7);
  }

  // ---------- Trazabilidad de lote ----------
  @Get("trazabilidad/lotes-producidos")
  lotesProducidos(@Query("q") q?: string) {
    return this.inv.listLotesProducidos(q);
  }

  @Get("trazabilidad/lotes-insumo")
  lotesInsumo(@Query("q") q?: string) {
    return this.inv.listLotesInsumo(q);
  }

  @Get("trazabilidad/producido/:id")
  trazaProducido(@Param("id") id: string) {
    return this.inv.trazaLoteProducido(id);
  }

  @Get("trazabilidad/insumo/:id")
  trazaInsumo(@Param("id") id: string) {
    return this.inv.trazaLoteInsumo(id);
  }
}
