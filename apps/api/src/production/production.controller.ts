import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthUser, UserRole } from "@donjulio/shared";
import { CurrentUser, Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";
import { ProductionService } from "./production.service";
import { AdvanceOrdenDto, CreateOrdenDto } from "./production.dto";

@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.PRODUCCION)
@Controller("admin/produccion")
export class ProductionController {
  constructor(private readonly production: ProductionService) {}

  @Get()
  list() {
    return this.production.list();
  }

  @Post()
  create(@Body() dto: CreateOrdenDto) {
    return this.production.create(dto);
  }

  @Get(":id/requerimientos")
  requerimientos(@Param("id") id: string) {
    return this.production.requerimientos(id);
  }

  @Patch(":id/estado")
  advance(
    @Param("id") id: string,
    @Body() dto: AdvanceOrdenDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.production.advance(id, dto, user.id);
  }
}
