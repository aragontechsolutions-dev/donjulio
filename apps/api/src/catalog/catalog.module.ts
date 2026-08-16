import { Module } from "@nestjs/common";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";
import { RecipesModule } from "../recipes/recipes.module";

@Module({
  // El costeo de productos elaborados sale del motor de recetas.
  imports: [RecipesModule],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
