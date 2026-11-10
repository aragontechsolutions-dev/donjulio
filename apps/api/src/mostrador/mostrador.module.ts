import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Module,
  Optional,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { CashModule } from "../cash/cash.module";
import { AuthUser, UserRole } from "@donjulio/shared";
import { CurrentUser, Public, Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";
import { OrdersModule } from "../orders/orders.module";
import { InventoryModule } from "../inventory/inventory.module";
import { BillingModule } from "../integrations/billing/billing.module";
import { TerminalModule } from "../integrations/terminal/terminal.module";
import { TERMINAL_PROVIDER } from "../integrations/terminal/terminal-provider.interface";
import type { TerminalProvider } from "../integrations/terminal/terminal-provider.interface";
import { MostradorService, VentaMostradorDto } from "./mostrador.service";
import { CobroTerminalService } from "./cobro-terminal.service";

@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CAJERO)
@Controller("admin/mostrador")
class MostradorController {
  constructor(
    private readonly svc: MostradorService,
    private readonly cobros: CobroTerminalService,
  ) {}

  @Get("catalogo")
  catalogo() {
    return this.svc.catalogo();
  }

  @Post("venta")
  vender(@Body() dto: VentaMostradorDto, @CurrentUser() user: AuthUser) {
    return this.svc.vender(dto, user.id);
  }

  // ── Cobro con tarjeta en la terminal ──────────────────────────────────

  /** Si hay terminal integrada; el mostrador decide con esto qué mostrar. */
  @Get("terminal")
  estadoTerminal() {
    return this.cobros.estado();
  }

  /** Manda el total a la terminal y devuelve el cobro para seguirlo. */
  @Post("terminal/cobro")
  iniciarCobro(@Body() dto: VentaMostradorDto, @CurrentUser() user: AuthUser) {
    return this.cobros.iniciar(dto, user.id);
  }

  /** Cómo viene. Al aprobarse, la venta ya queda registrada. */
  @Get("terminal/cobro/:id")
  consultarCobro(@Param("id") id: string) {
    return this.cobros.consultar(id);
  }

  @Post("terminal/cobro/:id/cancelar")
  cancelarCobro(@Param("id") id: string) {
    return this.cobros.cancelar(id);
  }

  /** Cobros aprobados sin venta registrada. Debería devolver vacío siempre. */
  @Get("terminal/pendientes")
  pendientes() {
    return this.cobros.huerfanos();
  }
}

/**
 * Administración de la terminal: ver qué terminales tiene la cuenta, para
 * saber cuál poner en MP_TERMINAL_ID. Sólo admin.
 */
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller("admin/terminal")
class TerminalAdminController {
  constructor(private readonly cobros: CobroTerminalService) {}

  @Get("terminales")
  terminales() {
    return this.cobros.terminales();
  }
}

/**
 * Avisos de la terminal (webhook del proveedor).
 *
 * Va sin autenticación porque lo llama Mercado Pago, así que la puerta la
 * cuida la firma. Y del cuerpo sólo se toma el identificador: el estado real
 * se pregunta después contra la API, de modo que un aviso falso no puede
 * inventar una venta.
 */
@Controller("terminal")
class TerminalWebhookController {
  constructor(
    private readonly cobros: CobroTerminalService,
    @Optional()
    @Inject(TERMINAL_PROVIDER)
    private readonly terminal: TerminalProvider | null,
  ) {}

  @Public()
  @Post("webhook")
  async webhook(@Req() req: Request & { rawBody?: Buffer }) {
    if (!this.terminal) return { recibido: true, ignorado: true };
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    if (!this.terminal.verificarFirma(req.headers as Record<string, unknown>, rawBody)) {
      throw new ForbiddenException("Firma inválida");
    }
    // Siempre 2xx y rápido: si algo falla, la consulta periódica del
    // mostrador lo resuelve igual, y un error haría reintentar en vano.
    const res = await this.cobros.aviso(req.body).catch(() => ({ atendido: false }));
    return { recibido: true, ...res };
  }
}

@Module({
  imports: [CashModule, OrdersModule, InventoryModule, BillingModule, TerminalModule],
  controllers: [MostradorController, TerminalAdminController, TerminalWebhookController],
  providers: [MostradorService, CobroTerminalService],
  exports: [MostradorService],
})
export class MostradorModule {}
