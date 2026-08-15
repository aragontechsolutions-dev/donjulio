import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/guards";
import { CatalogModule } from "./catalog/catalog.module";
import { PromotionsModule } from "./promotions/promotions.module";
import { CmsModule } from "./cms/cms.module";
import { OrdersModule } from "./orders/orders.module";
import { PaymentsModule } from "./integrations/payments/payments.module";
import { BillingModule } from "./integrations/billing/billing.module";
import { InventoryModule } from "./inventory/inventory.module";
import { RecipesModule } from "./recipes/recipes.module";
import { ProductionModule } from "./production/production.module";
import { MermasModule } from "./mermas/mermas.module";
import { CashModule } from "./cash/cash.module";
import { ReportsModule } from "./reports/reports.module";
import { SalonModule } from "./salon/salon.module";
import { CustomOrdersModule } from "./custom-orders/custom-orders.module";
import { AutoservicioModule } from "./autoservicio/autoservicio.module";
import { KdsModule } from "./kds/kds.module";
import { StorageModule } from "./integrations/storage/storage.module";
import { UsersModule } from "./users/users.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    // Lee el .env de apps/api o el de la raíz del monorepo (en local). En
    // Render/producción las variables ya vienen del entorno; los archivos
    // faltantes se ignoran sin error.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [".env", "../../.env"] }),
    PrismaModule,
    AuthModule,
    CatalogModule,
    PromotionsModule,
    CmsModule,
    OrdersModule,
    PaymentsModule,
    BillingModule,
    InventoryModule,
    RecipesModule,
    ProductionModule,
    MermasModule,
    CashModule,
    ReportsModule,
    SalonModule,
    AutoservicioModule,
    CustomOrdersModule,
    KdsModule,
    StorageModule,
    UsersModule,
  ],
  controllers: [HealthController],
  providers: [
    // JWT global: todas las rutas requieren token salvo las marcadas @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
