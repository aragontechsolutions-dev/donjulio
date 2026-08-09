import { createHmac } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PaymentIntentResult } from "@donjulio/shared";
import {
  CreatePaymentInput,
  PaymentProvider,
  PaymentStatusResult,
} from "./payment-provider.interface";

/**
 * Proveedor real de Mercado Pago (esqueleto).
 *
 * Para activarlo:
 *  1. `pnpm --filter @donjulio/api add mercadopago`
 *  2. Configurar MP_ACCESS_TOKEN y MP_WEBHOOK_SECRET en .env
 *  3. PAYMENTS_PROVIDER="mercadopago"
 *
 * Buenas prácticas ya contempladas por la arquitectura:
 *  - El access_token vive solo en el backend (el frontend usa la public_key).
 *  - Se valida la firma x-signature del webhook (ver verifyWebhookSignature).
 *  - La verdad del pago se toma de getPayment (consulta server-side), no del callback.
 */
@Injectable()
export class MercadoPagoProvider implements PaymentProvider {
  readonly name = "mercadopago";
  private readonly logger = new Logger(MercadoPagoProvider.name);

  constructor(private readonly config: ConfigService) {}

  async createPayment(_input: CreatePaymentInput): Promise<PaymentIntentResult> {
    // TODO: usar el SDK oficial:
    //   const client = new MercadoPagoConfig({ accessToken: this.config.get('MP_ACCESS_TOKEN') });
    //   const pref = await new Preference(client).create({ body: { items: [...], metadata: { orderId } } });
    throw new Error(
      "MercadoPagoProvider no implementado. Instalar el SDK 'mercadopago' y completar createPayment.",
    );
  }

  async getPayment(_paymentId: string): Promise<PaymentStatusResult> {
    // TODO: const payment = await new Payment(client).get({ id: paymentId });
    throw new Error("MercadoPagoProvider.getPayment no implementado.");
  }

  /**
   * Valida la firma HMAC del header x-signature de Mercado Pago.
   * Formato: "ts=<timestamp>,v1=<hash>". El manifest es
   * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`.
   */
  verifyWebhookSignature(
    headers: Record<string, unknown>,
    rawBody: Buffer,
  ): boolean {
    const secret = this.config.get<string>("MP_WEBHOOK_SECRET");
    if (!secret) {
      this.logger.warn("MP_WEBHOOK_SECRET no configurado; se rechaza el webhook.");
      return false;
    }
    const signature = String(headers["x-signature"] ?? "");
    const requestId = String(headers["x-request-id"] ?? "");
    const parts = Object.fromEntries(
      signature.split(",").map((kv) => kv.split("=").map((s) => s.trim())),
    );
    const ts = parts["ts"];
    const v1 = parts["v1"];
    if (!ts || !v1) return false;

    let dataId = "";
    try {
      dataId = String((JSON.parse(rawBody.toString("utf8")) as any)?.data?.id ?? "");
    } catch {
      /* body no-JSON */
    }
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const computed = createHmac("sha256", secret).update(manifest).digest("hex");
    return computed === v1;
  }
}
