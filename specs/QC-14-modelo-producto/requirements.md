# QC-14 — modelo-producto · requirements.md

> **Zona:** `backend` · **Complejidad:** `medium` · **depends_on:** `QC-15` ·
> **Rama:** `feature/QC-14-modelo-producto`
>
> **Alcance.** Persistir el catálogo de productos y el catálogo de presentaciones que los
> clasifica. Dos tablas, su relación obligatoria, la migración con su `down.sql` y los tests.
> Es la primera tabla de dominio químico del ERP.
>
> **Lo que NO entra.** El alta, la consulta, la edición y el borrado de productos, y la
> pantalla que los expone: van a **QC-20 — CRUD de productos** (épica QC-18, ya creada en el
> board y bloqueada por esta ficha). Tampoco entran las imágenes del producto, la evaluación
> de la cantidad de alerta, ni ninguna conversión entre unidades.
>
> Sembrado por `/afinar-feature` el 2026-09-01. El bloque de Alcance y la tabla de
> «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los
> reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Notación EARS (`docs/specs.md`). **«El sistema»** aquí es la **capa de persistencia** de
QuimiCloude: el esquema Prisma (`db/schema.prisma`) más la base Postgres con la migración de
esta feature aplicada. No hay servicio ni interfaz de usuario en esta ficha (decisión cerrada
n.º 2), así que ningún requisito habla de quién llama ni desde dónde.

### Estructura de la presentación

**R1.** El sistema DEBE persistir, para cada presentación, un identificador propio, estable y
no derivado de sus datos de negocio, y un nombre.

**R2.** SI se intenta persistir una presentación sin nombre, ENTONCES el sistema DEBE rechazar
la operación y no crear ninguna fila.

### Estructura del producto

**R3.** El sistema DEBE persistir, en **una única entidad de producto**, los siguientes datos:
nombre, presentación, existencia, costo, compra mínima, tiempo de entrega en días enteros,
cantidad de alerta y unidad de medida; y NO DEBE mantener ninguna entidad separada de
«elemento de inventario» con esos mismos datos.

**R4.** SI se intenta persistir un producto sin nombre o sin presentación, ENTONCES el sistema
DEBE rechazar la operación y no crear ninguna fila.

**R5.** El sistema DEBE aceptar un producto en el que la existencia, el costo, el tiempo de
entrega, la cantidad de alerta o la unidad de medida no tengan ningún valor, y DEBE
devolverlos después como ausencia de valor y no como cero ni como cadena vacía.

**R6.** SI se persiste un producto sin indicar su compra mínima, ENTONCES el sistema DEBE
registrar `0` como su compra mínima.

**R7.** El sistema DEBE almacenar la existencia, la compra mínima, la cantidad de alerta y el
tiempo de entrega como números **enteros**, sin parte decimal.

**R8.** El sistema DEBE almacenar el costo como número **decimal exacto** de 14 dígitos de
precisión y 4 decimales, DEBE devolver sin pérdida cualquier valor con hasta 4 decimales, y NO
DEBE usar ninguna representación de coma flotante binaria (`float`, `double`, `real`).

**R9.** SI se intenta persistir un producto cuya existencia, compra mínima, cantidad de alerta
o costo sea negativo, ENTONCES el sistema DEBE rechazar la operación **en la propia base de
datos** y no crear ni modificar ninguna fila.

**R10.** El sistema DEBE almacenar la unidad de medida como texto libre, y NO DEBE restringirla
a un conjunto de valores admitidos, ni normalizarla, ni derivar de ella ninguna conversión
entre unidades.

**R11.** El sistema DEBE limitarse a almacenar y devolver la cantidad de alerta tal como se
guardó, y NO DEBE compararla con la existencia, ni derivar de ella ninguna columna, estado ni
notificación de «bajo de existencias».

### Relación producto — presentación

**R12.** El sistema DEBE asociar cada producto con exactamente una presentación, y SI se
intenta persistir un producto sin presentación o con una presentación inexistente, ENTONCES
DEBE rechazar la operación y no crear ninguna fila.

**R13.** El sistema DEBE permitir que una misma presentación esté asociada a un número
ilimitado de productos.

