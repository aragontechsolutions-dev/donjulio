import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Inject,
  Logger,
  Post,
  Query,
  Req,
  forwardRef,
} from "@nestjs/common";
import type { Request } from "express";
import { Public } from "../../auth/decorators";
import { OrdersService } from "../../orders/orders.service";
import { PaymentsService } from "./payments.service";

/**
 * Endpoint de webhooks de pago (Mercado Pago).
 * Requiere el body crudo (rawBody: true en main.ts) para validar la firma.
 * Responde 2xx rápido; la conciliación real consulta el pago server-side.
 */
@Controller("payments")
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly payments: PaymentsService,
    @Inject(forwardRef(() => OrdersService))
    private readonly orders: OrdersService,
  ) {}

  @Public()
  @Post("webhook")
  async webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Query("type") type?: string,
    @Query("data.id") dataId?: string,
  ) {
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));

    if (!this.payments.verifyWebhookSignature(req.headers as any, rawBody)) {
      throw new ForbiddenException("Firma de webhook inválida");
    }

    const body: any = req.body ?? {};
    const eventId = String(body.id ?? dataId ?? "");
    const tipo = type ?? body.type;
    if (!eventId) throw new BadRequestException("Evento sin id");

    // Idempotencia: ignora duplicados.
    const isNew = await this.payments.recordWebhookEvent(
      this.payments.providerName,
      eventId,
      tipo,
      body,
    );
    if (!isNew) return { received: true, duplicate: true };

    // Solo interesan los eventos de pago.
    const paymentId = String(body?.data?.id ?? dataId ?? "");
    if (tipo === "payment" && paymentId) {
      const status = await this.payments.getPayment(paymentId);
      await this.orders.handlePaymentUpdate(paymentId, status.status);
    }
    return { received: true };
  }
}
