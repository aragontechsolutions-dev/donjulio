import { EstadoCobroTerminal, PaymentMethod } from "@donjulio/shared";

/** Una terminal de tarjetas asociada a la cuenta. */
export interface TerminalInfo {
  /** Identificador con el que se le mandan los cobros. */
  id: string;
  /** Cómo llamarla en pantalla (modelo, número de serie o apodo). */
  nombre: string;
  /**
   * Si está en modo integrado. En modo autónomo la terminal se opera a mano y
   * no acepta cobros del sistema.
   */
  modoIntegrado: boolean;
}

export interface CobrarEnTerminalInput {
  terminalId: string;
  /** Total a cobrar, en pesos. */
  monto: number;
  /** Débito o crédito: lo informa el sistema, lo decide el cliente al pagar. */
  metodo: PaymentMethod;
  /** Lo que se muestra en la terminal y queda en el comprobante del cliente. */
  descripcion: string;
  /** Referencia nuestra, para cruzar después con el cobro guardado. */
  referencia: string;
  /** Reintentar con la misma clave no cobra dos veces. */
  idempotencyKey: string;
}

/** Respuesta del proveedor sobre un cobro, en los términos del sistema. */
export interface ResultadoCobro {
  /** Identificador del cobro del lado del proveedor. */
  externalId: string | null;
  estado: EstadoCobroTerminal;
  /** Motivo del rechazo o del error, para mostrárselo a la cajera. */
  detalle?: string;
}

/**
 * Contrato de una terminal de tarjetas operada desde el sistema.
 *
 * Permite cambiar el simulador por Mercado Pago Point (u otra marca de posnet)
 * sin tocar el mostrador ni la caja. Lo que el mostrador sabe es que mandó un
 * cobro y que en algún momento llega una respuesta; cómo viaja eso es asunto
 * del proveedor.
 */
export interface TerminalProvider {
  readonly name: string;
  /** Si está configurado y se le puede mandar un cobro. */
  readonly disponible: boolean;

  /** Terminales de la cuenta, para elegir cuál usa este local. */
  listarTerminales(): Promise<TerminalInfo[]>;

  /** Manda el monto a la terminal. No espera a que el cliente pague. */
  cobrar(input: CobrarEnTerminalInput): Promise<ResultadoCobro>;

  /** Cómo viene ese cobro. Es el plan B cuando no llegó el aviso. */
  consultar(externalId: string): Promise<ResultadoCobro>;

  /** Da de baja el cobro en la terminal (la cajera se arrepintió). */
  cancelar(externalId: string): Promise<ResultadoCobro>;

  /**
   * Traduce el aviso del proveedor a un resultado. Devuelve null si el aviso
   * no es de un cobro (hay notificaciones de otras cosas).
   */
  leerAviso(body: unknown): Promise<ResultadoCobro | null>;

  /** Valida que el aviso venga de verdad del proveedor. */
  verificarFirma(headers: Record<string, unknown>, rawBody: Buffer): boolean;
}

export const TERMINAL_PROVIDER = Symbol("TERMINAL_PROVIDER");
