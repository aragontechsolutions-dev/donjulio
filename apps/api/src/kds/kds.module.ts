import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import { IsEnum } from "class-validator";
import { OrderItemStatus, OrderStatus, UserRole } from "@donjulio/shared";
import { PrismaService } from "../prisma/prisma.service";
import { Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";

// Pedidos cuyos ítems pueden estar en preparación.
const COCINABLE = [
  OrderStatus.PAGADO,
  OrderStatus.EN_PREPARACION,
  OrderStatus.LISTO,
];

// Transiciones válidas de una línea en el KDS.
const ITEM_FLOW: Record<OrderItemStatus, OrderItemStatus[]> = {
  [OrderItemStatus.PENDIENTE]: [OrderItemStatus.EN_PREPARACION, OrderItemStatus.CANCELADO],
  [OrderItemStatus.EN_PREPARACION]: [OrderItemStatus.LISTO, OrderItemStatus.CANCELADO],
  [OrderItemStatus.LISTO]: [OrderItemStatus.ENTREGADO],
  [OrderItemStatus.ENTREGADO]: [],
  [OrderItemStatus.CANCELADO]: [],
};

class AdvanceItemDto {
  @IsEnum(OrderItemStatus) status!: OrderItemStatus;
}

@Injectable()
export class KdsService {
  constructor(private prisma: PrismaService) {}

  estaciones() {
    return this.prisma.station.findMany({ orderBy: { nombre: "asc" } });
  }

  /** Comandas activas para una estación (o todas). FIFO por antigüedad. */
  async pendientes(stationId?: string, incluirListos = false) {
    const statuses = incluirListos
      ? [OrderItemStatus.PENDIENTE, OrderItemStatus.EN_PREPARACION, OrderItemStatus.LISTO]
      : [OrderItemStatus.PENDIENTE, OrderItemStatus.EN_PREPARACION];

    const items = await this.prisma.pedidoItem.findMany({
      where: {
        status: { in: statuses as any },
        ...(stationId ? { stationId } : {}),
        pedido: { status: { in: COCINABLE as any } },
      },
      orderBy: { pedido: { createdAt: "asc" } },
      include: {
        producto: true,
        modificadores: true,
        station: true,
        pedido: { include: { mesa: true } },
      },
      take: 200,
    });

    return items.map((it) => ({
      id: it.id,
      producto: it.producto.nombre,
      cantidad: it.cantidad,
      notas: it.notas,
      status: it.status,
      estacion: it.station?.nombre ?? "General",
      stationId: it.stationId,
      modificadores: it.modificadores.map((m) => m.nombre),
      pedidoNumero: it.pedido.numero,
      mesa: it.pedido.mesa?.numero ?? null,
      canal: it.pedido.channel,
      desde: it.pedido.createdAt,
    }));
  }

  async avanzar(itemId: string, status: OrderItemStatus) {
    const item = await this.prisma.pedidoItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException("Ítem no encontrado");
    const permitido = ITEM_FLOW[item.status as OrderItemStatus] ?? [];
    if (!permitido.includes(status)) {
      throw new BadRequestException(`Transición inválida: ${item.status} → ${status}`);
    }
    return this.prisma.pedidoItem.update({
      where: { id: itemId },
      data: { status },
    });
  }
}

@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.PRODUCCION, UserRole.CAJERO, UserRole.MOZO)
@Controller("admin/kds")
class KdsController {
  constructor(private readonly kds: KdsService) {}

  @Get("estaciones")
  estaciones() {
    return this.kds.estaciones();
  }

  @Get()
  pendientes(
    @Query("stationId") stationId?: string,
    @Query("incluirListos") incluirListos?: string,
  ) {
    return this.kds.pendientes(stationId, incluirListos === "true");
  }

  @Patch("items/:id")
  avanzar(@Param("id") id: string, @Body() dto: AdvanceItemDto) {
    return this.kds.avanzar(id, dto.status);
  }
}

@Module({
  controllers: [KdsController],
  providers: [KdsService],
  exports: [KdsService],
})
export class KdsModule {}
