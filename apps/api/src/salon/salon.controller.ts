import {
  Body,
  Controller,
  Get,
  Param,
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
  ComandaDto,
  CreateMesaDto,
  CreateZonaDto,
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
}
