import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { RecipesModule } from "../recipes/recipes.module";
import { ProductionController } from "./production.controller";
import { ProductionService } from "./production.service";

@Module({
  imports: [InventoryModule, RecipesModule],
  controllers: [ProductionController],
  providers: [ProductionService],
  exports: [ProductionService],
})
export class ProductionModule {}
