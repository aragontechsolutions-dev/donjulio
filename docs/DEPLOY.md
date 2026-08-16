# Despliegue — Don Julio (Supabase + Render + Vercel)

Guía para: (1) usar **Supabase** como base de datos + Auth + Storage, (2) desplegar
la **API** en **Render** y (3) los frontends **web** y **PWA** en **Vercel**.

```
Vercel (web)   ─┐
Vercel (pwa)   ─┼──HTTPS──►  Render (API NestJS)  ──►  Supabase (Postgres + Auth + Storage)
                ┘
```

Todo es **toggleable por variables de entorno**: sin configurar Supabase, el
sistema corre en modo local (JWT propio + Postgres en Docker + Storage en disco).

> ### 🚦 Arranque recomendado en 2 fases
> Para un primer deploy sin sorpresas:
> - **Fase 1** — Base + Storage en Supabase, pero **Auth local** (`AUTH_PROVIDER=local`
>   en Render, `VITE_AUTH_PROVIDER=local` en Vercel). Es lo que ya está verificado y
>   no depende de tokens externos. Con esto ya tenés todo andando en la nube.
> - **Fase 2** — Cuando confirmes que funciona, flipeás a **Supabase Auth**:
>   `AUTH_PROVIDER=supabase` + `SUPABASE_JWT_SECRET` en Render, `VITE_AUTH_PROVIDER=supabase`
>   + `VITE_SUPABASE_*` en Vercel, y corrés `provision:supabase`. Redeploy y listo.
>
> El `render.yaml` ya viene en Fase 1 (auth local + `JWT_SECRET` autogenerado).

---

## 1) Crear el proyecto en Supabase

1. Entrá a https://supabase.com → **New project**. Elegí región (ej. `South America (São Paulo)`) y una **Database Password** (guardala).
2. Cuando termine de aprovisionar, andá a **Project Settings** y copiá:
   - **API** → `Project URL` (`SUPABASE_URL`), `anon public` (`VITE_SUPABASE_ANON_KEY`), `service_role` (`SUPABASE_SERVICE_ROLE_KEY`, **secreta**).
   - **API → JWT Settings** → `JWT Secret` (`SUPABASE_JWT_SECRET`, HS256).
   - **Database → Connection string**:
     - **Transaction pooler** (puerto `6543`) → `DATABASE_URL`. Agregale `?pgbouncer=true` al final.
     - **Direct connection** (puerto `5432`) → `DIRECT_URL` (se usa sólo para migraciones).

> Ejemplos:
> `DATABASE_URL="postgresql://postgres.xxxx:PASS@aws-0-xx.pooler.supabase.com:6543/postgres?pgbouncer=true"`
> `DIRECT_URL="postgresql://postgres.xxxx:PASS@aws-0-xx.pooler.supabase.com:5432/postgres"`

## 2) Migrar y sembrar la base

Desde tu máquina, con las dos URLs de Supabase en el `.env`:

```bash
pnpm --filter @donjulio/shared build
pnpm --filter @donjulio/api prisma:generate
pnpm --filter @donjulio/api prisma:deploy   # aplica migraciones (usa DIRECT_URL)
pnpm db:seed                                 # catálogo, mesas, recetas de ejemplo
```

> `prisma:deploy` corre las migraciones ya versionadas (no usa `migrate dev`).

## 3) Storage (imágenes)

1. En Supabase → **Storage** → **New bucket** → nombre `donjulio`, marcá **Public**.
2. En el backend: `STORAGE_PROVIDER=supabase` y `SUPABASE_STORAGE_BUCKET=donjulio`.
   Las subidas usan la `service_role` key (sólo en el backend) y devuelven la URL pública.

## 4) Auth: usuarios, roles y RLS

**Usuarios** — creá los usuarios en Supabase Auth con su rol en `app_metadata`:

```bash
SUPABASE_URL="https://xxxx.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="…service_role…" \
pnpm --filter @donjulio/api provision:supabase
```

Crea `admin@donjulio.uy`, `caja@donjulio.uy`, `mozo@donjulio.uy` (clave `donjulio123`,
cambiala luego) con `app_metadata.role = ADMIN|CAJERO|MOZO`. El backend lee ese rol
del JWT (`AUTH_PROVIDER=supabase`).

**RLS (defensa en profundidad)** — la app accede a la base vía Prisma con la
conexión directa (dueño de la base), así que **RLS no afecta a la API**. Pero
conviene activar RLS *deny-all* para que nadie lea las tablas con la `anon key`
(PostgREST). En Supabase → **SQL Editor**:

```sql
-- Habilita RLS (deny-all por defecto) en todas las tablas públicas.
do $$ declare r record; begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;
```

> Si en el futuro exponés tablas directo por PostgREST/supabase-js, agregá políticas
> explícitas por rol (ver `docs/ARCHITECTURE.md`, sección Seguridad).

## 5) Desplegar la API en Render

1. Render → **New → Blueprint** → conectá el repo. Detecta `render.yaml`.
2. Completá las variables marcadas (Environment):
   - **Fase 1**: `DATABASE_URL`, `DIRECT_URL` (Supabase), `SUPABASE_URL`,
     `SUPABASE_SERVICE_ROLE_KEY` (para Storage), y `CORS_ORIGIN` (lo tendrás tras el
     paso 6). `AUTH_PROVIDER=local` y `JWT_SECRET` ya vienen del blueprint.
   - **Fase 2** (después): cambiá `AUTH_PROVIDER=supabase` y agregá `SUPABASE_JWT_SECRET`.
