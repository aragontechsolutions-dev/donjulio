import { Module, forwardRef } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OrdersModule } from "../../orders/orders.module";
import { PaymentsService } from "./payments.service";
import { PaymentsController } from "./payments.controller";
import { MockPaymentProvider } from "./mock.provider";
import { MercadoPagoProvider } from "./mercadopago.provider";
import { PAYMENT_PROVIDER } from "./payment-provider.interface";

@Module({
  imports: [forwardRef(() => OrdersModule)],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    MockPaymentProvider,
    MercadoPagoProvider,
    {
      // Selecciona el proveedor según PAYMENTS_PROVIDER (mock | mercadopago).
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService, MockPaymentProvider, MercadoPagoProvider],
      useFactory: (
        config: ConfigService,
        mock: MockPaymentProvider,
        mp: MercadoPagoProvider,
      ) => (config.get("PAYMENTS_PROVIDER") === "mercadopago" ? mp : mock),
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
