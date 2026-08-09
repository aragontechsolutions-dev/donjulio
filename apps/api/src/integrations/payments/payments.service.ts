import { Inject, Injectable, Logger } from "@nestjs/common";
import { PaymentIntentResult } from "@donjulio/shared";
import { PrismaService } from "../../prisma/prisma.service";
import {
  CreatePaymentInput,
  PaymentProvider,
  PaymentStatusResult,
  PAYMENT_PROVIDER,
} from "./payment-provider.interface";

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly prisma: PrismaService,
  ) {}

  get providerName() {
    return this.provider.name;
  }

  createPayment(input: CreatePaymentInput): Promise<PaymentIntentResult> {
    return this.provider.createPayment(input);
  }

  getPayment(paymentId: string): Promise<PaymentStatusResult> {
    return this.provider.getPayment(paymentId);
  }

  verifyWebhookSignature(headers: Record<string, unknown>, rawBody: Buffer) {
    return this.provider.verifyWebhookSignature(headers, rawBody);
  }

  /**
   * Registra el evento de webhook de forma idempotente.
   * Devuelve `false` si el evento ya fue procesado (duplicado).
   */
  async recordWebhookEvent(
    provider: string,
    eventId: string,
    tipo: string | undefined,
    payload: unknown,
  ): Promise<boolean> {
    try {
      await this.prisma.webhookEvent.create({
        data: {
          provider,
          eventId,
          tipo,
          payload: payload as object,
        },
      });
      return true;
    } catch (e) {
      // Violación de unique [provider, eventId] → duplicado.
      this.logger.debug(`Webhook duplicado ignorado: ${provider}/${eventId}`);
      return false;
    }
  }
}
