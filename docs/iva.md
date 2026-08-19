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

Tres regímenes: **básica 22 %**, **mínima 10 %** y **exento**.

El criterio que surge de la normativa es el grado de elaboración: lo que se
vende en estado natural queda exento, la canasta de alimentos elaborados va a
tasa mínima, y el resto a básica.

### Exento

| Producto                                   | Nota                              |
|--------------------------------------------|-----------------------------------|
| Leche fluida (entera, descremada, UHT)      | Sin elaborar                      |
| Huevos                                      |                                   |
| Frutas, verduras y hortalizas en estado natural |                               |

### Tasa mínima — 10 %

Es la que más aplica en una panadería.

| Grupo             | Ejemplos                                                        |
|-------------------|-----------------------------------------------------------------|
| Pan y panificados | pan de campo, francés, flauta, catalán, marsellés, galleta de campaña |
| Confitería        | medialunas, facturas, bizcochos, alfajores, budines, tortas, masas |
| Salados           | empanadas, tartas, pizza, sándwiches, tostados                   |
| Cafetería         | café, cortado, capuchino, té, submarino, chocolatada             |
| Almacén           | harina, fideos, arroz, polenta, avena, azúcar, aceite, sal, vinagre, yerba |
| Otros elaborados  | quesos, manteca, yogur, dulce de leche, mermelada, miel, helados, postres |
| Carnes            | carne, pollo, pescado, milanesas                                 |

### Tasa básica — 22 %

| Grupo                | Ejemplos                                              |
|----------------------|-------------------------------------------------------|
| Bebidas embotelladas | agua mineral, refrescos, jugos envasados, energizantes |
| Alcohol              | cerveza, vino, espumantes, licores                     |
| No alimentos         | bolsas, souvenirs, tazas, artículos de regalo          |

### Ayuda al cargar productos

`sugerirIva(nombre)` propone una tasa a partir del nombre y explica por qué.
Está verificada contra 29 productos típicos. Es **una ayuda, no la definición**:
la tasa que vale es la que queda guardada en cada producto.

Cuando no reconoce el producto, propone tasa mínima y lo marca para revisar.

---

## 3. La regla del salón

Hay un interruptor en **Usuarios → Configuración fiscal**:

> **Cobrar el consumo en salón a tasa básica**

- **Apagado (por defecto).** Cada producto paga su tasa, se lo lleve el cliente
  o lo coma en la mesa. Una medialuna es 10 % siempre.
- **Prendido.** Todo lo consumido en mesa se factura como servicio gastronómico
  a 22 %. Take away y delivery no se ven afectados. Lo exento sigue exento: no
  se vuelve gravado por servirse en una mesa.

Está apagado porque **las fuentes públicas no coinciden** en si una confitería
debe hacerlo — ver más abajo. Cambiarlo es marcar una casilla, sin tocar código.

---

## 4. Qué se verificó y qué no

### Confirmado

**La exoneración del pan de 2022 no rige.** La Ley 20.028 (7/4/2022) exoneró de
IVA en etapa minorista al pan blanco común, la galleta de campaña, las pastas y
los fideos, pero **por 30 días**, prorrogados una única vez por el Decreto
143/022 hasta junio de 2022. Fue una medida coyuntural, no una exoneración
permanente. Hoy esos productos vuelven a tributar tasa mínima.

Esto importa porque es fácil recordar mal el titular de 2022 y dejar el pan
exento.

### Sin confirmar

No pude llegar a las fuentes primarias: el proxy de red de este entorno bloquea
`dgi.gub.uy`, `impo.com.uy` y `gub.uy`. Lo de arriba sale de fuentes
secundarias que **se contradicen entre sí** en estos puntos:

1. **Consumo en el local.** Una fuente dice que el servicio gastronómico va a
   tasa básica 22 %; otra, orientada a restaurantes uruguayos, dice que
   restaurantes y confiterías van al 10 %. Es la diferencia más cara de todas.

2. **Carne fresca.** Una fuente la da como exenta, otra a tasa mínima.

3. **Pan: exento o 10 %.** Varias fuentes dicen que "pan y leche fluida" están
   exentos. Otras, que el pan blanco común va al 10 % y sólo la leche está
   exenta. Acá se tomó **pan al 10 %**, que es lo consistente con que la Ley
   20.028 haya tenido que exonerarlo temporalmente: si ya hubiera estado
   exento, la ley no habría hecho falta.

4. **Grado de elaboración en confitería.** No conseguí el texto del artículo
   que lista los productos de tasa mínima, así que la clasificación de tortas,
   masas y postres es por analogía con "alimentos elaborados".

### Para preguntarle al contador

1. El consumo en mesa, ¿se factura como servicio gastronómico a 22 % o mantiene
   la tasa de cada producto? *(Define si prendemos el interruptor del salón.)*
2. ¿Confirma pan y panificados a tasa mínima?
3. ¿Leche fluida exenta y huevos exentos?
4. Tortas, masas y postres elaborados en el local, ¿tasa mínima?
5. Café y cafetería preparada, ¿tasa mínima o básica?
6. ¿Corresponde el régimen de reducción de IVA por pago con tarjeta? No está
   implementado y habría que agregarlo si aplica.

---

## Fuentes

- [Ley N° 20.028 — Presidencia](https://www.gub.uy/presidencia/institucional/normativa/ley-n-20028-fecha-07042022-se-exonera-del-iva-treinta-dias-pan-blanco-comun)
- [Decreto N° 143/022 — IMPO](https://www.impo.com.uy/bases/decretos/143-2022/1)
- [Cámara de Representantes — exoneración por treinta días](http://www.diputados.gub.uy/noticias/se-aprobo-la-exoneracion-del-iva-al-pan-blanco-comun-galleta-de-campana-pasta-y-fideos-por-un-plazo-de-treinta-dias/)
- [DGI — exoneraciones vigentes en el IVA](https://www.gub.uy/direccion-general-impositiva/comunicacion/publicaciones/son-exoneraciones-vigentes-iva)
- [DGI — bienes y servicios gravados a la tasa básica](https://www.gub.uy/direccion-general-impositiva/comunicacion/publicaciones/son-bienes-servicios-gravados-tasa-basica-del-22)
- [Título 10 del Texto Ordenado (IVA) — IMPO](https://www.impo.com.uy/bases/todgi-2023/10-2024/10)
- [Decreto N° 220/998 — IMPO](https://www.impo.com.uy/bases/decretos/220-1998)
- [Ecovis Uruguay — exoneración de pan, pastas y fideos](https://www.ecovis.com/uruguay/es/blog/2022/04/13/iva-exoneracion-pan-pastas-y-fideos/)
- [RICA Consultores — restaurantes y liquidación de IVA](https://ricaconsultores.com.uy/notas-de-interes/restaurantes-y-liquidacion-de-iva-aspectos-a-tener-en-cuenta/)
