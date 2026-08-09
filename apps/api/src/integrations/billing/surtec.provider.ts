import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CfeEmitResult, CFE_TIPO_DGI } from "@donjulio/shared";
import { BillingProvider, EmitCfeInput } from "./billing-provider.interface";

/**
 * Proveedor CFE real vía Surtec / Factura Electrónica Uruguay (FEU) — esqueleto.
 * API REST/JSON con OAuth2 Bearer Token; `POST /comprobantes/crear` devuelve
 * cae_numero, cae_vencimiento, serie, numero, hash y la URL del QR.
 *
 * Para activarlo: BILLING_PROVIDER="surtec" + CFE_API_BASE_URL + CFE_API_TOKEN.
 */
@Injectable()
export class SurtecBillingProvider implements BillingProvider {
  readonly name = "surtec";
  private readonly logger = new Logger(SurtecBillingProvider.name);

  constructor(private readonly config: ConfigService) {}

  async emit(input: EmitCfeInput): Promise<CfeEmitResult> {
    const baseUrl = this.config.get<string>("CFE_API_BASE_URL");
    const token = this.config.get<string>("CFE_API_TOKEN");
    if (!baseUrl || !token) {
      throw new Error(
        "SurtecBillingProvider requiere CFE_API_BASE_URL y CFE_API_TOKEN.",
      );
    }

    const payload = {
      tipo_cfe: CFE_TIPO_DGI[input.tipo],
      rut_emisor: this.config.get<string>("CFE_RUT_EMISOR"),
      rut_receptor: input.rutReceptor,
      total: input.montoTotal,
      iva: input.iva,
      items: input.lineas.map((l) => ({
        concepto: l.descripcion,
        cantidad: l.cantidad,
        precio: l.precioUnitario,
      })),
      referencia_externa: input.orderId,
    };

    const res = await fetch(`${baseUrl}/comprobantes/crear`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Error emitiendo CFE: ${res.status} ${text}`);
      throw new Error(`Proveedor CFE respondió ${res.status}`);
    }
    const data: any = await res.json();
    return {
      provider: this.name,
      caeNumero: String(data.cae_numero),
      caeVencimiento: String(data.cae_vencimiento),
      serie: String(data.serie),
      numero: Number(data.numero),
      hash: String(data.hash ?? ""),
      qrUrl: data.qr_url ?? null,
      raw: data,
    };
  }
}