**R14.** SI se intenta borrar una presentación que tiene al menos un producto asignado,
**incluidos los productos borrados lógicamente**, ENTONCES el sistema DEBE rechazar el borrado
y conservar tanto la presentación como sus productos sin modificar.

**R15.** MIENTRAS una presentación no tenga ningún producto asignado, el sistema DEBE permitir
su borrado.

### Nombre del producto

**R16.** El sistema DEBE aceptar dos o más productos con el mismo nombre —coincida el texto de
forma exacta o solo salvo mayúsculas y minúsculas—, sin rechazar ninguno de ellos.

### Borrado lógico y marcas de tiempo

**R17.** CUANDO se borra un producto, el sistema DEBE conservar su fila completa y registrar el
instante del borrado, sin eliminar ninguno de sus datos.

**R18.** El sistema DEBE registrar, para cada producto y cada presentación, el instante de
creación y el instante de la última modificación, y DEBE actualizar el segundo cada vez que la
fila cambia.

### Esquema, seguridad y migración

**R19.** El sistema DEBE nombrar en **inglés** todas las tablas, columnas, índices y
restricciones que cree esta feature.

**R20.** El sistema DEBE declarar `inventario` como módulo propietario de los dos modelos de
esta feature, y ningún módulo distinto de `inventario` DEBE consultarlos con el cliente Prisma.

**R21.** El sistema DEBE tener `ROW LEVEL SECURITY` activado **y forzado**
(`FORCE ROW LEVEL SECURITY`) en las dos tablas que crea esta feature.

**R22.** CUANDO se revierte la migración de esta feature, el sistema DEBE quedar exactamente en
el estado de esquema previo a aplicarla, sin dejar tablas, restricciones, índices ni columnas
residuales.

### Límite de alcance

**R23.** El sistema NO DEBE incluir en esta feature ninguna operación de alta, consulta, edición
o borrado de productos ni de presentaciones, ni adaptador driving, ruta, Server Action o
pantalla que las exponga; por lo tanto esta feature no aporta ningún flujo navegable que un
test E2E pueda visitar.

