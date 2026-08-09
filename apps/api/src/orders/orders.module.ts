import { Module, forwardRef } from "@nestjs/common";
import { PaymentsModule } from "../integrations/payments/payments.module";
import { BillingModule } from "../integrations/billing/billing.module";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [forwardRef(() => PaymentsModule), BillingModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
