# Arquitectura — Don Julio

Documento técnico de referencia. Traduce la investigación de negocio en
decisiones de arquitectura y deja trazado el camino de las etapas siguientes.

## 1. Visión general

Sistema de **tres capas**:

1. **Landing pública** (`apps/web`, rutas `/`): marketing, catálogo y captación
   de pedidos.
2. **Back-office / panel** (`apps/web`, rutas `/admin`): gestión operativa y CMS.
3. **API + integraciones** (`apps/api`): lógica de negocio, fiscal (CFE) y pagos.

Las futuras APKs (cliente y delivery) reutilizarán la misma API. Para la toma de
comandas en salón se recomienda una **PWA** (no una tercera app nativa).

```
┌──────────────┐     ┌──────────────┐     ┌───────────────────┐
│  Landing web │     │  Panel admin │     │  APK cliente /     │
│  (React)     │     │  (React)     │     │  delivery (futuro) │
└──────┬───────┘     └──────┬───────┘     └─────────┬─────────┘
       │  HTTPS/JSON        │                         │
       └───────────────┬────┴─────────────────────────┘
                       ▼
              ┌──────────────────┐
              │   API NestJS     │
              │  (Auth + REST)   │
              └───┬───────┬──────┘
       ┌──────────┘       └────────────┐
       ▼                                ▼
┌──────────────┐              ┌─────────────────────────┐
│ PostgreSQL   │              │ Integraciones (adapters)│
│ (Prisma)     │              │  · Pagos (Mercado Pago) │
│  Supabase en │              │  · CFE (Surtec/Uruware) │
│  producción  │              └─────────────────────────┘
└──────────────┘
```

## 2. Monorepo

- **pnpm workspaces**. Tres paquetes: `@donjulio/shared`, `@donjulio/api`,
  `@donjulio/web`.
- `@donjulio/shared` se compila en **doble formato** (CJS para la API Node, ESM
  para el bundler de Vite) y es la **fuente única de verdad** de enums de dominio
  (roles, estados de pedido, tipos de CFE, tasas de IVA, etc.) y de la
  **máquina de estados** de pedidos, compartida entre backend y frontend.

## 3. Modelo de datos (Prisma)

El esquema (`apps/api/prisma/schema.prisma`) modela **todo** el dominio del plan,
aunque la lógica de las etapas 3–4 se implementará más adelante. Áreas:

| Área                | Entidades clave |
| ------------------- | --------------- |
| Usuarios/clientes   | `Usuario`, `Cliente` (con consentimiento Ley 18.331) |
| Catálogo/menú       | `Categoria`, `Producto`, `ProductVariant`, `ModifierGroup`, `Modifier`, `Promocion` |
| CMS                 | `ContenidoLanding`, `Galeria`, `Testimonio`, `Horario`, `ConfigContacto` |
| Insumos/stock       | `Proveedor`, `Insumo`, `InsumoLote`, `MovimientoStock` |
| Recetas (BOM)       | `Receta`, `RecetaIngrediente` (self-relation → **sub-recetas multinivel**) |
| Producción/mermas   | `OrdenProduccion`, `ProductionLot`, `Merma` |
| Salón/KDS           | `Station`, `Zona`, `Mesa` |
| Pedidos/ventas      | `Pedido`, `PedidoItem`, `PedidoItemModifier`, `OrderStatusEvent`, `Payment`, `WebhookEvent`, `Propina` |
| Caja/turnos         | `CashSession`, `CashMovement`, `Shift` |
| Encargos            | `CustomOrder`, `Deposito` |
| Fiscal              | `Comprobante` (CFE) |

### Decisiones de modelado destacadas

- **BOM multinivel**: `RecetaIngrediente` referencia *o* un `Insumo` *o* una
  `Receta` hija (`subRecetaId`, self-relation). Permite costear una torta que usa
  una crema pastelera (sub-receta) con costeo recursivo. Cada receta declara su
  **rendimiento** (`yieldQty`/`yieldUnit`) para prorratear costo por unidad.
- **Máquina de estados de pedidos** centralizada en `@donjulio/shared`
  (`order-state-machine.ts`): la rama final depende del `orderType`
  (DELIVERY → `EN_CAMINO`; retiro → `LISTO_PARA_RETIRO`).
- **Idempotencia de webhooks**: `WebhookEvent` con `@@unique([provider, eventId])`
  para descartar duplicados de Mercado Pago.
- **Caja por turno**: `CashSession` por `openedBy`/`closedBy` (arqueo por turno,
  no diario global — control interno).
- Índices en todas las FKs y en columnas de filtrado frecuente.

## 4. Seguridad

- **Auth**: JWT propio (Passport). El rol viaja en el token. En producción con
  Supabase, el rol debe guardarse en `app_metadata` (no en `user_metadata`).
