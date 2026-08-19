# IVA en Don Julio

Cómo calcula el IVA el sistema, y qué tasa le corresponde a cada tipo de
producto de una panadería/confitería/cafetería en Uruguay.

> **Esto no es asesoramiento fiscal.** Es una propuesta de partida para que la
> revise el contador. Al final está la lista de lo que quedó sin confirmar y
> las preguntas concretas para llevarle.

---

## 1. Cómo lo calcula el sistema

**Los precios se cargan con IVA incluido.** El precio que ponés en Productos es
el que paga el cliente y el que va en la vitrina. El impuesto no se suma
encima: se saca de adentro.

```
Pan de campo   $ 180   tasa mínima (10 %)
  neto = 180 ÷ 1,10 = 163,64
  IVA  = 180 − 163,64 = 16,36
```

El IVA se calcula como **resta contra el total**, no con su propia fórmula. Así
`neto + IVA` da exactamente el precio y nunca sobra ni falta un centavo. Todo se
hace en centavos enteros: con decimales, `0.1 + 0.2` no da `0.3` y los totales
terminan descuadrando contra el arqueo de caja.

### Dónde se calcula

En `priceItems()` (`apps/api/src/orders/orders.service.ts`), que es por donde
pasan **todas** las ventas: salón, PWA de mozos, autoservicio por QR y checkout
web. Al ser un único punto, ninguna vía puede saltearlo.

### Qué se guarda

Con cada venta, congelado al momento de vender:

| Dónde        | Campos                                                                    |
|--------------|---------------------------------------------------------------------------|
| `PedidoItem` | `ivaRate`, `neto`, `ivaMonto`                                             |
| `Pedido`     | `neto`, `ivaTotal`, `netoIvaMinima`, `ivaMinima`, `netoIvaBasica`, `ivaBasica`, `montoNoGravado` |

Se guarda y no se recalcula: si mañana cambia la tasa de un producto, la venta
de ayer tiene que seguir declarando lo que efectivamente se cobró. El
comprobante fiscal lee estos campos.

### El comprobante

Antes de esto, el CFE se emitía con **IVA en cero** (`iva: 0` fijo en
`salon.service.ts`). Ahora declara el IVA real, y en un cobro parcial por
comensal declara sólo el de los ítems que se cobran en ese movimiento.

---

## 2. Tasa por tipo de producto

**Fuente primaria: artículo 101 del Decreto 220/998**, texto actualizado a
marzo de 2026. Es la reglamentación del IVA y es **taxativa**:

> *Artículo 101º.- Tasa mínima.- Pagarán la tasa mínima del tributo las
> operaciones relativas a los siguientes bienes y servicios:*
>
> *a) Pan blanco común y galleta de campaña; pescado; carne y menudencias;
> frescos, congelados o enfriados; aceites comestibles y crudos para su
> elaboración; arroz; harina de cereales y subproductos de su molienda; pastas
> y fideos; sal para uso doméstico; azúcar; yerba; café; té; jabón común;
> grasas comestibles; transporte de leche.*

Y en el literal f):

> *f) Frutas, flores y hortalizas en su estado natural, en tanto el enajenante
> sea contribuyente de los Impuestos a las Rentas de las Actividades Económicas
> y al Valor Agregado, por las enajenaciones realizadas al consumo final,
> siempre que los referidos bienes no provengan de su propia explotación
> agropecuaria.*

Como la lista es cerrada, **lo que no está ahí y no está exonerado va al 22 %**.

### Tasa mínima — 10 %

| Grupo | Qué entra |
|---|---|
| Panificados | **Sólo** pan blanco común y galleta de campaña |
| Almacén | harina y subproductos de molienda, pastas y fideos, arroz, azúcar, sal de uso doméstico, aceites comestibles, grasas comestibles |
| Infusiones | yerba, café, té |
| Proteína | carne y menudencias, pescado (frescos, congelados o enfriados); carne avícola, porcina y de conejo (art. 36 lit. L, Título 10) |
| Frutas y verduras | en estado natural, con las condiciones del literal f) |
| Otros | jabón común |

### Tasa básica — 22 %

Todo lo demás. **Para una panadería esto sorprende, y es el hallazgo más
importante de la revisión:**

| Grupo | Ejemplos |
|---|---|
| **Confitería** | medialunas, facturas, bizcochos, tortas, masas, alfajores, budines, pan dulce, postres, helados |
| **Rotisería** | empanadas, tartas, pizza, sándwiches, tostados |
| Bebidas | agua mineral, refrescos, jugos envasados, cerveza, vino |
| **Leche UHT y saborizada** | quedan fuera de la exoneración (ver más abajo) |
| **Huevos** | no están exonerados ni en tasa mínima |
| No alimentos | bolsas, souvenirs, tazas |

