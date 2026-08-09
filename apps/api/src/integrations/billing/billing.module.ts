import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BillingService } from "./billing.service";
import { MockBillingProvider } from "./mock.provider";
import { SurtecBillingProvider } from "./surtec.provider";
import { BILLING_PROVIDER } from "./billing-provider.interface";

@Module({
  providers: [
    BillingService,
    MockBillingProvider,
    SurtecBillingProvider,
    {
      provide: BILLING_PROVIDER,
      inject: [ConfigService, MockBillingProvider, SurtecBillingProvider],
      useFactory: (
        config: ConfigService,
        mock: MockBillingProvider,
        surtec: SurtecBillingProvider,
      ) => (config.get("BILLING_PROVIDER") === "surtec" ? surtec : mock),
    },
  ],
  exports: [BillingService],
})
export class BillingModule {}
