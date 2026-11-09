# Cobrar con la terminal desde el sistema (Mercado Pago Point)

Hoy la cajera toca "Débito" en el panel y aparte marca el monto en el posnet.
Son dos pasos y dos lugares donde equivocarse: el ticket puede decir $462 y el
posnet haber cobrado $426, y eso recién aparece al cerrar la caja.

Integrado, el monto le llega solo a la terminal, el cliente apoya la tarjeta y
la venta se cierra sola en el sistema. No hay importe que tipear dos veces.

El equipo del local es un **Point Smart** (Newland N950, serie NCD500430546).

> **Estado: confirmado por Mercado Pago, falta probarlo contra la terminal.**
> El soporte de Mercado Pago confirmó que la integración de Point vía Orders
> API está disponible para cuentas de Uruguay (MLU). Todo el flujo está
> construido y probado con una terminal simulada; falta configurar la
> aplicación en la cuenta del local y una prueba contra el equipo real.
> Mientras tanto el sistema funciona exactamente como antes: sin
> `TERMINAL_PROVIDER`, el mostrador cobra como siempre.

---

## Cómo funciona

```
Cajera toca "Cobrar $462 en la terminal"
        │
        ▼
POST /admin/mostrador/terminal/cobro     ← el importe lo calcula el servidor
        │                                   con el motor de precios del sistema
        ▼
Mercado Pago  →  la terminal muestra $462
        │
        │  el cliente apoya la tarjeta
        ▼
Aviso (webhook)  o  consulta cada 1,5 s
        │
        ▼
La venta se registra DEL LADO DEL SERVIDOR y sale el ticket
```

Tres decisiones que conviene conocer antes de tocar el código:

**El importe nunca viene del navegador.** Se manda el carrito y el servidor lo
precia con el mismo motor que usa la venta. Nadie puede cobrar $1 por una torta
manipulando la pantalla.

**La venta la registra el servidor, no el navegador.** Se guarda el carrito al
mandar el cobro, así que si la cajera cierra la pantalla, se queda sin internet
o el navegador se cuelga justo cuando el cliente paga, la venta igual queda
hecha. El mostrador sólo mira cómo viene.

**Un estado desconocido nunca es "aprobado".** Si Mercado Pago contesta algo
que el sistema no reconoce, o no contesta, el cobro sigue "en la terminal". Dar
por aprobado lo que no se entendió registraría una venta que nadie pagó; quedar
esperando de más sólo cuesta que la cajera cancele y repita.

## Si algo sale mal

| Qué pasa | Qué hace el sistema |
| --- | --- |
| La tarjeta se rechaza | Lo dice en pantalla. No se cobró ni se registró nada |
| Se cae internet al mandar el cobro | Avisa que no se pudo contactar a Mercado Pago y ofrece cobrar con el posnet |
| El cliente se arrepiente | "Cancelar el cobro" lo baja de la terminal |
| Nadie responde en la terminal | Queda esperando hasta que se cancele |
| **Se cobró pero la venta no se pudo registrar** | Queda listado arriba del mostrador, en amarillo, hasta que alguien lo resuelva |

Ese último caso es el que más importa. Plata cobrada sin ticket no se puede
arreglar sola: hay que registrar la venta a mano o devolver el dinero desde
Mercado Pago. Por eso no se esconde en un log, se muestra en la pantalla donde
está la persona que puede resolverlo.

Y en cualquier momento está el botón **"Cobré con el posnet: registrar la
venta"**: si la integración no responde, se cobra a mano como siempre y la
venta se registra igual. Nunca queda gente esperando en el mostrador porque
una API no contesta.

## Configuración

Variables en Render (ninguna va en el frontend):

| Variable | Valor |
| --- | --- |
| `TERMINAL_PROVIDER` | `mercadopago` para la terminal real, `mock` para la simulada, vacío para ninguna |
| `MP_ACCESS_TOKEN` | Credencial de **producción** de la cuenta del local |
| `MP_TERMINAL_ID` | La terminal del mostrador (ver abajo cómo averiguarlo) |
| `MP_WEBHOOK_SECRET` | Clave de firma de las notificaciones |
| `MP_POINT_IMPRIME` | `false` si no querés que la terminal imprima su propio comprobante |

> `MP_ACCESS_TOKEN` es la llave de la plata del local. Va en Render, nunca en
> una variable `VITE_*` ni en un commit.

El `MP_TERMINAL_ID` tiene formato `{tipo}__{serie}`, con **doble** guión bajo,
y la serie es la que está impresa en la etiqueta de atrás del equipo. Para el
Point Smart del local (Newland N950, serie `NCD500430546`) sería algo como
`NEWLAND_N950__NCD500430546`, pero **el soporte de Mercado Pago no confirmó
ese valor**: hay que tomarlo de la lista, no armarlo a mano.

Con el token ya puesto:

```
GET /api/admin/terminal/terminales
```

Devuelve las terminales de la cuenta y si cada una está en modo integrado.

La terminal tiene que estar en **modo integrado (PDV)**: en modo autónomo se
opera a mano y no acepta cobros del sistema. El cambio de modo pide reiniciar
el equipo.

El webhook de Mercado Pago apunta a:

