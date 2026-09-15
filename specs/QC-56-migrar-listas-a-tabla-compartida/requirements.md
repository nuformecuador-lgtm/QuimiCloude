# QC-56 — migrar-listas-a-tabla-compartida · requirements.md

> **Zona** `frontend` · **Complejidad** `medium` · **depends_on** QC-55, QC-52, QC-57 (las tres
> hechas) · **Rama** `feature/QC-56-migrar-listas-a-tabla-compartida`
>
> **Alcance.** Las listas de **recetas** (`/produccion/formulas`) y de **proveedores**
> (`/proveedores`) montan la **tabla compartida** de QC-55 y borran su tabla, su barra y su esqueleto
> propios. Las dos **se igualan a productos**: ganan **orden por cabecera**, **busqueda** y **filtro
> por rango de fecha de creacion**, lo que ya declaran `RECIPE_QUERYABLE` y `SUPPLIER_QUERYABLE`.
> Cada gesto navega y el servidor recalcula; nada se filtra en el navegador.
>
> **Medido en disco el 2026-09-15.** Productos **ya** esta migrado (`749d850`, 2026-09-07) y el
> catalogo de proveedor tambien (enmienda de QC-44). `recipe-table.tsx` y `supplier-table.tsx` siguen
> con tabla propia, aunque el mensaje de `749d850` y la enmienda de QC-44 (l.96) dicen que recetas ya
> la usaba: **es falso**.
>
> **Lo que NO entra.**
> - **Productos** y el **catalogo de proveedor**: ya estan migrados.
> - **Volver a la pagina 1 al buscar, ordenar o filtrar**: es **QC-97, punto 4**, porque afecta a las
>   siete listas. Hoy solo el cambio de tamano vuelve a la 1 (`data-table-params.ts:56`).
> - **La prueba en iPhone real** (T13 de QC-55): pasa a **QC-114**.
> - **La tabla de ingredientes del pedido** (`order-ingredients-table.tsx`): no es un listado.
> - **El foco del filtro con dos tablas en la misma pagina** (deuda de QC-55): aqui no aplica, cada
>   pantalla monta una sola tabla.
>
> *Sembrado por `/afinar-feature` el 2026-09-15. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijo el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aqui es `## Requisitos (EARS)`.*

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **¿Y si una columna no cabe?** `DataTableColumn` sigue sin ancho (`data-table-types.ts:63-75`) y
   todas caen en el ancho por defecto de la libreria. Si alguna columna de recetas o proveedores no
   cabe, arreglarlo **toca el componente compartido**, que QC-45 y las pantallas siguientes no
   tocaron nunca. `spec_author` lo **mide** y, si hace falta tocarlo, **lo declara en `design.md`**
   para aprobarlo en F1.4. No lo decide por su cuenta.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decision |
|---|---|---|
| 2026-09-15 | ¿Que listas entran? | **Recetas y proveedores.** Productos ya esta migrado. **Reabre la enmienda de QC-44 del 2026-09-07**, que decia «la lista de PROVEEDORES no cambia» |
| 2026-09-15 | ¿Ganan capacidades o es migracion pura? | **Se igualan a productos**: orden por `name`, `createdAt` y `updatedAt`, busqueda y filtro por rango de `createdAt`, exactamente lo de `RECIPE_QUERYABLE` y `SUPPLIER_QUERYABLE` (QC-57). Nada en el navegador. **Invierte R14 de QC-26 y R11 de QC-44** (para la lista de proveedores), igual que `749d850` invirtio R13 de QC-22: lo que protegian, no filtrar dentro de la pagina ya descargada, sigue en pie |
| 2026-09-15 | ¿La prueba en iPhone real sigue bloqueando esta ficha? | **No, va a ficha propia: QC-114**, que cubre todas las pantallas que montan la tabla y esta bloqueada por esta. Esta ficha corre su E2E en Chromium y WebKit |
| 2026-09-15 | Columna de acciones | **Columna normal, `pinnable: false`, botones siempre visibles y de 44×44.** Heredado de **QC-45** |
| 2026-09-15 | ¿Quien trae los datos y quien pinta vacio, carga y error? | **La pantalla trae los datos y los pasa por props; la tabla pinta los tres estados**, y el error no se muestra como vacio. Heredado de **QC-55** |
| 2026-09-15 | Tamano de pagina | **10 y 25**, de `lib/shared/pagination`. Heredado de **QC-22** |
| 2026-09-15 | Multiplataforma | **Sin excepcion de escritorio**; scroll contenido en la tabla. Heredado de **QC-22** |
| 2026-09-15 | Asserts de los tests | **Roles ARIA, `data-testid` y constantes; nunca textos.** Heredado de **QC-22** |
| 2026-09-15 | ¿E2E? | **Si: se amplian `e2e/recetas.spec.ts` y `e2e/proveedores.spec.ts`** con busqueda y orden, sin archivo nuevo. **QC-55 lo difirio aqui** |
| 2026-09-15 | ¿Dependencia nueva? | **Ninguna.** La tabla y sus primitivas ya estan montadas |
| 2026-09-15 | ¿Zona y complejidad? | **`frontend` / `medium`.** El backend ya soporta todo; son dos pantallas y dos requisitos invertidos |
