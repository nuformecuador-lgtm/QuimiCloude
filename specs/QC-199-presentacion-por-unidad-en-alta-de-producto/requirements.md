# QC-199 — presentacion-por-unidad-en-alta-de-producto · requirements.md

> Zona: fullstack · Complejidad: medium · depends_on: — · Rama: feature/QC-199-presentacion-por-unidad-en-alta-de-producto
>
> **Alcance.** En el alta de un insumo (`PRODUCT`), el formulario deja de pedir una presentación
> y pide la **unidad** directamente. Esa unidad fija `products.unit_id`, igual que hoy lo hace la
> presentación (QC-121). El lote nuevo de un insumo se guarda sin presentación. Las lecturas que
> hoy sacan la unidad de la presentación del lote (vista de lotes, costeo) pasan a sacarla de la
> unidad del producto, para que los lotes viejos y los nuevos se vean igual. El alta de un lote
> sobre un insumo existente sigue buscando el homónimo por nombre + unidad.
>
> **Lo que NO entra.**
> - Envases (`PACKAGING`): siguen eligiendo presentación, porque el reparto del pedido necesita su contenido.
> - Máquinas (`MACHINE`) y producto terminado (`FINISHED_PRODUCT`): sin cambios.
> - Guardar en qué envase llegó el lote: no se guarda. Si hace falta, será otra ficha.
> - Migrar o limpiar los lotes que ya tienen presentación: se quedan como están.
> - Presentaciones que quedan sin uso: no se tocan.
> - Catálogo del proveedor (`SupplierCatalogLine.presentationId`): no se toca.
>
> Sembrado por `/afinar-feature` el 2026-10-04. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Vocabulario: **insumo** = producto de tipo `PRODUCT`; **envase** = `PACKAGING`; **instrumento** =
`MACHINE`; **unidad visible** = unidad de la empresa del actor o unidad de sistema; **homónimo** =
producto vivo de la misma empresa con el mismo nombre normalizado.

### Formulario de alta

- **R1** — MIENTRAS el formulario de alta tenga seleccionado el tipo insumo, el sistema DEBE mostrar
  un campo «Unidad» obligatorio y NO DEBE mostrar el campo «Presentación».
- **R2** — El selector «Unidad» del alta de insumo DEBE ofrecer todas las unidades visibles para la
  empresa del actor, incluida la unidad de sistema «unidad» (u), y ninguna otra; NO DEBE ofrecer
  una opción «sin unidad» ni aceptar texto libre.
- **R3** — MIENTRAS el formulario de alta tenga seleccionado el tipo envase, el sistema DEBE seguir
  pidiendo la presentación y NO DEBE mostrar el campo «Unidad»; MIENTRAS tenga seleccionado el
  tipo instrumento, NO DEBE mostrar ni «Unidad» ni «Presentación».
- **R4** — SI se intenta guardar un alta de insumo sin unidad elegida, ENTONCES el formulario DEBE
  mostrar el mensaje «Elige una unidad.» en el campo «Unidad», NO DEBE enviar la petición al
  servidor y DEBE conservar el resto de lo escrito.
- **R5** — CUANDO el usuario elige un insumo existente en el campo «Nombre» del alta, el formulario
  DEBE dejar preseleccionada la unidad de ese insumo, y el usuario DEBE poder cambiarla antes de
  guardar.

### Entrada y servicio del alta

- **R6** — CUANDO llega un alta de tipo insumo, el sistema DEBE exigir el identificador de la unidad
  y DEBE rechazar con `invalid_input`, sin escribir nada, el alta que no lo traiga o que traiga un
  identificador de presentación.
- **R7** — SI la unidad indicada en un alta de insumo no existe o no es visible para la empresa del
  actor, ENTONCES el sistema DEBE rechazar el alta con `invalid_input` sin escribir producto, lote
  ni asiento.
- **R8** — SI quien da de alta un insumo no tiene el permiso `inventario.modificar`, ENTONCES el
  servicio DEBE rechazar la operación con error de permiso antes de validar la entrada y antes de
  consultar unidades o productos.
- **R9** — CUANDO un alta de insumo válida no encuentra homónimo con la misma unidad, el sistema DEBE
  crear, en una sola operación atómica, el producto con la unidad elegida y su primer lote sin
  presentación, con la existencia indicada expresada en esa unidad y su asiento de apertura.
- **R10** — CUANDO un alta de insumo válida encuentra un homónimo con la misma unidad, el sistema
  DEBE agregar el lote, sin presentación, a ese producto y NO DEBE crear otro producto; SI el
  homónimo existente tiene otra unidad, ENTONCES el sistema DEBE crear un producto distinto.
