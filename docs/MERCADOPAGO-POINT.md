# Cobrar con la terminal desde el sistema (Mercado Pago Point)

Hoy la cajera toca "Débito" en el panel y aparte marca el monto en el posnet.
Son dos pasos y dos lugares donde equivocarse: el ticket puede decir $462 y el
posnet haber cobrado $426, y eso recién aparece al cerrar la caja.

Integrado, el monto le llega solo a la terminal, el cliente apoya la tarjeta y
la venta se cierra sola en el sistema. No hay importe que tipear dos veces.

El equipo del local es un **Point Smart** (Newland N950, serie NCD500430546).

> **Estado: listo para enchufar, sin verificar contra la terminal.** Todo el
> flujo está construido y probado con una terminal simulada. Lo que falta es la
> confirmación de Mercado Pago de que la integración por API está habilitada
> para cuentas de Uruguay, y una prueba contra el equipo real. Mientras tanto
> el sistema funciona exactamente como antes: sin `TERMINAL_PROVIDER`, el
> mostrador cobra como siempre.

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

Para averiguar el `MP_TERMINAL_ID`, con el token ya puesto:

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

## Lo que falta confirmar

El esqueleto está armado desde la documentación de Mercado Pago de Argentina,
México y Chile, porque **la documentación uruguaya no pudo consultarse**. Lo
que puede necesitar ajuste está marcado con `verificar` y concentrado en
`apps/api/src/integrations/terminal/mercadopago-point.provider.ts`: el resto
del sistema no depende de esos detalles.

Antes de prenderlo hay que confirmar con Mercado Pago:

1. **Que la integración de Point por API esté habilitada para cuentas de
   Uruguay.** Es la pregunta que decide si todo esto sirve.
2. Si corresponde la **Orders API** (`POST /v1/orders` con `type: point`), que
   es contra la que está escrito, o todavía la vieja de payment intents.
3. **Cómo viaja el importe**: acá va como texto con dos decimales
   (`"462.00"`). La API vieja lo pedía en centavos y sin punto.
4. **Los nombres de los estados** de la order, para traducirlos bien.
5. Si hace falta **alta como integrador** o alcanza con el token de producción.
6. Si hay **ambiente de pruebas**, o se prueba con tarjeta real y devolución.

Las preguntas completas, listas para mandar, están en el texto que se le pasó
al dueño para el soporte de Mercado Pago.

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
