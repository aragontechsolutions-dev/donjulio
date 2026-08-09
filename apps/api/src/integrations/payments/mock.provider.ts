import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { PaymentIntentResult } from "@donjulio/shared";
import {
  CreatePaymentInput,
  PaymentProvider,
  PaymentStatusResult,
} from "./payment-provider.interface";

/**
 * Proveedor de pagos simulado. Aprueba automáticamente todos los pagos.
 * Útil para desarrollar todo el flujo (carrito → pago → CFE → producción)
 * sin credenciales reales. Se reemplaza por MercadoPagoProvider en producción.
 */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";
  private readonly logger = new Logger(MockPaymentProvider.name);
  private readonly store = new Map<string, PaymentStatusResult>();

  async createPayment(input: CreatePaymentInput): Promise<PaymentIntentResult> {
    const paymentId = `mock_${randomUUID()}`;
    this.store.set(paymentId, {
      paymentId,
      status: "approved",
      amount: input.amount,
    });
    this.logger.debug(
      `[MOCK] Pago aprobado ${paymentId} por $${input.amount} (pedido #${input.numero})`,
    );
    return {
      provider: this.name,
      paymentId,
      status: "approved",
      checkoutUrl: null,
      raw: { simulated: true },
    };
  }

  async getPayment(paymentId: string): Promise<PaymentStatusResult> {
    return (
      this.store.get(paymentId) ?? {
        paymentId,
        status: "approved",
        amount: 0,
      }
    );
  }

  verifyWebhookSignature(): boolean {
    return true;
  }
}