```
POST https://<api>.onrender.com/api/terminal/webhook
```

Va sin autenticación, porque lo llama Mercado Pago: la puerta la cuida la firma
`x-signature`. Y del cuerpo sólo se toma el identificador; el estado real se
pregunta después contra la API, así que un aviso falso no puede inventar una
venta.

## Probarlo sin terminal

Con `TERMINAL_PROVIDER=mock` el flujo entero funciona sin hardware:

```
TERMINAL_PROVIDER=mock
TERMINAL_MOCK_SEGUNDOS=4        cuánto tarda el cliente en pagar
TERMINAL_MOCK_RESULTADO=aprobar aprobar | rechazar
```

Sirve para mostrarle el flujo al dueño antes de tener la respuesta de Mercado
Pago, y para desarrollar sin ocupar el posnet del local.

## Lo que hace falta en la cuenta del cliente

Según el soporte de Mercado Pago, para operar Point por API se necesitan tres
cosas, y todas son de la cuenta vendedora (la del dueño del local, que es la
dueña de la terminal):

1. **Una aplicación configurada para Point vía Orders API** en el panel de
   desarrolladores, en *Tus integraciones*. Si ahí no aparece Point como
   producto a configurar, esa cuenta todavía no lo tiene habilitado y hay que
   destrabarlo antes que nada.
2. **Las credenciales de producción** de esa aplicación. Los cobros en una
   terminal física son cobros reales, así que no hay credencial de prueba que
   valga para esto.
3. **El circuito de calidad / homologación de Point**, que pide una operación
   real hecha en la terminal física y medir la calidad de la integración con
   ese Order ID.

## Lo que todavía no se pudo verificar

El proveedor está escrito desde la documentación de Argentina, México y Chile:
la uruguaya no pudo consultarse directamente. Lo que puede necesitar ajuste
está marcado con `verificar` y concentrado en
`apps/api/src/integrations/terminal/mercadopago-point.provider.ts`; el resto
del sistema no depende de esos detalles.

Queda por confirmar contra la terminal real:

- **Cómo viaja el importe**: acá va como texto con dos decimales (`"462.00"`).
  La API vieja lo pedía en centavos y sin punto.
- **Los nombres de los estados** de la order. Están mapeados `created`,
  `at_terminal`, `processed`, `canceled` y `expired`; un estado que no se
  reconozca se trata como "sigue en la terminal", nunca como aprobado.
- **El formato del vencimiento** (`expiration_time: "PT15M"`).

**No hay simulación para Point.** Se consultó por `POST /v1/orders/{id}/events`
y Mercado Pago respondió que no hay referencia oficial de que aplique a una
terminal física: la documentación de pruebas de Orders API apunta a flujos de
ecommerce. Para validar de punta a punta hace falta **al menos una operación
real en la terminal**, con tarjeta de verdad y devolución posterior. Conviene
hacerla con el monto más chico del catálogo.

## El circuito de calidad

Mercado Pago mide la integración sobre cinco ejes: experiencia del comprador,
conciliación financiera, aprobación de pagos, escalabilidad y seguridad. El
resultado llega separado en acciones obligatorias, recomendadas y buenas
prácticas, y la medición necesita el Order ID de una operación productiva
hecha en la terminal física.

De los requisitos que la documentación nombra explícitamente, el sistema ya
cumple dos:

| Requisito | Dónde está |
| --- | --- |
| **Webhooks configurados** | `POST /api/terminal/webhook`, con firma verificada. Falta darlo de alta en el panel |
| **Referencia externa para correlacionar las orders** | Cada order viaja con `external_reference` = el id del cobro, que enlaza con la venta |

La conciliación va en los dos sentidos, que es lo que hace falta para cuadrar
una caja:

- **De Mercado Pago al sistema**: la `external_reference` de la order lleva al
  cobro, y el cobro a la venta.
- **Del sistema a Mercado Pago**: el detalle del movimiento de caja muestra el
  identificador de la operación, así que desde una línea de la caja se busca
  directo en el panel de Mercado Pago, sin cruzar por monto y hora —que es
  justo como se cometen los errores al conciliar.

Queda pendiente de la medición real: escalabilidad y los detalles de
experiencia del comprador, que se evalúan recién con la operación productiva.

## Dónde está cada cosa

| Archivo | Qué hace |
| --- | --- |
| `integrations/terminal/terminal-provider.interface.ts` | El contrato: lo que el mostrador espera de cualquier posnet |
| `integrations/terminal/mock.provider.ts` | Terminal simulada |
| `integrations/terminal/mercadopago-point.provider.ts` | Mercado Pago Point. **Lo único a ajustar si cambia la API** |
| `integrations/terminal/terminal.module.ts` | Elige cuál se usa según `TERMINAL_PROVIDER` |
| `mostrador/cobro-terminal.service.ts` | El ciclo del cobro y el registro de la venta |
| `mostrador/mostrador.service.ts` | La venta de mostrador (ahora acepta un cobro ya hecho) |
| `apps/web/src/admin/pages/MostradorAdmin.tsx` | La espera, el rechazo y la salida manual |

Cambiar de marca de posnet es escribir otro proveedor contra el mismo contrato:
el mostrador, la caja y los comprobantes no se tocan.
