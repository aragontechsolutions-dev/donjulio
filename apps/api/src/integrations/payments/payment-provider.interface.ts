import { PaymentIntentResult } from "@donjulio/shared";

export interface CreatePaymentInput {
  orderId: string;
  numero: number;
  amount: number;
  description: string;
  payerEmail?: string;
  idempotencyKey: string;
}

export interface PaymentStatusResult {
  paymentId: string;
  status: "approved" | "pending" | "rejected" | "cancelled" | "refunded";
  amount: number;
  raw?: Record<string, unknown>;
}

/**
 * Contrato de un proveedor de pagos. Permite intercambiar el mock por
 * Mercado Pago (u otro) sin tocar la lógica de negocio.
 */
export interface PaymentProvider {
  readonly name: string;

  /** Crea un intento/preferencia de pago. */
  createPayment(input: CreatePaymentInput): Promise<PaymentIntentResult>;

  /** Consulta el estado real del pago (fuente de verdad, server-side). */
  getPayment(paymentId: string): Promise<PaymentStatusResult>;

  /**
   * Valida la firma del webhook (x-signature en Mercado Pago).
   * El mock siempre acepta.
   */
  verifyWebhookSignature(headers: Record<string, unknown>, rawBody: Buffer): boolean;
}

export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");
