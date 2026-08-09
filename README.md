# 🥖 Don Julio — Sistema de Gestión Integral

Sistema para la **Panadería Artesanal Don Julio** (Maldonado, Uruguay). Combina
tres capas: una **landing pública**, un **back-office de gestión** y las bases
para las **integraciones fiscales y de pago** locales (CFE/DGI y Mercado Pago).

Este repositorio contiene la **fundación completa** del sistema (Etapa 1 del
plan): monorepo, modelo de datos completo, API y landing + panel funcionales,
con las integraciones externas detrás de interfaces y proveedores *mock* que
permiten desarrollar todo el flujo sin credenciales reales.

## Stack

| Capa        | Tecnología                                   |
| ----------- | -------------------------------------------- |
| Frontend    | React 18 + Vite + Tailwind CSS + React Router |
| Backend     | NestJS 10 + Prisma 5                          |
| Base de datos | PostgreSQL 16 (local vía Docker / Supabase en prod) |
| Compartido  | Paquete `@donjulio/shared` (enums y DTOs)     |
| Pagos       | Mercado Pago (mock por defecto)               |
| Facturación | CFE/DGI vía proveedor homologado REST (mock por defecto) |

## Estructura del monorepo

```
donjulio/
├── apps/
│   ├── api/          # API NestJS + Prisma (esquema, migraciones, seed)
│   └── web/          # React + Vite (landing pública + panel admin)
├── packages/
│   └── shared/       # Enums de dominio, DTOs y máquina de estados de pedidos
├── docker-compose.yml
└── docs/ARCHITECTURE.md
```

## Puesta en marcha

Requisitos: **Node ≥ 20**, **pnpm 10**, y **Docker** (o un Postgres local).

```bash
# 1. Instalar dependencias
pnpm install

# 2. Variables de entorno
cp .env.example .env

# 3. Levantar Postgres (o apuntar DATABASE_URL a tu instancia)
pnpm db:up

# 4. Compilar el paquete compartido y generar el cliente Prisma
pnpm --filter @donjulio/shared build
pnpm --filter @donjulio/api prisma:generate

# 5. Migrar y sembrar datos de ejemplo
pnpm db:migrate
pnpm db:seed

# 6. Levantar API (:3000) y web (:5173) en paralelo
pnpm dev
```

- **Landing pública:** http://localhost:5173
- **Panel admin:** http://localhost:5173/admin/login
  (o **Shift + Ctrl + click** en el logo de la landing — acceso *oculto*, sólo UX)
- **Credenciales demo:** `admin@donjulio.uy` / `donjulio123`
- **API:** http://localhost:3000/api/health

## Scripts útiles (raíz)

| Comando            | Descripción                                    |
| ------------------ | ---------------------------------------------- |
| `pnpm dev`         | API + web en paralelo                          |
| `pnpm build`       | Compila shared → api → web                     |
| `pnpm db:up/down`  | Levanta / baja Postgres (docker compose)       |
| `pnpm db:migrate`  | Aplica migraciones Prisma                      |
| `pnpm db:seed`     | Carga datos de ejemplo                         |
| `pnpm db:studio`   | Abre Prisma Studio                             |
| `pnpm typecheck`   | Chequeo de tipos en todos los paquetes         |

## Qué incluye esta entrega (Etapa 1 — MVP)

**Landing pública**
- Navbar *sticky* con **scroll-spy** (IntersectionObserver) y *smooth scroll*.
- Secciones: Hero, Nosotros, Productos por categoría, Promociones, Galería,
  Testimonios, Contacto + Horarios. Responsive *mobile-first*.
- SEO local (JSON-LD `Bakery`, meta description) y accesibilidad
  (`prefers-reduced-motion`).

**Panel de administración**
- Auth con JWT + roles (`ADMIN`, `CAJERO`, `PRODUCCION`, `MOZO`, `DELIVERY`).
- Dashboard con KPIs (ventas del día, ticket promedio, pedidos en preparación).
- Gestión de **pedidos** con máquina de estados validada.
- Gestión de **productos** y **promociones**.
- **CMS ligero**: editar textos de la landing sin tocar código.

**Backend / dominio**
- Modelo de datos **completo** (ver `docs/ARCHITECTURE.md`): catálogo, BOM
  multinivel con sub-recetas, stock con lotes, producción, mermas, salón/mesas,
  KDS, modificadores, caja por turno, encargos, CMS y fiscal/CFE.
- Flujo **checkout → pago → emisión de CFE → producción** funcionando (con mocks).
- Integraciones de pago (Mercado Pago) y facturación (Surtec/FEU) detrás de
  interfaces intercambiables por configuración.

**Back-office avanzado (Etapa 3)**
- **Inventario**: insumos, proveedores, movimientos de stock, lotes, y alertas
  de punto de reorden y vencimientos.
- **Recetas y costeo recursivo**: BOM multinivel con sub-recetas; costo por
  receta (material + merma + mano de obra + overhead), costo unitario y
  **food cost %** con semáforo; detección de ciclos.
- **Producción**: órdenes que explotan el BOM y **descuentan stock** de insumos
  (incluidos los de las sub-recetas), con verificación de faltantes y generación
  de lote de producto terminado.
- **Mermas**: registro por producto/insumo/lote con motivo y costo; descuenta
  stock cuando es insumo.
- **Caja / arqueo por turno**: apertura con fondo, movimientos, cierre con
  efectivo esperado, diferencia y conciliación por medio de pago.
- **Reportes/KPIs**: ventas, ticket promedio, ventas por categoría/canal,
  productos más vendidos, food cost promedio y merma total.

## Activar integraciones reales

Todo funciona con *mocks* por defecto. Para conectar servicios reales, editá
`.env`:

```bash
# Pagos reales
PAYMENTS_PROVIDER="mercadopago"
MP_ACCESS_TOKEN="..."
MP_WEBHOOK_SECRET="..."

# Facturación electrónica real (proveedor homologado con API REST)
BILLING_PROVIDER="surtec"
CFE_API_BASE_URL="..."
CFE_API_TOKEN="..."
CFE_RUT_EMISOR="..."
```

Ver `docs/ARCHITECTURE.md` para el detalle de las integraciones, el modelo de
datos y el roadmap de las etapas 2–4.

## Contexto Uruguay / Maldonado

El sistema está pensado para el marco local: facturación electrónica (CFE) de
DGI obligatoria, IVA a tasa mínima (10%) para el pan, protección de datos
(Ley 18.331 / URCDP — con registro de consentimiento del cliente), y las
particularidades de habilitación bromatológica. Ver `docs/ARCHITECTURE.md`.
