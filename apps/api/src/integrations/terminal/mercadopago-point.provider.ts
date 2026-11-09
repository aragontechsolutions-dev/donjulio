import { createHmac, timingSafeEqual } from "node:crypto";
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
 * Mercado Pago Point: la terminal de tarjetas operada desde el sistema.
 *
 * El flujo es: se crea una order de tipo `point` apuntando a la terminal, el
 * monto aparece solo en el visor, el cliente apoya la tarjeta y Mercado Pago
 * avisa el resultado. La cajera no tipea el importe en el posnet, así que no
 * puede haber diferencia entre lo que dice el ticket y lo que se cobró.
 *
 * Configuración:
 *   TERMINAL_PROVIDER=mercadopago
 *   MP_ACCESS_TOKEN=...        credencial de PRODUCCIÓN de la cuenta del local
 *   MP_TERMINAL_ID=...         la terminal del mostrador (ver listarTerminales)
 *   MP_WEBHOOK_SECRET=...      clave de firma de las notificaciones
 *   MP_POINT_IMPRIME=true      si la terminal imprime su propio comprobante
 *
 * El identificador de la terminal es `{tipo}__{serie}`, con doble guión bajo,
 * y la serie es la que está impresa en la etiqueta de atrás del equipo. Para
 * el Point Smart del local (Newland N950, serie NCD500430546) sería
 * `NEWLAND_N950__NCD500430546`, pero conviene tomarlo tal cual lo devuelve
 * `listarTerminales` en vez de armarlo a mano.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * OJO: la forma exacta de los mensajes está tomada de la documentación de
 * Mercado Pago para otros países (Argentina, México, Chile); todavía no pudo
 * verificarse contra una terminal real ni contra la documentación uruguaya.
 * Lo que puede necesitar ajuste está marcado con «verificar» y concentrado en
 * este archivo: el resto del sistema no depende de estos detalles.
 * ──────────────────────────────────────────────────────────────────────────
 */
@Injectable()
export class MercadoPagoPointProvider implements TerminalProvider {
  readonly name = "mercadopago-point";
  private readonly logger = new Logger(MercadoPagoPointProvider.name);
  private static readonly BASE = "https://api.mercadopago.com";
  /** Si la API no contesta en este plazo, se da por caída. */
  private static readonly TIMEOUT_MS = 15_000;
  /**
   * Cuánto espera la terminal al cliente antes de soltar el cobro.
   *
   * Sin vencimiento, un cobro que nadie atiende deja la terminal tomada: la
   * API rechaza una order nueva mientras hay otra pendiente, así que el
   * mostrador no podría cobrarle al siguiente. Quince minutos es de sobra
   * para que alguien busque la tarjeta, y poco para que moleste.
   */
  private static readonly VENCE_EN_MIN = 15;

  constructor(private readonly config: ConfigService) {}

  get disponible(): boolean {
    return !!this.config.get<string>("MP_ACCESS_TOKEN");
  }

  private get token(): string {
    const t = this.config.get<string>("MP_ACCESS_TOKEN");
    if (!t) {
      throw new Error(
        "TERMINAL_PROVIDER=mercadopago requiere MP_ACCESS_TOKEN (credencial de producción).",
      );
    }
    return t;
  }

