import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { CfeEmitResult } from "@donjulio/shared";
import { BillingProvider, EmitCfeInput } from "./billing-provider.interface";

/**
 * Emisor de CFE simulado. Genera un CAE ficticio para poder ejercitar todo
 * el flujo (pago → emisión → representación impresa) sin certificado ni DGI.
 */
@Injectable()
export class MockBillingProvider implements BillingProvider {
  readonly name = "mock";
  private readonly logger = new Logger(MockBillingProvider.name);
  private counter = 1;

  async emit(input: EmitCfeInput): Promise<CfeEmitResult> {
    const numero = this.counter++;
    const cae = `90${Math.floor(Math.random() * 1e12)}`;
    const venc = new Date();
    venc.setFullYear(venc.getFullYear() + 2);
    this.logger.debug(
      `[MOCK CFE] ${input.tipo} #${numero} por $${input.montoTotal} (CAE ${cae})`,
    );
    return {
      provider: this.name,
      caeNumero: cae,
      caeVencimiento: venc.toISOString(),
      serie: "A",
      numero,
      hash: randomUUID().replace(/-/g, ""),
      qrUrl: null,
      raw: { simulated: true, tipo: input.tipo },
    };
  }
}
