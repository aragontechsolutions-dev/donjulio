import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthUser, UserRole } from "@donjulio/shared";
import { CurrentUser, Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";
import { SalonService } from "./salon.service";
import {
  AddItemsDto,
  CobrarDto,
  CobrarParcialDto,
  ComandaDto,
  CreateMesaDto,
  CreateSillaDto,
  CreateZonaDto,
  UpdateMesaDto,
  UpdateSillaDto,
} from "./salon.dto";

@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CAJERO, UserRole.MOZO)
@Controller("admin/salon")
export class SalonController {
  constructor(private readonly salon: SalonService) {}

  @Get("mesas")
  mapa() {
    return this.salon.mapa();
  }

  @Get("menu")
  menu() {
    return this.salon.menuPos();
  }

  @Get("zonas")
  zonas() {
    return this.salon.listZonas();
  }

  @Roles(UserRole.ADMIN)
  @Post("zonas")
  createZona(@Body() dto: CreateZonaDto) {
    return this.salon.createZona(dto);
  }

  @Roles(UserRole.ADMIN)
  @Post("mesas")
  createMesa(@Body() dto: CreateMesaDto) {
    return this.salon.createMesa(dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch("mesas/:id")
  updateMesa(@Param("id") id: string, @Body() dto: UpdateMesaDto) {
    return this.salon.updateMesa(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Delete("mesas/:id")
  deleteMesa(@Param("id") id: string) {
    return this.salon.deleteMesa(id);
  }

  @Roles(UserRole.ADMIN)
  @Post("mesas/:id/rotar-token")
  rotarToken(@Param("id") id: string) {
    return this.salon.rotarToken(id);
  }

  /** Marca como atendido el aviso de "pedir la cuenta" de una mesa. */
  @Post("mesas/:id/atender-cuenta")
  atenderCuenta(@Param("id") id: string) {
    return this.salon.atenderCuenta(id);
  }

  // ---------- Sillas / comensales ----------
  @Roles(UserRole.ADMIN)
  @Post("mesas/:id/sillas")
  addSilla(@Param("id") id: string, @Body() dto: CreateSillaDto) {
    return this.salon.addSilla(id, dto);
  }

  @Patch("sillas/:id")
  updateSilla(@Param("id") id: string, @Body() dto: UpdateSillaDto) {
    return this.salon.updateSilla(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Delete("sillas/:id")
  deleteSilla(@Param("id") id: string) {
    return this.salon.deleteSilla(id);
  }

  @Post("mesas/:id/abrir")
  abrir(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.salon.abrirMesa(id, user.id);
  }

  @Get("mesas/:id/cuenta")
  cuenta(@Param("id") id: string) {
    return this.salon.cuentaMesa(id);
  }

  @Post("pedidos/:id/items")
  agregarItems(@Param("id") id: string, @Body() dto: AddItemsDto) {
    return this.salon.agregarItems(id, dto);
  }

  /** Comanda idempotente por mesa (abre cuenta si hace falta). Usada por la PWA. */
  @Post("mesas/:id/comanda")
  comanda(
    @Param("id") id: string,
    @Body() dto: ComandaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.salon.comandaByMesa(id, dto.items, user.id, dto.clientTxnId);
  }

  @Post("pedidos/:id/cobrar")
  cobrar(
    @Param("id") id: string,
    @Body() dto: CobrarDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.salon.cobrar(id, dto, user.id);
  }

  /** Cobro parcial (división de cuenta por comensal). */
  @Post("pedidos/:id/cobrar-parcial")
  cobrarParcial(
    @Param("id") id: string,
    @Body() dto: CobrarParcialDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.salon.cobrarParcial(id, dto, user.id);
  }
}
