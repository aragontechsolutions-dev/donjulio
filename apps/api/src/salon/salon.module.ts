import { Module } from "@nestjs/common";
import { OrdersModule } from "../orders/orders.module";
import { BillingModule } from "../integrations/billing/billing.module";
import { SalonController } from "./salon.controller";
import { SalonService } from "./salon.service";

@Module({
  imports: [OrdersModule, BillingModule],
  controllers: [SalonController],
  providers: [SalonService],
  exports: [SalonService],
})
export class SalonModule {}
