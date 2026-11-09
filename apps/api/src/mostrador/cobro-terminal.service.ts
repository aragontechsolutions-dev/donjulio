import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import {
  COBRO_TERMINAL_CERRADO,
  EstadoCobroTerminal,
  PaymentMethod,
} from "@donjulio/shared";
import { PrismaService } from "../prisma/prisma.service";
import {
  ResultadoCobro,
  TERMINAL_PROVIDER,
  TerminalProvider,
} from "../integrations/terminal/terminal-provider.interface";
import { MostradorService, VentaMostradorDto } from "./mostrador.service";

/** Carrito guardado para rearmar la venta cuando llegue la aprobación. */
interface CarritoGuardado {
  items: VentaMostradorDto["items"];
}

/**
 * El cobro con tarjeta en la terminal del mostrador.
 *
 * Cobrar con posnet integrado no es instantáneo: el monto viaja a la terminal,
 * el cliente apoya la tarjeta y la respuesta llega después. Este servicio
 * guarda ese intento y lo lleva hasta el final.
 *
 * Dos decisiones que valen la pena explicar:
 *
 * 1. La venta se registra **del lado del servidor** cuando el cobro se
 *    aprueba, usando el carrito guardado. Si la cajera cerró el navegador o se
 *    quedó sin internet justo en ese momento, la venta igual queda hecha.
 *
 * 2. Un cobro aprobado al que no se le pudo armar la venta no se pierde ni se
 *    oculta: queda a la vista en `huerfanos()`, porque plata cobrada sin venta
 *    registrada es lo peor que puede pasar en una caja.
 */
@Injectable()
export class CobroTerminalService {
  private readonly logger = new Logger(CobroTerminalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mostrador: MostradorService,
    @Optional()
    @Inject(TERMINAL_PROVIDER)
    private readonly terminal: TerminalProvider | null,
  ) {}

  /** Terminal configurada para este local. */
  private get terminalId(): string {
    return this.config.get<string>("MP_TERMINAL_ID") ?? "SIMULADA-001";
  }

  /** Si el mostrador puede mandar cobros a una terminal. */
  get habilitado(): boolean {
    return !!this.terminal && this.terminal.disponible;
  }

  /** Lo que el mostrador necesita saber al cargar la pantalla. */
  estado() {
    return {
      habilitado: this.habilitado,
      proveedor: this.terminal?.name ?? null,
      terminalId: this.habilitado ? this.terminalId : null,
    };
  }

