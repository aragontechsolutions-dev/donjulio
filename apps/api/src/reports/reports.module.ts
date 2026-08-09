import {
  Controller,
  Get,
  Injectable,
  Module,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  DashboardKpis,
  OrderStatus,
  UserRole,
} from "@donjulio/shared";
import { PrismaService } from "../prisma/prisma.service";
import { Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";
import { RecipesModule } from "../recipes/recipes.module";
import { RecipesService } from "../recipes/recipes.service";

const num = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : typeof d === "number" ? d : d.toNumber();
const round2 = (n: number) => Math.round(n * 100) / 100;

// Estados que cuentan como venta concretada.
const VENTA_STATES: OrderStatus[] = [
  OrderStatus.PAGADO,
  OrderStatus.EN_PREPARACION,
  OrderStatus.LISTO,
  OrderStatus.EN_CAMINO,
  OrderStatus.LISTO_PARA_RETIRO,
  OrderStatus.ENTREGADO,
];

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private recipes: RecipesService,
  ) {}

  async dashboard(desdeStr?: string, hastaStr?: string): Promise<DashboardKpis> {
    const hasta = hastaStr ? new Date(hastaStr) : new Date();
    const desde = desdeStr
      ? new Date(desdeStr)
      : new Date(Date.now() - 30 * 86400000);

    const pedidos = await this.prisma.pedido.findMany({
      where: {
        status: { in: VENTA_STATES as any },
        createdAt: { gte: desde, lte: hasta },
      },
      include: {
        items: { include: { producto: { include: { categoria: true } } } },
      },
    });

    const ventasTotales = round2(pedidos.reduce((a, p) => a + num(p.total), 0));
    const cantidadPedidos = pedidos.length;
    const ticketPromedio = cantidadPedidos
      ? round2(ventasTotales / cantidadPedidos)
      : 0;

    // Ventas por categoría y productos top.
    const catMap = new Map<string, number>();
    const canalMap = new Map<string, number>();
    const prodMap = new Map<string, { nombre: string; cantidad: number; total: number }>();

    for (const p of pedidos) {
      canalMap.set(p.channel, (canalMap.get(p.channel) ?? 0) + num(p.total));
      for (const it of p.items) {
        const cat = it.producto.categoria?.nombre ?? "Sin categoría";
        catMap.set(cat, (catMap.get(cat) ?? 0) + num(it.subtotal));
        const cur = prodMap.get(it.productoId) ?? {
          nombre: it.producto.nombre,
          cantidad: 0,
          total: 0,
        };
        cur.cantidad += it.cantidad;
        cur.total += num(it.subtotal);
        prodMap.set(it.productoId, cur);
      }
    }

    const mermas = await this.prisma.merma.aggregate({
      _sum: { costo: true },
      where: { createdAt: { gte: desde, lte: hasta } },
    });

    // Food cost promedio de productos con receta.
    const recetas = await this.prisma.receta.findMany({
      where: { productoId: { not: null } },
      select: { id: true },
    });
    const foodCosts: number[] = [];
    for (const r of recetas) {
      try {
        const c = await this.recipes.cost(r.id);
        if (c.foodCostPct != null) foodCosts.push(c.foodCostPct);
      } catch {
        /* receta con ciclo o incompleta: se ignora */
      }
    }
    const foodCostPromedioPct = foodCosts.length
      ? round2(foodCosts.reduce((a, b) => a + b, 0) / foodCosts.length)
      : null;

    return {
      desde: desde.toISOString(),
      hasta: hasta.toISOString(),
      ventasTotales,
      cantidadPedidos,
      ticketPromedio,
      ventasPorCategoria: [...catMap.entries()]
        .map(([categoria, total]) => ({ categoria, total: round2(total) }))
        .sort((a, b) => b.total - a.total),
      ventasPorCanal: [...canalMap.entries()]
        .map(([canal, total]) => ({ canal, total: round2(total) }))
        .sort((a, b) => b.total - a.total),
      productosTop: [...prodMap.values()]
        .map((p) => ({ ...p, total: round2(p.total) }))
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 10),
      mermaTotalCosto: round2(num(mermas._sum.costo)),
      foodCostPromedioPct,
    };
  }
}

@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller("admin/reportes")
class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get("dashboard")
  dashboard(@Query("desde") desde?: string, @Query("hasta") hasta?: string) {
    return this.svc.dashboard(desde, hasta);
  }
}

@Module({
  imports: [RecipesModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
