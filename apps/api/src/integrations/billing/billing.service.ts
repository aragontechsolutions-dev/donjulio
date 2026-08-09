import { Inject, Injectable, Logger } from "@nestjs/common";
import { CfeStatus, CfeType } from "@donjulio/shared";
import { PrismaService } from "../../prisma/prisma.service";
import {
  BillingProvider,
  BILLING_PROVIDER,
  EmitCfeInput,
} from "./billing-provider.interface";

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Emite el CFE y lo persiste. Regla DGI: consumidor final → e-Ticket;
   * cliente con RUT → e-Factura. No mezclar B2B y B2C en un mismo CFE.
   */
  async emitForOrder(input: EmitCfeInput) {
    const tipo = input.rutReceptor ? CfeType.E_FACTURA : CfeType.E_TICKET;
    const finalInput = { ...input, tipo };

    // Registra el comprobante en estado PENDIENTE antes de emitir.
    const comprobante = await this.prisma.comprobante.create({
      data: {
        pedidoId: input.orderId,
        tipo,
        montoTotal: input.montoTotal,
        iva: input.iva,
        rutReceptor: input.rutReceptor,
        provider: this.provider.name,
        status: CfeStatus.PENDIENTE,
      },
    });

    try {
      const result = await this.provider.emit(finalInput);
      return this.prisma.comprobante.update({
        where: { id: comprobante.id },
        data: {
          status: CfeStatus.EMITIDO,
          serie: result.serie,
          numero: result.numero,
          caeNumero: result.caeNumero,
          caeVencimiento: new Date(result.caeVencimiento),
          hash: result.hash,
          qrUrl: result.qrUrl,
        },
      });
    } catch (e) {
      this.logger.error(`Falló emisión de CFE para pedido ${input.orderId}`, e as Error);
      await this.prisma.comprobante.update({
        where: { id: comprobante.id },
        data: { status: CfeStatus.RECHAZADO },
      });
      throw e;
    }
  }
}