3. Deploy. La API queda en `https://donjulio-api.onrender.com`; healthcheck en `/api/health`.

> El `startCommand` corre `prisma migrate deploy` en cada arranque (idempotente).
> Render inyecta `PORT` y la API lo respeta automáticamente.

## 6) Desplegar los frontends en Vercel

Creá **dos proyectos** en Vercel desde el mismo repo (Add New → Project):

### Web (landing + panel)
- **Root Directory**: `apps/web`
- Vercel toma `apps/web/vercel.json` (install/build desde la raíz del monorepo + rewrites SPA).
- **Environment Variables**:
  - `VITE_API_BASE_URL` = `https://donjulio-api.onrender.com/api`
  - `VITE_AUTH_PROVIDER` = `supabase`
  - `VITE_SUPABASE_URL` = tu Project URL
  - `VITE_SUPABASE_ANON_KEY` = anon key

### PWA de mozos
- **Root Directory**: `apps/pwa-mozo`
- Mismas variables `VITE_*` que la web.

Deploy. Anotá las URLs (`https://donjulio-web.vercel.app`, `https://donjulio-mozo.vercel.app`).

## 7) Conectar CORS

Volvé a Render → variable `CORS_ORIGIN` y poné las dos URLs de Vercel:

```
CORS_ORIGIN=https://donjulio-web.vercel.app,https://donjulio-mozo.vercel.app
```

Redeploy de la API. Listo: login por Supabase, datos en Supabase, imágenes en Storage.

---

## Checklist de variables por servicio

| Variable | Render (API) | Vercel (web/pwa) | Notas |
|----------|:---:|:---:|-------|
| `DATABASE_URL` | ✅ | — | pooler 6543 `?pgbouncer=true` |
| `DIRECT_URL` | ✅ | — | directo 5432 (migraciones) |
| `AUTH_PROVIDER=supabase` | ✅ | — | |
| `SUPABASE_JWT_SECRET` | ✅ | — | HS256 |
| `SUPABASE_URL` | ✅ | — | también en Storage |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | — | **secreta** |
| `STORAGE_PROVIDER=supabase` | ✅ | — | |
| `SUPABASE_STORAGE_BUCKET` | ✅ | — | `donjulio` |
| `CORS_ORIGIN` | ✅ | — | URLs de Vercel |
| `VITE_API_BASE_URL` | — | ✅ | `…onrender.com/api` |
| `VITE_AUTH_PROVIDER=supabase` | — | ✅ | |
| `VITE_SUPABASE_URL` | — | ✅ | |
| `VITE_SUPABASE_ANON_KEY` | — | ✅ | pública |

## Probar Supabase en local (sin desplegar)

Podés apuntar tu app local a Supabase Cloud: poné en `.env` las mismas
`DATABASE_URL`/`DIRECT_URL` de Supabase, `AUTH_PROVIDER=supabase`,
`STORAGE_PROVIDER=supabase`, las `SUPABASE_*` y las `VITE_SUPABASE_*`, corré los
pasos 2–4 y luego `pnpm dev` + `pnpm dev:pwa`. El login usará Supabase Auth.

> Para volver al modo 100% local: `AUTH_PROVIDER=local`, `STORAGE_PROVIDER=local`,
> `DATABASE_URL`/`DIRECT_URL` al Postgres de Docker, y quitá las `VITE_SUPABASE_*`.

## Vaciar la base para arrancar con datos reales

Cuando termina la etapa de pruebas y hay que cargar los datos de verdad
(mesas, zonas, productos, insumos, recetas…), este script deja la base vacía
conservando un único usuario:

```bash
# 1. Backup primero: Supabase → Database → Backups.

# 2. Ver qué se borraría, sin tocar nada:
pnpm --filter @donjulio/api reset:produccion

# 3. Borrar de verdad:
CONFIRMAR=BORRAR-TODO pnpm --filter @donjulio/api reset:produccion

# 4. Con Supabase Auth, borrar también las cuentas que sobran:
CONFIRMAR=BORRAR-TODO LIMPIAR_SUPABASE=1 \
  pnpm --filter @donjulio/api reset:produccion
```

| Variable | Para qué |
| --- | --- |
| `CONFIRMAR=BORRAR-TODO` | Obligatoria. Sin ella el script sólo simula. |
| `EMAIL_CONSERVAR=...` | Usuario que sobrevive (por defecto `henry@donjulio.uy`). |
| `CONSERVAR_WEB=1` | No borra ubicación, contacto, horarios, textos ni galería. |
| `LIMPIAR_SUPABASE=1` | Borra las cuentas de Supabase Auth que no sean la conservada. |

> **Con `AUTH_PROVIDER=supabase`, borrar la tabla `Usuario` no alcanza.** Las
> cuentas viven en Supabase Auth y, al iniciar sesión, el guard vuelve a crear
> su fila local. Usá `LIMPIAR_SUPABASE=1` o borralas en Supabase →
> Authentication → Users.

El script aborta si el usuario a conservar no existe, para no dejar una base
sin acceso. Las migraciones (`_prisma_migrations`) quedan intactas: no hay que
volver a migrar.

## Notas y advertencias

- **Render free** duerme por inactividad: el primer request tras un rato tarda unos segundos.
- **Migraciones**: se aplican con `prisma migrate deploy` (directo, `DIRECT_URL`); la app
  en runtime usa el **pooler** (`DATABASE_URL`).
- **service_role key**: nunca en el frontend ni en variables `VITE_*`.
- **Pagos/CFE**: siguen en `mock` hasta la Etapa 2 (Mercado Pago + proveedor CFE real).