**R24.** El sistema NO DEBE incorporar ninguna dependencia de terceros nueva para cumplir los
requisitos anteriores.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con el
requisito que la hace testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | Producto y elemento de inventario son la misma tabla | R3 |
| 2 | El CRUD no entra aquí (QC-20) | R23 |
| 3 | La presentación es tabla propia `presentation (id, name)` | R1, R2, R12 |
| 4 | Presentación obligatoria, compartida y no borrable con productos | R12, R13, R14, R15 |
| 5 | Unidad única, texto libre, opcional y anotativa | R5, R10 |
| 6 | El nombre del producto no es único | R16 |
| 7 | Enteros, `cost` decimal (14,4), ninguno negativo | R7, R8, R9 |
| 8 | Obligatoriedad de cada campo y `min_purchase` con defecto 0 | R4, R5, R6 |
| 9 | Tiempo de entrega en días enteros | R3, R7 |
| 10 | La cantidad de alerta solo se almacena | R11 |
| 11 | Borrado lógico con `created_at` / `updated_at` / `deleted_at` | R17, R18 |
| 12 | Identificadores de la base en inglés | R19 |
| 13 | RLS activado y forzado en las dos tablas | R21 |
| 14 | Migración con `down.sql` que revierte al esquema exacto anterior | R22 |
| 15 | Módulo propietario `inventario` | R20 |
| 16 | E2E diferido con motivo | R23 |
| 17 | Ninguna librería nueva | R24 |

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`). Ninguna bloquea el modelo.

1. **Conjunto cerrado para la unidad de medida.** Hoy `unit` es texto libre y solo anota. Si
   más adelante hay que normalizarla (kg / L / bidón), es tabla propia o catálogo, y con
   datos ya cargados cuesta una limpieza. Se asume el riesgo a conciencia.
2. **Moneda del costo.** El ERP es de un solo tenant (`docs/architecture.md > Dominio`), así
   que la moneda es implícita y no se guarda. Si algún día hay compras en otra divisa, es
   columna nueva y conversión.
3. **Trazabilidad por lote y vencimiento** (pregunta abierta n.º 2 del dominio). No se
   decidió aquí porque el lote vive en el movimiento, no en la ficha del producto. Sigue
   abierta y sigue siendo cara: la cierra la feature que registre movimientos.
4. **Quién puede ver y tocar productos.** Es autorización de service y aquí no hay service:
   la decide QC-20 junto con su test (`docs/checkpoints-proyecto.md > Permisos`).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-01 | ¿«Producto» y «elemento de inventario» son lo mismo? | **Sí, una sola tabla.** QC-14 se reescribe: el «elemento de inventario» pasa a ser `product` y gana costo, compra mínima, tiempo de entrega y unidad |
| 2026-09-01 | ¿El CRUD entra aquí? | **No.** Ficha aparte (**QC-20**). Mismo criterio que QC-4 («el alta y el login van aparte») y que la redacción original de esta ficha |
| 2026-09-01 | Forma de la presentación | **Tabla propia** `presentation (id, name)`, con `product.presentation_id`. Ni enum de Prisma ni texto libre: tiene que crecer sin migrar lo ya guardado. La idea intermedia de `presentation (product_id, url)` con imágenes **se descartó** |
| 2026-09-01 | ¿La presentación es obligatoria? | **Sí.** Un producto no existe sin presentación. Una misma presentación la comparten muchos productos, y **no se puede borrar** una que todavía tiene productos asignados |
| 2026-09-01 | Unidad de medida (pregunta abierta n.º 1 del dominio) | **Una sola unidad por producto, sin conversiones.** Se guarda como `unit`, texto libre y **opcional**, puramente anotativo. La existencia se interpreta según la presentación del producto |
| 2026-09-01 | ¿El nombre del producto es único? | **No.** Dos productos pueden llamarse igual. Sin índice único sobre `name`. Se aparta a propósito del precedente de QC-4 (correo y usuario únicos) |
| 2026-09-01 | Tipo y precisión de los números | `stock`, `min_purchase` y `qty_alert` **enteros**; `cost` **decimal exacto `(14,4)`** — nunca `float` (`docs/architecture.md > Dominio` n.º 4). **Ninguno admite negativos**, garantizado por CHECK en la base |
| 2026-09-01 | Obligatoriedad de cada campo | `name` y `presentation_id` obligatorios. `stock`, `cost`, `delivery_time`, `qty_alert` y `unit` opcionales. `min_purchase` opcional con **valor por defecto 0** |
| 2026-09-01 | Tiempo de entrega | **Días enteros** que tarda el proveedor en traer el producto. No texto libre ni horas |
| 2026-09-01 | Cantidad de alerta | **Solo se almacena.** Sin trigger, sin columna calculada de «bajo de existencias», sin notificación. Compararla con la existencia es feature posterior — encargo ya anotado en `progress/current.md` |
| 2026-09-01 | Borrado y marcas de tiempo | **Borrado lógico**, con `created_at` / `updated_at` / `deleted_at`. Heredado de **QC-4** y reforzado por `docs/architecture.md > Dominio` n.º 3 (nada de borrado físico en tablas de operación) |
| 2026-09-01 | Idioma de los identificadores de la DB | **Inglés** (tablas, columnas, índices, restricciones). Heredado de **QC-4** |
| 2026-09-01 | RLS | **Activado y forzado** (`FORCE ROW LEVEL SECURITY`) en las dos tablas. Heredado de **QC-4 R19**. No sustituye a la autorización en el service (`docs/architecture.md > Acceso a datos y autorizacion`) |
| 2026-09-01 | Migración | `migration.sql` (UP) más `down.sql` (DOWN) obligatorio, y revertirla deja el esquema exactamente como estaba. Heredado de **QC-4 R20** |
| 2026-09-01 | Módulo propietario | `inventario`. Los dos modelos llevan `/// @module inventario` y solo sus adaptadores driven los consultan (**QC-15**) |
| 2026-09-01 | E2E | **Diferido con motivo**: no hay pantalla ni flujo navegable que visitar, es esquema y migración. Lo decide QC-20 |
| 2026-09-01 | Librería nueva | **Ninguna.** Es esquema Prisma y migración; no hay nada que delegar a una librería. Regla 7 de `CLAUDE.md` sin propuesta que abrir |
