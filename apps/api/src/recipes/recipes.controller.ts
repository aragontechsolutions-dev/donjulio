import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@donjulio/shared";
import { Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";
import { RecipesService } from "./recipes.service";
import { CreateRecetaDto, UpdateRecetaDto } from "./recipes.dto";

@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.PRODUCCION)
@Controller("admin/recetas")
export class RecipesController {
  constructor(private readonly recipes: RecipesService) {}

  @Get()
  list() {
    return this.recipes.list();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.recipes.get(id);
  }

  @Get(":id/costeo")
  cost(@Param("id") id: string) {
    return this.recipes.cost(id);
  }

  @Post()
  create(@Body() dto: CreateRecetaDto) {
    return this.recipes.create(dto);
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() dto: UpdateRecetaDto) {
    return this.recipes.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.recipes.remove(id);
  }
}