Ninguno de esos figura en el artículo 101. **Lo que se corrigió:** la versión
anterior de este documento los ponía a todos en tasa mínima por analogía con
"alimentos elaborados". La lista es taxativa y no admite esa analogía.

### Exento

**Fuente: artículo 38, numeral 1, del Título 10** (Texto Ordenado, actualizado
a diciembre de 2025). De toda la lista, lo que le toca a una panadería es un
solo literal, y trae una excepción que importa mucho:

> *F) Leche pasterizada, ultrapasterizada, vitaminizada, descremada, en polvo,
> **excepto la saborizada y la UHT o UAT** (ultra alta temperatura).*

O sea:

| Producto | Tasa |
|---|---|
| Leche pasteurizada, descremada, vitaminizada, en polvo | **Exenta** |
| Leche **UHT / UAT** (la de cajita larga vida) | **22 %** |
| Leche **saborizada** / chocolatada | **22 %** |

La leche UHT queda fuera de la exoneración *y* fuera de la lista de tasa
mínima — donde lo único que aparece es el *transporte* de leche, no la leche.
Así que va a básica.

**Los huevos no están exonerados.** No figuran en el artículo 38 ni en la lista
de tasa mínima: **22 %**. La versión anterior de este documento los daba por
exentos, y era un error.

Lo único otro que puede aparecer en el mostrador: **diarios, revistas y libros**
están exentos por el literal H).

Como el nombre del producto no dice el proceso, un producto llamado sólo
"Leche entera 1 L" queda propuesto como exento pero **marcado para revisar**.

### Ayuda al cargar productos

`sugerirIva(nombre)` propone la tasa y cita el literal del que sale, así quien
carga el producto ve el porqué. Cuando no reconoce el producto propone
**básica**, no mínima: siendo la lista cerrada, lo no identificado
probablemente esté fuera de ella.

Además marca **para revisar** los casos donde la norma depende de un dato que
el nombre no dice:

- **Pan**, porque la tasa mínima es para el *pan blanco común*: un integral, de
  semillas o relleno puede no calificar.
- **Leche** sin especificar el proceso, por la excepción de la UHT.

## 3. La regla del salón

Hay un interruptor en **Usuarios → Configuración fiscal**:

> **Cobrar el consumo en salón a tasa básica**

- **Apagado (por defecto).** Cada producto paga su tasa, se lo lleve el cliente
  o lo coma en la mesa. Una medialuna es 10 % siempre.
- **Prendido.** Todo lo consumido en mesa se factura como servicio gastronómico
  a 22 %. Take away y delivery no se ven afectados. Lo exento sigue exento: no
  se vuelve gravado por servirse en una mesa.

Con el artículo 101 a la vista, el argumento para prenderlo se fortalece: el
servicio de restaurante **no figura** entre los de tasa mínima, y sólo aparece
en el literal i) como parte de un paquete turístico con hospedaje. Un servicio
gastronómico suelto quedaría entonces en tasa básica.

Aun así viene apagado, porque hay una distinción que la norma no zanja sola:
vender una medialuna sobre el mostrador es **enajenación de un bien**, mientras
que servirla en la mesa con servicio puede ser **prestación de un servicio**, y
son hechos gravados distintos. Con la tabla de arriba la mayor parte de la
confitería ya está en 22 %, así que el interruptor sólo mueve la aguja en lo
que sí está en la lista: pan, café y té.

Es exactamente la pregunta 5 para el contador. Cambiarlo es marcar una casilla,
sin tocar código.

---

## 4. Qué se verificó y qué no

### Confirmado con fuente primaria

**El artículo 101 del Decreto 220/998** (arriba, citado textual) resuelve:

- Pan blanco común y galleta de campaña **al 10 %** — y sólo esos dos
  panificados.
- Confitería y rotisería **al 22 %**, por no estar en la lista.
- Carne, menudencias y pescado **al 10 %**. Queda cerrada la duda anterior de
  si la carne fresca estaba exenta: no lo está.
- Frutas, flores y hortalizas en estado natural **al 10 %**, no exentas, y con
  condiciones sobre quién vende y a quién.
- Café, té y yerba **al 10 %** como bienes.
- **El servicio de restaurante no está en la lista.** Sólo aparece en el
  literal i) como parte de un paquete turístico con hospedaje. Un servicio
  gastronómico suelto queda entonces en tasa básica.

**La exoneración del pan de 2022 no rige.** La Ley 20.028 (7/4/2022) exoneró el
pan blanco común, la galleta de campaña, las pastas y los fideos, pero por 30
días, prorrogados una única vez por el Decreto 143/022. Fue coyuntural.

