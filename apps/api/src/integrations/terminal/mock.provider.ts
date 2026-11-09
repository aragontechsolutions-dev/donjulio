import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EstadoCobroTerminal } from "@donjulio/shared";
import {
  CobrarEnTerminalInput,
  ResultadoCobro,
  TerminalInfo,
  TerminalProvider,
} from "./terminal-provider.interface";

/**
 * Terminal simulada.
 *
 * Permite desarrollar y mostrar el flujo completo del mostrador —mandar el
 * cobro, esperar, cobrar o que lo rechacen— sin un posnet sobre la mesa. El
 * cobro queda "en la terminal" unos segundos y después se resuelve.
 *
 * Variables:
 *   TERMINAL_MOCK_SEGUNDOS=4        cuánto tarda el cliente en pagar.
 *   TERMINAL_MOCK_RESULTADO=aprobar aprobar | rechazar.
 */
@Injectable()
export class MockTerminalProvider implements TerminalProvider {
  readonly name = "mock";
  readonly disponible = true;
  private readonly logger = new Logger(MockTerminalProvider.name);
  /** Cobros en curso: id → cuándo se resuelven y con qué. */
  private readonly enCurso = new Map<
    string,
    { resuelveEn: number; estado: EstadoCobroTerminal; detalle?: string }
  >();

  constructor(private readonly config: ConfigService) {}

  private get segundos(): number {
    return Math.max(0, Number(this.config.get("TERMINAL_MOCK_SEGUNDOS") ?? 4) || 0);
  }

  private get rechaza(): boolean {
    return String(this.config.get("TERMINAL_MOCK_RESULTADO") ?? "aprobar") === "rechazar";
  }

  async listarTerminales(): Promise<TerminalInfo[]> {
    return [{ id: "SIMULADA-001", nombre: "Terminal simulada", modoIntegrado: true }];
  }

  async cobrar(input: CobrarEnTerminalInput): Promise<ResultadoCobro> {
    const externalId = `mock-${randomUUID()}`;
    this.enCurso.set(externalId, {
      resuelveEn: Date.now() + this.segundos * 1000,
      estado: this.rechaza ? EstadoCobroTerminal.RECHAZADO : EstadoCobroTerminal.APROBADO,
      detalle: this.rechaza ? "Tarjeta rechazada (simulado)" : undefined,
    });
    this.logger.log(
      `Cobro simulado de $ ${input.monto} en ${input.terminalId}: se resuelve en ${this.segundos}s.`,
    );
    return { externalId, estado: EstadoCobroTerminal.ENVIADO };
  }

  async consultar(externalId: string): Promise<ResultadoCobro> {
    const c = this.enCurso.get(externalId);
    if (!c) {
      // Ya resuelto y olvidado, o de otro arranque del servidor.
      return { externalId, estado: EstadoCobroTerminal.APROBADO };
    }
    if (Date.now() < c.resuelveEn) {
      return { externalId, estado: EstadoCobroTerminal.ENVIADO };
    }
    this.enCurso.delete(externalId);
    return { externalId, estado: c.estado, detalle: c.detalle };
  }

  async cancelar(externalId: string): Promise<ResultadoCobro> {
    this.enCurso.delete(externalId);
    return { externalId, estado: EstadoCobroTerminal.CANCELADO, detalle: "Cancelado desde el mostrador" };
  }

  /** El simulador no manda avisos: el estado se conoce consultando. */
  async leerAviso(): Promise<ResultadoCobro | null> {
    return null;
  }

  verificarFirma(): boolean {
    return true;
  }
}
