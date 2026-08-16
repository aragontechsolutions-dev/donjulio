import { Module, forwardRef } from "@nestjs/common";
import { PaymentsModule } from "../integrations/payments/payments.module";
import { BillingModule } from "../integrations/billing/billing.module";
import { InventoryModule } from "../inventory/inventory.module";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  // InventoryModule: la venta valida y descuenta el stock de lo producido.
  imports: [forwardRef(() => PaymentsModule), BillingModule, InventoryModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