- **Autorización**: guard global `JwtAuthGuard` (todo requiere token salvo
  `@Public()`), y `RolesGuard` + `@Roles(...)` por endpoint.
- **RLS (Supabase)**: al migrar a Supabase, habilitar Row Level Security en
  **todas** las tablas (deny-all por defecto) y crear políticas por rol. La
  `service_role` key vive **sólo** en el backend.
- **Webhooks**: validación de firma `x-signature` (HMAC) + *raw body*
  (`rawBody: true` en `main.ts`) + idempotencia.

## 5. Integraciones (patrón *adapter*)

Cada integración externa se define como **interfaz** con un proveedor **mock**
por defecto y el proveedor real como implementación intercambiable por
configuración (`useFactory` en el módulo Nest).

### Pagos — `apps/api/src/integrations/payments`
- `PaymentProvider`: `createPayment`, `getPayment`, `verifyWebhookSignature`.
- `MockPaymentProvider` (auto-aprueba) · `MercadoPagoProvider` (esqueleto con
  validación de firma real ya implementada).
- Buenas prácticas: `access_token` sólo en backend, verdad del pago vía consulta
  server-side, idempotencia, responder 2xx rápido.

### Facturación CFE — `apps/api/src/integrations/billing`
- `BillingProvider`: `emit(EmitCfeInput) → CfeEmitResult`.
- `MockBillingProvider` (CAE ficticio) · `SurtecBillingProvider` (API REST/JSON
  con OAuth2, `POST /comprobantes/crear`).
- Regla DGI aplicada en `BillingService`: sin RUT → **e-Ticket**; con RUT →
  **e-Factura**. Se recomienda un proveedor puente REST en lugar de SOAP directo.

## 6. Flujo de checkout

```
Carrito (web) → POST /api/checkout
  → crea Pedido (PENDIENTE_PAGO) + items + cliente (con consentimiento)
  → PaymentsService.createPayment  (mock: aprueba; real: preferencia MP)
  → si aprobado: Pedido → PAGADO  + emite CFE  (Comprobante EMITIDO)
  → (webhook async para el flujo real de Mercado Pago, con idempotencia)
```

Verificado end-to-end en desarrollo: login → menú → checkout → PAGADO + e-Ticket
con CAE → transiciones de estado validadas.

## 7. Landing — detalles UX

- Navbar `position: sticky` + **scroll-spy con IntersectionObserver**
  (`useScrollSpy`), *smooth scroll* con offset para compensar el navbar fijo, y
  `scroll-margin-top` en las secciones.
- Respeta `prefers-reduced-motion`.
- Imágenes: en producción, servir desde Supabase Storage (WebP/AVIF, lazy).
- Acceso oculto al panel (Shift+Ctrl+click): **sólo UX**, la seguridad real es
  Auth + guards.

## 8. Roadmap (etapas siguientes)

- **Etapa 2 — Pagos y facturación reales**: completar `MercadoPagoProvider`
  (SDK oficial, Checkout Bricks) y `SurtecBillingProvider`; certificado digital y
  alta como emisor electrónico ante DGI.
- **Etapa 3 — Back-office avanzado** ✅ *(implementada)*: stock/insumos con
  alertas, recetas con **costeo recursivo** (food cost %), órdenes de producción
  que **descuentan stock** vía explosión del BOM, mermas, arqueo de caja por
  turno y reportes/KPIs. Módulos: `inventory`, `recipes`, `production`, `mermas`,
  `cash`, `reports`. Pendiente de esta etapa para más adelante: salón/mesas, KDS
  por estación y modificadores en la UI de venta.
- **Etapa 4 — Apps y cumplimiento**: PWA de mozos (comandas offline con
  IndexedDB + Background Sync), APKs cliente/delivery (Supabase Realtime para
  estados), encargos con seña, trazabilidad de lote y datos de rótulo/octógonos.

## 9. Cumplimiento (Uruguay / Maldonado)

- **CFE/DGI**: emisión obligatoria; e-Ticket (101) / e-Factura (111).
- **IVA**: pan a tasa mínima (10%) — independiente del régimen Literal E.
- **Datos personales (Ley 18.331 / URCDP)**: consentimiento registrado en
  `Cliente`, finalidad declarada, y derechos ARCO (el modelo permite
  editar/eliminar datos). Inscribir la base ante la URCDP.
- **Bromatología**: el modelo contempla lote y vencimiento (`InsumoLote`,
  `ProductionLot`) y el flag `requiereOctogono` en `Producto` (Decreto 272/018).

> Las cifras tributarias, comisiones y requisitos municipales cambian; verificar
> en fuentes oficiales (DGI, BPS, Mercado Pago, Intendencia de Maldonado) al
> implementar cada integración.