  /** Una llamada a la API, con timeout y el error ya legible. */
  private async llamar<T>(
    metodo: string,
    ruta: string,
    opciones: { body?: unknown; idempotencyKey?: string } = {},
  ): Promise<T> {
    const ctrl = new AbortController();
    const reloj = setTimeout(() => ctrl.abort(), MercadoPagoPointProvider.TIMEOUT_MS);
    try {
      let r: Response;
      try {
        r = await fetch(`${MercadoPagoPointProvider.BASE}${ruta}`, {
          method: metodo,
          signal: ctrl.signal,
          headers: {
            authorization: `Bearer ${this.token}`,
            "content-type": "application/json",
            ...(opciones.idempotencyKey ? { "X-Idempotency-Key": opciones.idempotencyKey } : {}),
          },
          ...(opciones.body ? { body: JSON.stringify(opciones.body) } : {}),
        });
      } catch (e) {
        // "fetch failed" no le dice nada a quien está atendiendo: lo que
        // necesita saber es que la terminal no va a responder y que tiene que
        // cobrar por otro lado.
        const porTiempo = (e as Error)?.name === "AbortError";
        throw new Error(
          porTiempo
            ? "Mercado Pago no respondió a tiempo. Cobrá con el posnet a mano y registrá la venta."
            : "No se pudo contactar a Mercado Pago (revisá la conexión). Cobrá con el posnet a mano y registrá la venta.",
        );
      }
      const texto = await r.text();
      const json = texto ? (JSON.parse(texto) as Record<string, unknown>) : {};
      if (!r.ok) {
        const msg =
          (json.message as string) ??
          (json.error as string) ??
          `${r.status} ${r.statusText}`;
        throw new Error(msg);
      }
      return json as T;
    } finally {
      clearTimeout(reloj);
    }
  }

  async listarTerminales(): Promise<TerminalInfo[]> {
    const res = await this.llamar<{ data?: { terminals?: RespuestaTerminal[] } }>(
      "GET",
      "/terminals/v1/list",
    );
    const terminales = res.data?.terminals ?? [];
    return terminales.map((t) => ({
      id: t.id,
      nombre: [t.external_pos_id, t.id].filter(Boolean).join(" · ") || t.id,
      // "PDV" es el modo integrado; "STANDALONE" se opera a mano.
      modoIntegrado: String(t.operating_mode ?? "").toUpperCase() === "PDV",
    }));
  }

  async cobrar(input: CobrarEnTerminalInput): Promise<ResultadoCobro> {
    try {
      const res = await this.llamar<RespuestaOrder>("POST", "/v1/orders", {
        idempotencyKey: input.idempotencyKey,
        body: {
          type: "point",
          external_reference: input.referencia,
          description: input.descripcion.slice(0, 255),
          // verificar: el importe viaja como texto con dos decimales. La API
          // vieja (payment intents) lo pedía en centavos y sin punto.
          transactions: { payments: [{ amount: input.monto.toFixed(2) }] },
          // Vencimiento en el formato de duración de Mercado Pago ("PT15M").
          expiration_time: `PT${MercadoPagoPointProvider.VENCE_EN_MIN}M`,
          config: {
            point: {
              terminal_id: input.terminalId,
              print_on_terminal: this.config.get("MP_POINT_IMPRIME") !== "false",
            },
          },
        },
      });
      return {
        externalId: res.id ?? null,
        estado: this.traducirEstado(res) ?? EstadoCobroTerminal.ENVIADO,
      };
    } catch (e) {
      const detalle = e instanceof Error ? e.message : String(e);
      this.logger.error(`No se pudo mandar el cobro a la terminal: ${detalle}`);
      // Importante que sea ERROR y no RECHAZADO: no se cobró nada, y la
      // cajera puede reintentar o pasar al posnet a mano.
      return { externalId: null, estado: EstadoCobroTerminal.ERROR, detalle };
    }
  }

  async consultar(externalId: string): Promise<ResultadoCobro> {
    try {
      const res = await this.llamar<RespuestaOrder>("GET", `/v1/orders/${externalId}`);
      return {
        externalId,
        estado: this.traducirEstado(res) ?? EstadoCobroTerminal.ENVIADO,
        detalle: res.status_detail,
      };
    } catch (e) {
      // Una consulta que falla no significa que el cobro falló: puede ser la
      // red. Se informa como "sigue en la terminal" y se vuelve a consultar.
      this.logger.warn(`No se pudo consultar el cobro ${externalId}: ${e}`);
      return { externalId, estado: EstadoCobroTerminal.ENVIADO };
    }
  }

