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

_Pendiente: los escribe spec_author (F1.2)._

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
   la decide QC-20 junto con su test (`CHECKPOINTS.md > Permisos`).

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
