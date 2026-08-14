import { Body, Controller, Get, Module, Param, Post } from "@nestjs/common";
import { Public } from "../auth/decorators";
import { SalonModule } from "../salon/salon.module";
import { SalonService } from "../salon/salon.service";
import { ComandaDto } from "../salon/salon.dto";

/**
 * Autoservicio por mesa (QR / tablet). Endpoints públicos validados por el
 * token de la mesa (qrToken). El cliente puede ver el menú, ver la cuenta de
 * su mesa y enviar pedidos a cocina — nunca cobrar ni ver otras mesas.
 */
@Public()
@Controller("autoservicio")
export class AutoservicioController {
  constructor(private readonly salon: SalonService) {}

  @Get(":token")
  estado(@Param("token") token: string) {
    return this.salon.estadoAutoservicio(token);
  }

  @Get(":token/menu")
  async menu(@Param("token") token: string) {
    // Valida el token antes de exponer el menú.
    await this.salon.mesaByToken(token);
    return this.salon.menuPos();
  }

  @Post(":token/comanda")
  comanda(@Param("token") token: string, @Body() dto: ComandaDto) {
    return this.salon.comandaAutoservicio(token, dto.items, dto.clientTxnId);
  }
}

@Module({
  imports: [SalonModule],
  controllers: [AutoservicioController],
})
export class AutoservicioModule {}