### El régimen importa más que las tasas

El **artículo 106 del mismo decreto** trae algo que cambia el planteo si Don
Julio es pequeña empresa (literal E del art. 52 del Título 4):

> *Los citados contribuyentes **no deberán facturar ni liquidar el Impuesto al
> Valor Agregado** correspondiente a sus operaciones en tanto sus ingresos no
> superen el límite...*

Pagan una **cuota fija mensual** en vez de liquidar por venta: **$ 5.910 en
2026** (Dto. 310/025). Los que inician actividad pagan 25 % el primer año, 50 %
el segundo y 100 % desde el tercero, y el tope es 3,3 % de los ingresos del mes
si documentan todo con CFE.

Si ese es el caso, el comprobante **no debe discriminar IVA**, y el desglose
del sistema pasa a ser información de gestión, no un dato fiscal. Si están en
régimen general, aplica todo lo de arriba.

### Sin confirmar

Las exoneraciones ya están resueltas con el artículo 38 del Título 10. Queda:

1. **Qué es "pan blanco común".** Hay reglamentación de DGI que lo define
   (común o francés, flauta, catalán, porteño, marsellés, casero). Un pan
   integral, de semillas o relleno probablemente quede fuera y vaya al 22 %.
   Falta esa resolución para saber qué panes de la casa califican.
2. **Café servido en mesa.** Como bien está al 10 %, pero un cortado servido
   con servicio podría ser prestación de servicio y no enajenación de bien.
3. **Reducción de IVA por pago con tarjeta.** No está implementada.

### Para preguntarle al contador

1. **¿Estamos en literal E (pequeña empresa) o en régimen general?** Define si
   hay que discriminar IVA o pagar la cuota fija.
2. ¿Confirma confitería y rotisería al 22 %? Es lo que sale del artículo 101 y
   es el cambio más grande respecto de lo que estaba cargado.
3. ¿Qué panes de la casa califican como "pan blanco común"?
4. ¿Qué leche vendemos, pasteurizada o UHT? Cambia de exenta a 22 %.
5. El café servido en mesa, ¿10 % como bien o 22 % como servicio?
6. ¿Corresponde la reducción de IVA por pago con tarjeta?

### Textos que faltan conseguir

Sólo uno: la resolución de DGI que define **"pan blanco común"**.

## Fuentes

- [Ley N° 20.028 — Presidencia](https://www.gub.uy/presidencia/institucional/normativa/ley-n-20028-fecha-07042022-se-exonera-del-iva-treinta-dias-pan-blanco-comun)
- [Decreto N° 143/022 — IMPO](https://www.impo.com.uy/bases/decretos/143-2022/1)
- [Cámara de Representantes — exoneración por treinta días](http://www.diputados.gub.uy/noticias/se-aprobo-la-exoneracion-del-iva-al-pan-blanco-comun-galleta-de-campana-pasta-y-fideos-por-un-plazo-de-treinta-dias/)
- [DGI — exoneraciones vigentes en el IVA](https://www.gub.uy/direccion-general-impositiva/comunicacion/publicaciones/son-exoneraciones-vigentes-iva)
- [DGI — bienes y servicios gravados a la tasa básica](https://www.gub.uy/direccion-general-impositiva/comunicacion/publicaciones/son-bienes-servicios-gravados-tasa-basica-del-22)
- [Título 10 del Texto Ordenado (IVA), actualizado diciembre 2025](https://www.impo.com.uy/bases/todgi-2023/10-2024/10) — **fuente primaria**: art. 34 (tasas), art. 36 (tasa mínima), art. 38 (exoneraciones)
- [Decreto 220/998, texto actualizado marzo 2026 — IMPO](https://www.impo.com.uy/bases/decretos-reglamentarios-todgi/220-1998_A) — **fuente primaria de las tasas de este documento**
- [DGI — Cuota IVA mínimo, valores vigentes](https://www.gub.uy/direccion-general-impositiva/comunicacion/publicaciones/cuota-iva-minimo-valores-vigentes)
- [Decreto N° 220/998 — IMPO](https://www.impo.com.uy/bases/decretos/220-1998)
- [Ecovis Uruguay — exoneración de pan, pastas y fideos](https://www.ecovis.com/uruguay/es/blog/2022/04/13/iva-exoneracion-pan-pastas-y-fideos/)
- [RICA Consultores — restaurantes y liquidación de IVA](https://ricaconsultores.com.uy/notas-de-interes/restaurantes-y-liquidacion-de-iva-aspectos-a-tener-en-cuenta/)