  async cancelar(externalId: string): Promise<ResultadoCobro> {
    try {
      await this.llamar("POST", `/v1/orders/${externalId}/cancel`);
      return { externalId, estado: EstadoCobroTerminal.CANCELADO };
    } catch (e) {
      const detalle = e instanceof Error ? e.message : String(e);
      // Si no se pudo cancelar puede ser que el cliente ya haya pagado: no se
      // da por cancelado, se sigue consultando.
      this.logger.warn(`No se pudo cancelar el cobro ${externalId}: ${detalle}`);
      return { externalId, estado: EstadoCobroTerminal.ENVIADO, detalle };
    }
  }

  /**
   * Del aviso sólo se toma el identificador: el estado se pregunta después
   * con `consultar`. Así el sistema no depende de la forma exacta del aviso
   * —que cambia entre versiones de la API— ni le cree a un cuerpo que podría
   * no venir de Mercado Pago.
   */
  async leerAviso(body: unknown): Promise<ResultadoCobro | null> {
    const b = (body ?? {}) as Record<string, any>;
    const id = String(b?.data?.id ?? b?.resource ?? b?.id ?? "").trim();
    if (!id) return null;
    // "resource" a veces viene como URL: nos quedamos con el último tramo.
    const externalId = id.split("/").filter(Boolean).pop() ?? id;
    return this.consultar(externalId);
  }

  /**
   * Firma HMAC del header `x-signature` ("ts=...,v1=...").
   * El manifest es `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`.
   */
  verificarFirma(headers: Record<string, unknown>, rawBody: Buffer): boolean {
    const secret = this.config.get<string>("MP_WEBHOOK_SECRET");
    if (!secret) {
      this.logger.warn("MP_WEBHOOK_SECRET sin configurar: se rechaza el aviso.");
      return false;
    }
    const partes = Object.fromEntries(
      String(headers["x-signature"] ?? "")
        .split(",")
        .map((kv) => kv.split("=").map((s) => s.trim())),
    );
    const ts = partes["ts"];
    const v1 = partes["v1"];
    if (!ts || !v1) return false;

    let dataId = "";
    try {
      dataId = String(
        (JSON.parse(rawBody.toString("utf8")) as Record<string, any>)?.data?.id ?? "",
      );
    } catch {
      /* cuerpo que no es JSON: queda con id vacío y la firma no va a dar */
    }
    const manifest = `id:${dataId};request-id:${String(headers["x-request-id"] ?? "")};ts:${ts};`;
    const calculada = createHmac("sha256", secret).update(manifest).digest("hex");
    // Comparación de tiempo constante: con === se puede adivinar la firma
    // byte a byte midiendo cuánto tarda en contestar.
    const a = Buffer.from(calculada, "utf8");
    const b = Buffer.from(v1, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * Estado de Mercado Pago → estado nuestro.
   *
   * Ante un valor desconocido devuelve null, que el llamador toma como «sigue
   * en la terminal». Es a propósito: inventar un "aprobado" registraría una
   * venta que nadie pagó, y quedarse esperando de más sólo cuesta que la
   * cajera cancele y repita.
   *
   * verificar: los nombres de estado contra la documentación de Uruguay.
   */
  private traducirEstado(res: RespuestaOrder): EstadoCobroTerminal | null {
    switch (String(res.status ?? "").toLowerCase()) {
      case "processed":
      case "approved":
      case "paid":
        return EstadoCobroTerminal.APROBADO;
      case "rejected":
      case "failed":
        return EstadoCobroTerminal.RECHAZADO;
      case "canceled":
      case "cancelled":
        return EstadoCobroTerminal.CANCELADO;
      case "expired":
        return EstadoCobroTerminal.EXPIRADO;
      case "created":
      case "opened":
      case "at_terminal":
      case "action_required":
      case "processing":
        return EstadoCobroTerminal.ENVIADO;
      default:
        return null;
    }
  }
}

interface RespuestaTerminal {
  id: string;
  operating_mode?: string;
  external_pos_id?: string;
}

interface RespuestaOrder {
  id?: string;
  status?: string;
  status_detail?: string;
}
