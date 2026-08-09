import { CfeEmitResult, CfeType } from "@donjulio/shared";

export interface CfeLineInput {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
}

export interface EmitCfeInput {
  tipo: CfeType;
  orderId?: string;
  numero: number;
  montoTotal: number;
  iva: number;
  /** RUT del receptor (obligatorio para e-Factura). */
  rutReceptor?: string;
  lineas: CfeLineInput[];
}

/**
 * Contrato de un proveedor de facturación electrónica homologado por DGI.
 * Se recomienda un proveedor puente con API REST (Surtec/FEU, Uruware) en
 * lugar de conectar directo a los webservices SOAP de DGI.
 */
export interface BillingProvider {
  readonly name: string;
  emit(input: EmitCfeInput): Promise<CfeEmitResult>;
}

export const BILLING_PROVIDER = Symbol("BILLING_PROVIDER");