- **R11** — El alta de un envase y el alta de un instrumento DEBEN conservar su comportamiento
  actual: el envase exige su presentación y cuenta su existencia en la unidad de envases; el
  instrumento no lleva unidad ni presentación.

### Base de datos

- **R12** — SI se intenta escribir un lote sin presentación cuyo producto es un insumo sin unidad,
  ENTONCES la base DEBE rechazar la escritura con el código `23514` y un identificador de error
  propio, y la aplicación DEBE traducir ese rechazo a `invalid_input`.
- **R13** — La base DEBE seguir aceptando lotes sin presentación de instrumentos (sin unidad) y de
  envases, y DEBE seguir rechazando un lote con presentación cuya unidad no coincida con la de su
  producto o cuyo producto no tenga unidad.
- **R14** — El cambio en la base DEBE poder revertirse con su `down.sql`, que restituye la regla
  anterior tal cual estaba.
- **R15** — El cambio en la base NO DEBE modificar ningún lote, producto ni presentación existente.

### Lecturas

- **R16** — Las vistas de lotes de un producto DEBEN mostrar la cantidad, lo apartado y lo
  disponible de cada lote en la unidad del producto, tenga el lote presentación o no.
- **R17** — CUANDO se calcula el coste de ingredientes de una receta —cotización, importe guardado
  del pedido y coste del lote de producto terminado—, el sistema DEBE contar los lotes de insumo
  sin presentación con su costo unitario y su disponible, en la unidad del producto, igual que los
  lotes con presentación.
- **R18** — El costeo de ingredientes DEBE seguir excluyendo los lotes sin costo unitario y los de
  instrumento, y NO DEBE cambiar el conjunto de lotes que cuenta para envases y productos
  terminados.

### Recorrido completo

- **R19** — CUANDO un usuario con `inventario.modificar` da de alta desde la pantalla de inventario
  un insumo eligiendo una unidad, el sistema DEBE mostrarlo en el listado con su existencia en esa
  unidad y su lote en el panel de lotes con esa misma unidad; y CUANDO da de alta otro lote del
  mismo nombre y la misma unidad, la existencia de ese mismo producto DEBE aumentar.

### Cobertura de las decisiones cerradas

| Decisión | Requisitos |
|---|---|
| Solo `PRODUCT`; `PACKAGING`, `MACHINE` y `FINISHED_PRODUCT` sin cambios | R1, R3, R11, R13, R18 |
| No se guarda el envase de origen del lote | R6, R9, R10 |
| Lotes existentes sin migración; lecturas por la unidad del producto | R15, R16, R17 |
| Presentaciones sin uso: no se tocan | R15 |
| Selector con todas las unidades de la empresa, incluida «unidad» (u) | R2 |
| La base rechaza el lote de insumo cuyo producto no tiene unidad | R12, R13, R14 |
| Permiso heredado `inventario.modificar`, en el servicio | R8 |
| Identidad del insumo: nombre + unidad | R10 |
| E2E | R19 |

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-04 | ¿A qué tipos afecta? | Solo `PRODUCT`. `PACKAGING` conserva la presentación (el reparto del pedido usa su contenido). `MACHINE` y `FINISHED_PRODUCT`, sin cambios. |
| 2026-10-04 | ¿Se guarda el envase de origen del lote? | No. El lote del insumo solo lleva la cantidad en la unidad del producto. |
| 2026-10-04 | ¿Qué pasa con los lotes existentes con presentación? | Se quedan como están, sin migración. Las lecturas usan la unidad del producto. |
| 2026-10-04 | ¿Qué pasa con las presentaciones que quedan sin uso? | Fuera de alcance: no se tocan. |
| 2026-10-04 | ¿Qué unidades ofrece el selector? | Todas las del catálogo de la empresa, incluida la unidad de sistema «unidad» (u), para insumos que se cuentan. |
| 2026-10-04 | ¿La base rechaza un lote de insumo cuyo producto no tiene unidad? | Sí. Se ajusta el control de la base que ya existe (`product_batches_check_unit`): un lote sin presentación solo entra si su producto tiene unidad. |
| 2026-10-04 | Permiso | Heredado: `inventario.modificar`, validado en el servicio. |
| 2026-10-04 | Identidad del insumo | Heredada de QC-121: nombre + unidad. |
| 2026-10-04 | E2E | Sí: el alta de un lote es un movimiento de inventario (`CHECKPOINTS.md`). |
