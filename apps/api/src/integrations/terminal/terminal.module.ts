import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MockTerminalProvider } from "./mock.provider";
import { MercadoPagoPointProvider } from "./mercadopago-point.provider";
import { TERMINAL_PROVIDER } from "./terminal-provider.interface";

/**
 * La terminal de tarjetas del mostrador.
 *
 * TERMINAL_PROVIDER elige cuál se usa:
 *   (sin definir) → ninguna; la cajera cobra con el posnet a mano, que es como
 *                   funcionó el sistema hasta ahora.
 *   mock          → terminal simulada, para desarrollo y demostración.
 *   mercadopago   → Mercado Pago Point.
 */
@Module({
  providers: [
    MockTerminalProvider,
    MercadoPagoPointProvider,
    {
      provide: TERMINAL_PROVIDER,
      inject: [ConfigService, MockTerminalProvider, MercadoPagoPointProvider],
      useFactory: (
        config: ConfigService,
        mock: MockTerminalProvider,
        mp: MercadoPagoPointProvider,
      ) => {
        switch (String(config.get("TERMINAL_PROVIDER") ?? "").toLowerCase()) {
          case "mercadopago":
          case "mercadopago-point":
          case "point":
            return mp;
          case "mock":
          case "simulada":
            return mock;
          default:
            return null; // sin terminal integrada
        }
      },
    },
  ],
  exports: [TERMINAL_PROVIDER],
})
export class TerminalModule {}
