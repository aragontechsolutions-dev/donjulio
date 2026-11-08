# Mudar la base a Estados Unidos

La base está en São Paulo y la API en Oregon: cada consulta cruza el continente
y vuelve. Medido sobre producción, `/api/health` (que no toca la base) responde
en ~0,3 s y `/api/menu` (que sí) en ~1,9 s. Ese segundo y medio de diferencia es
el viaje a São Paulo, y se paga en cada pantalla.

Supabase no permite cambiar la región de un proyecto, así que la mudanza es
crear un proyecto nuevo en Oregon —la misma región que Render— y apuntar todo
ahí.

> **Qué NO arregla esta mudanza:** la primera carga del día lenta (30-40 s). Eso
> es el plan free de Render, que apaga el servicio a los 15 minutos sin tráfico.
> Se arregla con el plan Starter (US$ 7/mes) o con un ping cada 10-14 minutos.

---

## 0. Antes de empezar

Tené a mano, del proyecto **viejo**:

- La URL del proyecto: `https://<ref-viejo>.supabase.co`
- La `service_role` key (Settings → API)
- La contraseña de la base (si no la tenés, Settings → Database → Reset
  database password; ojo que eso rompe la conexión actual hasta que actualices
  Render)

Y una copia de seguridad, por si acaso:

1. **El catálogo**: panel → Productos → *Exportar CSV*. Guardalo.
2. **La base entera**, si tenés Docker Desktop andando:

   ```powershell
   npx supabase@latest db dump --remote="postgresql://postgres:<PASS>@db.<ref-viejo>.supabase.co:5432/postgres" --schema public -f respaldo-viejo.sql
   ```

   Si no tenés Docker no importa: el CLI de Supabase lo necesita, pero la copia
   de los datos (paso 4A) se hace con un script del repo que no lo usa, y el
   proyecto viejo no se borra hasta el final, así que el respaldo real es el
   proyecto viejo en sí.

---

## 1. Crear el proyecto nuevo

