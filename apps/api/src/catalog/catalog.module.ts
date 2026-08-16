import { Module } from "@nestjs/common";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";
import { RecipesModule } from "../recipes/recipes.module";
import { InventoryModule } from "../inventory/inventory.module";

@Module({
  // El costeo de productos elaborados sale del motor de recetas.
  // InventoryModule: el stock de lo producido que se muestra en el listado.
  imports: [RecipesModule, InventoryModule],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