  /** Terminales de la cuenta, para elegir cuál va en MP_TERMINAL_ID. */
  async terminales() {
    if (!this.terminal) {
      throw new BadRequestException(
        "No hay terminal configurada. Poné TERMINAL_PROVIDER para habilitarla.",
      );
    }
    try {
      return await this.terminal.listarTerminales();
    } catch (e) {
      // El error del proveedor dice algo útil (credencial, red); un 500 pelado
      // obligaría a ir a buscarlo a los logs de Render.
      throw new BadRequestException(
        `No se pudieron leer las terminales: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  private exigirTerminal(): TerminalProvider {
    if (!this.habilitado || !this.terminal) {
      throw new BadRequestException(
        "No hay terminal de tarjetas integrada. Cobrá con el posnet y registrá la venta a mano.",
      );
    }
    return this.terminal;
  }

  /**
   * Manda el total a la terminal y devuelve el cobro para seguirlo.
   *
   * El importe lo calcula el servidor con el mismo motor de precios que la
   * venta: lo que diga el navegador no puede cambiar lo que se cobra.
   */
  async iniciar(dto: VentaMostradorDto, usuarioId: string) {
    const terminal = this.exigirTerminal();
    if (
      dto.metodoPago !== PaymentMethod.DEBITO &&
      dto.metodoPago !== PaymentMethod.CREDITO
    ) {
      throw new BadRequestException("La terminal cobra con débito o crédito.");
    }
    const sesion = await this.mostrador.cajaAbierta(usuarioId);
    const { total } = await this.mostrador.precioDeVenta(dto);

    const idempotencyKey = randomUUID();
    const cobro = await this.prisma.cobroTerminal.create({
      data: {
        terminalId: this.terminalId,
        idempotencyKey,
        monto: total,
        metodo: dto.metodoPago,
        estado: EstadoCobroTerminal.PENDIENTE,
        carrito: { items: dto.items } as unknown as Prisma.InputJsonValue,
        rutReceptor: dto.rutReceptor ?? null,
        cashSessionId: sesion.id,
        usuarioId,
      },
    });

    const res = await terminal.cobrar({
      terminalId: this.terminalId,
      monto: total,
      metodo: dto.metodoPago,
      descripcion: `Panadería Don Julio — venta de mostrador`,
      referencia: cobro.id,
      idempotencyKey,
    });

    const actualizado = await this.prisma.cobroTerminal.update({
      where: { id: cobro.id },
      data: {
        externalId: res.externalId,
        estado: res.estado,
        detalle: res.detalle ?? null,
        ...(COBRO_TERMINAL_CERRADO.includes(res.estado) ? { resueltoEn: new Date() } : {}),
      },
    });
    return this.aVista(actualizado);
  }

  /**
   * Cómo viene el cobro. Si ya se aprobó, de paso registra la venta.
   *
   * Es lo que consulta el mostrador cada pocos segundos mientras espera, y
   * también la red de seguridad si el aviso de Mercado Pago no llega nunca.
   */
  async consultar(id: string) {
    const cobro = await this.prisma.cobroTerminal.findUnique({ where: { id } });
    if (!cobro) throw new NotFoundException("Ese cobro no existe.");

    if (!COBRO_TERMINAL_CERRADO.includes(cobro.estado as EstadoCobroTerminal) && cobro.externalId) {
      const res = await this.exigirTerminal().consultar(cobro.externalId);
      await this.aplicar(cobro.id, res);
    }
    const final = await this.prisma.cobroTerminal.findUniqueOrThrow({ where: { id } });
    return {
      ...this.aVista(final),
      // Con la venta hecha va el comprobante, que es lo que el mostrador
      // muestra apenas la terminal aprueba.
      ticket: final.pedidoId ? await this.ticketDe(final.pedidoId, final.metodo) : null,
    };
  }

  /** El comprobante de una venta cobrada por terminal. */
  private async ticketDe(pedidoId: string, metodo: string) {
    const p = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: { items: { include: { producto: { select: { nombre: true } } } } },
    });
    if (!p) return null;
    return {
      numero: p.numero,
      total: Number(p.total),
      iva: Number(p.ivaTotal),
      neto: Number(p.neto),
      metodoPago: metodo,
      // Con tarjeta no hay vuelto que dar.
      vuelto: null,
      // Si el pedido sigue en PAGADO es porque algo quedó para la cocina.
      aCocina: p.status === "PAGADO",
      items: p.items.map((it) => ({
        nombre: it.producto.nombre,
        cantidad: Number(it.cantidad),
        subtotal: Number(it.subtotal),
      })),
    };
  }

  /** La cajera se arrepintió: baja el cobro de la terminal. */
  async cancelar(id: string) {
    const cobro = await this.prisma.cobroTerminal.findUnique({ where: { id } });
    if (!cobro) throw new NotFoundException("Ese cobro no existe.");
    if (COBRO_TERMINAL_CERRADO.includes(cobro.estado as EstadoCobroTerminal)) {
      return this.aVista(cobro);
    }
    const res = cobro.externalId
      ? await this.exigirTerminal().cancelar(cobro.externalId)
      : { externalId: null, estado: EstadoCobroTerminal.CANCELADO };
    await this.aplicar(cobro.id, res as ResultadoCobro);
    return this.aVista(await this.prisma.cobroTerminal.findUniqueOrThrow({ where: { id } }));
  }

  /** Aviso del proveedor: se usa sólo como empujón para ir a consultar. */
  async aviso(body: unknown): Promise<{ atendido: boolean }> {
    if (!this.terminal) return { atendido: false };
    const res = await this.terminal.leerAviso(body);
    if (!res?.externalId) return { atendido: false };
    const cobro = await this.prisma.cobroTerminal.findUnique({
      where: { externalId: res.externalId },
    });
    if (!cobro) return { atendido: false };
    await this.aplicar(cobro.id, res);
    return { atendido: true };
  }

  /**
   * Cobros aprobados que todavía no tienen venta registrada.
   *
   * Debería estar siempre vacío. Si algo aparece acá es plata cobrada al
   * cliente sin ticket, y hay que resolverlo a mano (registrar la venta o
   * devolver el dinero), así que el mostrador lo muestra bien a la vista.
   */
  async huerfanos() {
    const filas = await this.prisma.cobroTerminal.findMany({
      where: { estado: EstadoCobroTerminal.APROBADO, pedidoId: null },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return filas.map((c) => this.aVista(c));
  }

  /**
   * Guarda el resultado y, si se aprobó, arma la venta.
   *
   * El paso a APROBADO se hace con un update condicional: el que lo consigue
   * es el único que registra la venta. Da igual que el aviso y la consulta
   * lleguen a la vez.
   */
  private async aplicar(id: string, res: ResultadoCobro) {
    if (res.estado !== EstadoCobroTerminal.APROBADO) {
      await this.prisma.cobroTerminal.updateMany({
        where: { id, estado: { notIn: COBRO_TERMINAL_CERRADO } },
        data: {
          estado: res.estado,
          detalle: res.detalle ?? null,
          ...(res.externalId ? { externalId: res.externalId } : {}),
          ...(COBRO_TERMINAL_CERRADO.includes(res.estado) ? { resueltoEn: new Date() } : {}),
        },
      });
      return;
    }

    const { count } = await this.prisma.cobroTerminal.updateMany({
      where: { id, estado: { notIn: COBRO_TERMINAL_CERRADO } },
      data: {
        estado: EstadoCobroTerminal.APROBADO,
        detalle: res.detalle ?? null,
        resueltoEn: new Date(),
      },
    });
    if (count === 0) return; // otro lo tomó primero

    const cobro = await this.prisma.cobroTerminal.findUniqueOrThrow({ where: { id } });
    if (cobro.pedidoId) return;

    try {
      const carrito = cobro.carrito as unknown as CarritoGuardado;
      const venta = await this.mostrador.vender(
        {
          items: carrito.items,
          metodoPago: cobro.metodo as PaymentMethod,
          rutReceptor: cobro.rutReceptor ?? undefined,
        },
        cobro.usuarioId,
        { externalId: cobro.externalId, provider: this.terminal?.name ?? "terminal" },
      );
      await this.prisma.cobroTerminal.update({
        where: { id },
        data: { pedidoId: venta.pedidoId },
      });
    } catch (e) {
      // El cobro ya se hizo: no se puede deshacer desde acá. Queda registrado
      // como huérfano y el motivo anotado, para resolverlo en el mostrador.
      const detalle = e instanceof Error ? e.message : String(e);
      this.logger.error(`Cobro ${id} aprobado pero sin venta registrada: ${detalle}`);
      await this.prisma.cobroTerminal.update({
        where: { id },
        data: { detalle: `Cobrado, pero la venta no pudo registrarse: ${detalle}` },
      });
    }
  }

  /** Lo que ve el mostrador. El carrito guardado no sale de la API. */
  private aVista(c: {
    id: string;
    estado: string;
    monto: Prisma.Decimal;
    metodo: string;
    detalle: string | null;
    pedidoId: string | null;
    createdAt: Date;
  }) {
    return {
      id: c.id,
      estado: c.estado as EstadoCobroTerminal,
      monto: Number(c.monto),
      metodo: c.metodo,
      detalle: c.detalle,
      pedidoId: c.pedidoId,
      creadoEn: c.createdAt,
      cerrado: COBRO_TERMINAL_CERRADO.includes(c.estado as EstadoCobroTerminal),
    };
  }
}
