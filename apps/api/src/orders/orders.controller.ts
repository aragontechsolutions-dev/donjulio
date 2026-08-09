import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthUser, OrderStatus, UserRole } from "@donjulio/shared";
import { CurrentUser, Public, Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";
import { OrdersService } from "./orders.service";
import { CheckoutDto, UpdateOrderStatusDto } from "./orders.dto";

@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** Checkout desde la web pública o la APK de cliente. */
  @Public()
  @Post("checkout")
  checkout(@Body() dto: CheckoutDto) {
    return this.orders.checkout(dto);
  }

  /** Seguimiento público del estado de un pedido. */
  @Public()
  @Get("pedidos/:id/estado")
  async estado(@Param("id") id: string) {
    const p = await this.orders.findOne(id);
    return { id: p.id, numero: p.numero, status: p.status };
  }

  // -------- Admin / operación --------
  @Get("admin/pedidos")
  list(@Query("status") status?: OrderStatus) {
    return this.orders.findAll(status);
  }

  @Get("admin/pedidos/:id")
  detail(@Param("id") id: string) {
    return this.orders.findOne(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CAJERO, UserRole.PRODUCCION, UserRole.DELIVERY)
  @Patch("admin/pedidos/:id/status")
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.setStatus(id, dto.status, user.id);
  }
}
