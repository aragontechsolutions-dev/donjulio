# Insumos y productos: quién lleva el stock de qué

Hay dos cosas que se cuentan en una panadería y conviene no mezclarlas.

- **Insumo**: lo que se compra para producir. Harina, manteca, levadura,
  azúcar. No se vende; se consume al hacer algo.
- **Producto**: lo que se vende. Una medialuna, un pan de campo, una botella
  de agua.

La confusión clásica es querer cargar una botella de agua como insumo porque
"se compra". Lo que define a un insumo no es que se compre: es que se
**consuma produciendo**. El agua se compra y se vende tal cual, así que es un
producto, no un insumo.

## Los dos caminos

```
  INSUMOS                              PRODUCTOS
  (lo que se compra para producir)     (lo que se vende)

  Harina, manteca, levadura            Medialunas, pan, agua, cerveza
       │                                      ▲          ▲
       │ entrada de remito                    │          │
       ▼                                      │          │
  stock de insumos ──── receta ──── orden de producción  │
                                     (descuenta insumos, │
                                      suma producto)     │
                                                         │
                                            entrada de mercadería
                                            (lo que se compra hecho)
```

### Lo que se hace en la panadería

1. Se cargan los **insumos** en *Stock → Insumos*, con su entrada de remito.
2. El producto tiene una **receta**: cuánta harina, cuánta manteca.
3. Se crea una **orden de producción**. Al terminarla, el sistema descuenta
   los insumos de la receta y suma el producto terminado al stock.
4. El mostrador vende y descuenta de esos lotes.

El stock de lo producido **no se carga a mano**: entra solo al terminar la
orden. Si se pudiera cargar a mano, el stock de insumos y el de productos
dejarían de cuadrar entre sí.

### Lo que se compra ya hecho (reventa)

1. El producto se marca como **reventa** y con **control de stock**.
2. Cuando llega la mercadería, se le da **entrada** en *Stock → Productos*,
   con cantidad, costo, remito y vencimiento.
3. El mostrador vende y descuenta.

No hay que cargarlo también como insumo. Durante un tiempo esa era la única
forma de darle entrada, y obligaba a llevar la misma botella por duplicado:
una como producto para venderla y otra como insumo para contarla. Ya no.

## "Lleva control de stock"

Es la casilla que decide si un producto se cuenta o no.

| Con control | Sin control |
| --- | --- |
| Se descuenta al vender | Se vende siempre, sin descontar nada |
| Se bloquea la venta si no hay | Nunca se queda "sin stock" |
| Aparece en *Stock → Productos* | Aparece abajo, para activárselo |

**Sin control** está bien para lo que se prepara al momento: un café, un
tostado, un exprimido. No tiene sentido contar unidades de café con leche.

**Con control** va para lo que se cuenta en la vitrina: lo que sale del horno
y lo que se compra hecho.

> Si importaste el catálogo por CSV y dejaste la columna **«Lleva stock»**
> vacía, los productos quedaron **sin** control, y entonces no hay dónde
> darles entrada. La vista previa de la importación ahora lo avisa cuando el
> producto es de reventa. Para arreglarlo, en *Stock → Productos* los
> encontrás abajo con el botón **«Llevar stock de este»**.

## Vencimientos

Una entrada puede llevar fecha de vencimiento. Con fecha, la venta descuenta
**primero lo que vence antes** (FEFO), que es como se rota la mercadería en el
mostrador. Sin fecha, descuenta del lote más viejo.

## Dónde está cada cosa en el panel

| Quiero… | Dónde |
| --- | --- |
| Cargar harina que llegó | Stock → Insumos → Entrada |
| Cargar un remito entero de insumos | Stock → Insumos → **+ Entrada múltiple** |
| Ver cuántas botellas quedan | Stock → Productos |
| Cargar un cajón de bebidas | Stock → Productos → Entrada |
| Que una medialuna entre al stock | Producción → terminar la orden |
| Decir de qué está hecho un producto | Recetas y costos |
| Activar el conteo de un producto | Stock → Productos → Llevar stock de este |
| Dar de baja algo roto o vencido | Mermas |