En [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**:

| Campo | Valor |
| --- | --- |
| Name | `donjulio` (o `donjulio-us`, para distinguirlo del viejo) |
| Database Password | una nueva, **guardala** — no se vuelve a mostrar |
| Region | **West US (Oregon)** `us-west-2` |

Oregon y no otra: es donde está la API en Render, y lo que queremos es que la
base y la API estén en el mismo lugar.

Tarda un par de minutos en quedar listo.

## 2. Anotar las credenciales nuevas

**Connect** (arriba, al lado del nombre del proyecto) → pestaña **ORMs** →
Prisma. Copiá los dos strings tal como los da el panel y reemplazá
`[YOUR-PASSWORD]` por la contraseña del paso 1:

- El de **puerto 6543** (transaction / pooler) → `DATABASE_URL`, con
  `?pgbouncer=true` al final.
- El de **puerto 5432** (session / directo) → `DIRECT_URL`. Es el que usa
  `prisma migrate`.

De **Settings → API** copiá:

- Project URL → `SUPABASE_URL` (y `VITE_SUPABASE_URL`)
- `anon` key → `VITE_SUPABASE_ANON_KEY`
- `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

De **Settings → API → JWT Settings** copiá el **JWT Secret** →
`SUPABASE_JWT_SECRET` (sólo si la API corre con `AUTH_PROVIDER=supabase`; ver
paso 6).

> La `service_role` key es la llave maestra de la base: va en el `.env` local
> (que está en `.gitignore`) y en Render. **Nunca** en una variable `VITE_*`,
> nunca en un commit.

## 3. Elegir la ruta

Hay tres formas de llenar la base nueva. No son equivalentes:

### Ruta A — Copia completa

Se copia la base vieja tal cual, historial incluido: productos, insumos,
recetas, proveedores, zonas, mesas con sus QR, plano del salón, landing,
horarios, estaciones, kiosco de fichaje, y además las ventas, cajas y turnos
que ya pasaron. El usuario `henry@donjulio.uy` de la tabla `Usuario` viene
incluido.

### Ruta B — Configuración sí, historial no (recomendada)

La misma copia, pero sin lo que pasó por la caja. Viene todo lo que está
**configurado** —catálogo con sus fotos, recetas, insumos, proveedores con sus
RUT y contactos, mesas con los **mismos tokens de QR**, plano del salón,
landing, horarios, estaciones, octógonos, modificadores, números de empleado y
PIN de fichaje— y la base arranca **sin una sola venta, caja, turno, lote ni
encargo**.

Es la que buscás si los datos de prueba sobran pero la configuración no: el
primer movimiento de la base nueva es una operación real.

### Ruta C — Arranque limpio + CSV

Base vacía y se importa el catálogo desde el CSV. El CSV lleva los productos
con todos sus datos y la dirección de su foto, pero **nada más**: recetas,
insumos, proveedores (más allá del nombre), mesas y QR, plano del salón,
landing, horarios, estaciones, octógonos y modificadores hay que volver a
cargarlos a mano desde el panel.

Tiene sentido si además de las ventas querés rehacer la configuración, o si el
catálogo que vas a cargar no es el que está en la base vieja.

> **Ojo con los QR ya impresos.** Cada mesa tiene un token único en su QR. En
> las rutas A y B los tokens viajan y los QR pegados en las mesas siguen
> andando; en la C se generan nuevos y hay que volver a imprimirlos.

> En los comandos de acá en adelante, las variables que se escriben en la
> consola (`$env:...` en PowerShell) tienen prioridad sobre lo que esté en el
> `.env`, así que se puede combinar: lo fijo en el archivo, lo de una sola
> corrida en la consola.

---

## 4AB. Rutas A y B: copiar la base

En el `.env` local, poné `DATABASE_URL` y `DIRECT_URL` apuntando a la base
**nueva** (paso 2) y creá el esquema:

```bash
pnpm --filter @donjulio/api prisma:deploy
```

Eso deja las tablas vacías en el proyecto nuevo. Ahora traé los datos del
viejo con el script de copia:

```powershell
$env:DATABASE_URL_ORIGEN="postgresql://postgres:<PASS-VIEJA>@db.<ref-viejo>.supabase.co:5432/postgres"
pnpm --filter @donjulio/api copiar:base
```

**Para la ruta B** (sin historial), agregá una variable más antes de correrlo:

```powershell
$env:SIN_OPERACIONES="1"
```

El script lee las tablas del proyecto viejo y las escribe en el nuevo en el
orden correcto (primero las categorías, después los productos, después los
ítems de pedido), respetando los decimales, las fechas y las relaciones. No
necesita pg_dump, psql ni Docker: usa Prisma, que ya está instalado.

Va imprimiendo tabla por tabla y termina con el total:

```
Sin operaciones: se saltean 20 tabla(s) de historial.

  ✓ Categoria: 6/6
  ✓ Producto: 11/11
  ✓ Receta: 2/2
  ...
64 fila(s) copiada(s) en 19 tabla(s) con datos.
Todo copiado.
```

Con `SIN_OPERACIONES=1` quedan afuera estas 20: `Cliente`, `Pedido`,
`PedidoItem`, `PedidoItemModifier`, `OrderStatusEvent`, `Payment`,
`WebhookEvent`, `Propina`, `Comprobante`, `CashSession`, `CashMovement`,
`Shift`, `CustomOrder`, `Deposito`, `Reserva`, `MovimientoStock`, `InsumoLote`,
`ProductionLot`, `OrdenProduccion` y `Merma`. Es decir: ni ventas, ni pagos, ni
cajas, ni turnos fichados, ni stock cargado, ni encargos, ni reservas, ni
clientes de prueba. Nada de lo que se conserva apunta a esas tablas, así que no
quedan referencias colgadas.

Ojo con una consecuencia: **los lotes de stock también son operaciones**, así
que la base nueva arranca con stock en cero. Los productos que llevan stock hay
que darles la entrada inicial desde el panel (o producir la primera tanda) antes
de venderlos en el mostrador.

En las dos puntas conviene usar la conexión **directa** (puerto 5432), no el
pooler: son muchas consultas seguidas.

Si el destino ya tiene datos el script se detiene y no toca nada. Para
reemplazarlos (por ejemplo si la primera corrida quedó a medias):

```powershell
$env:VACIAR_DESTINO="1"
pnpm --filter @donjulio/api copiar:base
```

Seguí en el paso 5.

## 4C. Ruta C: base vacía + CSV

Con el `.env` apuntando a la base nueva:

```bash
pnpm --filter @donjulio/api prisma:deploy
```

Eso crea las tablas vacías. El catálogo se importa después de poder entrar al
panel (paso 7), desde **Productos → Carga masiva**, con el CSV que exportaste en
el paso 0. La importación crea las categorías y los proveedores que falten, así
que no hay que prepararlos antes.

El CSV incluye la columna **Imagen** con la dirección de la foto de cada
producto, así que las fotos se recuperan solas al importar. Para que esas
direcciones no apunten al proyecto viejo, el orden es: copiar los archivos del
bucket (paso 7 con `SOLO_ARCHIVOS=1`), importar el CSV, y recién después
reescribir las URLs (paso 7 con `SOLO_URLS=1`).

Si exportaste el CSV con una versión anterior del sistema no va a tener esa
columna: volvé a exportarlo desde el panel antes de mudarte, o cargá las fotos
a mano después.

---

## 5. El usuario `henry@donjulio.uy`

Si copiaste la base (rutas A o B), junto con henry vinieron también los
usuarios de demo del seed (`admin@`, `caja@`, `mozo@donjulio.uy`, todos con la
misma contraseña conocida). **Borralos o desactivalos** desde el panel →
Usuarios antes de empezar a operar: son tres puertas abiertas con la llave
puesta.

Después, hay una distinción que cambia los pasos. En Render, mirá la variable
`AUTH_PROVIDER`:

### Si `AUTH_PROVIDER=local`

El login lo hace la API con su propio JWT contra la tabla `Usuario`. El UID de
Supabase Auth no se usa para nada. Con las rutas A y B el usuario ya vino en la
copia y no hay nada que hacer. Con la C hay que crearlo (panel → Usuarios, o el
seed) y ponerle una contraseña.

### Si `AUTH_PROVIDER=supabase`

El login lo hace Supabase Auth, y el proyecto nuevo tiene `auth.users` vacío:
hay que volver a crear el usuario ahí. El UID se puede conservar —Supabase deja
elegir el UUID al crear, aunque no cambiarlo después— con el script de
provisión:

```powershell
$env:SUPABASE_URL="https://<ref-nuevo>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<service_role nueva>"
$env:USUARIO_EMAIL="henry@donjulio.uy"
$env:USUARIO_PASSWORD="<la contraseña que quieras>"
$env:USUARIO_ROL="ADMIN"
$env:USUARIO_NOMBRE="Henry"
$env:USUARIO_UID="ce66b88f-29f9-4ea5-bff5-2905201a7def"
pnpm --filter @donjulio/api provision:supabase
```

Tiene que imprimir:

```
✅ creado henry@donjulio.uy (ADMIN) → ce66b88f-29f9-4ea5-bff5-2905201a7def
```

Si en cambio dice que ya existe con otro id, borralo en **Authentication →
Users** del proyecto nuevo y volvé a correr el script: el UID no se puede
cambiar en caliente.

El rol queda en `app_metadata.role`, que es de donde lo lee la API. La fila de
la tabla `Usuario` la crea la propia API en el primer login, emparejando **por
email** (`apps/api/src/auth/guards.ts`), así que el UID no queda guardado en la
base de la aplicación: conservarlo sirve para que el panel de Supabase siga
mostrando el mismo usuario, no porque el software lo necesite.

> Si la contraseña de henry era la de Supabase Auth y no la recordás, poné una
> nueva acá: el script la actualiza igual si el usuario ya existe.

## 6. Prender RLS

Row Level Security no está activo por defecto en tablas creadas por Prisma, y
sin ella cualquiera con la `anon` key puede leer las tablas desde afuera. En el
proyecto nuevo: **SQL Editor** → pegar el contenido de
[`docs/rls.sql`](./rls.sql) → **Run**.

Ese script prende RLS en todas las tablas del esquema `public` y no crea
políticas: la API entra con la `service_role` key, que pasa por encima de RLS,
y el frontend no consulta la base directo. Resultado: el panel sigue
funcionando igual y desde afuera no se lee nada.

Verificá en **Table Editor** que las tablas ya no digan *Unrestricted*.

## 7. Storage: el bucket y las imágenes

Las fotos no están en la base: están en Supabase Storage, y lo que la base
guarda es la URL pública completa, con el dominio del proyecto **viejo** adentro.
Copiar la base no copia las imágenes.

El bucket `donjulio` la API lo crea solo la primera vez que se sube una imagen,
pero las fotos ya cargadas hay que mudarlas. Con el `.env` local apuntando a la
base y al Supabase **nuevos**:

```powershell
$env:SUPABASE_URL_ORIGEN="https://<ref-viejo>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY_ORIGEN="<service_role vieja>"
pnpm --filter @donjulio/api migrar:storage
```

El script baja cada archivo del bucket viejo, lo sube al nuevo con la misma
ruta, y después reescribe las URLs guardadas en `Producto.imagenUrl`,
`Galeria.imagenUrl`, `SalonPlano.imagenUrl` y las fotos de fichaje. Se puede
correr más de una vez sin duplicar nada.

Opciones: `SOLO_ARCHIVOS=1` copia sin tocar la base, `SOLO_URLS=1` sólo
reescribe.

## 8. Cambiar las variables en Render y Vercel

**Render** (donjulio-api → Environment):

| Variable | Valor nuevo |
| --- | --- |
| `DATABASE_URL` | pooler 6543 del proyecto nuevo, con `?pgbouncer=true` |
| `DIRECT_URL` | directo 5432 del proyecto nuevo |
| `SUPABASE_URL` | `https://<ref-nuevo>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | la nueva |
| `SUPABASE_JWT_SECRET` | el nuevo (sólo si `AUTH_PROVIDER=supabase`) |

Guardar dispara un redeploy. El `startCommand` corre `prisma migrate deploy`,
así que si quedó algo sin migrar, se completa ahí.

**Vercel** (los dos proyectos: web y PWA de mozos) → Settings → Environment
Variables:

| Variable | Valor nuevo |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://<ref-nuevo>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | la `anon` nueva |

Vercel no toma las variables nuevas hasta que se redeploya: Deployments → el
último → *Redeploy*.

> `VITE_*` viaja al navegador. Ahí va la `anon` key y nunca la `service_role`.

## 9. Verificar

En este orden, y recién después borrar nada:

1. `https://<api>.onrender.com/api/health` responde `ok`.
2. `https://<api>.onrender.com/api/menu` devuelve los productos. Cronometralo:
   tiene que bajar de ~1,9 s a ~0,4 s.
3. Entrar al panel con `henry@donjulio.uy` y que entre como **admin** (que se
   vean Usuarios, Caja, Proveedores: lo que sólo ve un admin).
4. Las miniaturas de los productos se ven (si no, falta el paso 7).
5. Abrir caja, hacer una venta de mostrador de prueba, cerrarla. Es el camino
   que toca más tablas de una vez.
6. En la ruta C: importar el CSV del catálogo y revisar precios, IVA y
   "se vende por" de dos o tres productos.
7. Escanear un QR de mesa y ver que el autoservicio levante el menú.

## 10. Borrar el proyecto viejo

**Recién cuando los 7 puntos del paso 9 pasen**, y dejando pasar unos días por
si aparece algo. El proyecto viejo no molesta: en free no cuesta nada y queda
como respaldo caliente.

Para borrarlo: Settings → General → Delete project. No tiene vuelta atrás.

Antes de borrarlo, confirmá que las miniaturas del panel ya **no** apunten al
dominio viejo: click derecho en una foto → copiar dirección de la imagen, y
mirar que diga `<ref-nuevo>.supabase.co`.

## Si algo sale mal

Volver atrás es cambiar en Render `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`
y `SUPABASE_SERVICE_ROLE_KEY` a las del proyecto viejo (y en Vercel las
`VITE_SUPABASE_*`), y redeployar. Por eso el proyecto viejo se borra último y no
primero.

Errores típicos:

| Síntoma | Causa |
| --- | --- |
| `Can't reach database server` en Render | `DATABASE_URL` sin `?pgbouncer=true`, o contraseña con caracteres sin escapar en la URL |
| `prepared statement already exists` | se usó el pooler 6543 en `DIRECT_URL`; ahí va el 5432 |
| Login entra pero sin permisos de admin | falta `app_metadata.role=ADMIN`: correr de nuevo el paso 5 |
| Miniaturas rotas | paso 7 sin hacer, o el bucket quedó privado |
| `column ... does not exist` | la base nueva quedó sin migrar: `prisma migrate deploy` |
| `copiar:base` dice "el destino ya tiene datos" | ya se corrió antes: `VACIAR_DESTINO=1` para rehacerlo |
| `copiar:base` corta por timeout | usar la conexión directa (5432) en vez del pooler, o bajar el lote: `LOTE=100` |
