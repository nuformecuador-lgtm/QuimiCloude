# QC-49 — aislamiento-por-empresa-en-inventario · requirements.md

> **Zona:** `backend` · **Complejidad:** `medium` · **depends_on:** `QC-48`, `QC-32` (las dos `done`) ·
> **Rama:** `feature/QC-49-aislamiento-por-empresa-en-inventario`
>
> **Alcance.** Las **tres** tablas de inventario —`products`, `presentations` y `product_batches`—
> ganan `company_id` **NOT NULL** con FK a `companies`. Toda consulta y toda escritura del módulo se
> limitan a la empresa de la sesión, y el intento de leer o modificar algo de otra empresa **se
> rechaza aunque se conozca el identificador**. El filtro vive en **un único punto de consulta** del
> módulo, no repetido caso a caso. Migración con su `down.sql` y backfill de las filas vivas a la
> única empresa real. Lleva **E2E**.
>
> **Lo que NO entra.** Recetas → **QC-50**. Proveedores → **QC-59**. Pedidos → **QC-60**. La guardia
> de esquema que exige empresa en toda tabla de negocio → **QC-61**. La limpieza de las 36 empresas y
> las 113 presentaciones de residuo de tests → **QC-77**; aquí se asignan, no se borran. El
> correlativo de lote único por empresa → **QC-81**, que esta ficha **desbloquea**. Las **unidades**
> no entran porque ya las aisló **QC-76** (`company_id` opcional, con las de sistema).
>
> Sembrado por `/afinar-feature` el 2026-09-11. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-11 | ¿Qué tablas entran? | **Tres, no dos.** La tarjeta nombraba `products` y `presentations` porque se escribió **antes** de que existieran los lotes: `product_batches` nació el 2026-09-09 con QC-90. Las tres ganan `company_id` obligatorio |
| 2026-09-11 | ¿El lote lleva columna propia o hereda la empresa de su producto? | **Columna propia.** **QC-81** necesita la unicidad `(empresa, lote)` y sin columna no se puede construir. Esta ficha la desbloquea |
| 2026-09-11 | ¿De quién son las presentaciones? | **De la empresa, sin catálogo compartido.** Cada empresa tiene las suyas y no ve las de nadie más. **Se aparta a conciencia de QC-76** (D10), que hizo la empresa *opcional* en las unidades justo para que existieran las de sistema |
| 2026-09-11 | ¿Qué pasa con las filas que ya existen? | **Se asignan a «QuimiCloud»**, la única empresa real. Comprobado contra la base: 23 productos vivos, 114 presentaciones, 1 lote y 37 empresas, de las que 36 son residuo de tests |
| 2026-09-11 | ¿«La base se siembra limpia» significa vaciar el inventario? | **No.** No se borra ninguna fila. La limpieza del residuo es **QC-77** |
| 2026-09-11 | ¿Dónde se valida la frontera? | **En el service**, antes de tocar el repositorio. Heredado de `docs/architecture.md > Acceso a datos y autorizacion`: un aislamiento implementado **solo** como policy de RLS **no cuenta como implementado**, y la empresa que viaja firmada en la sesión (QC-48) tampoco autoriza por sí sola |
| 2026-09-11 | ¿Dónde vive el filtro por empresa? | **En un único punto de consulta del módulo**, no repetido en cada caso de uso. Heredado de **QC-76 D15/D16**: ninguna base lo garantiza, y la consulta nueva que se olvide de él enseña a una empresa lo que no es suyo |
| 2026-09-11 | ¿Y la RLS? | Lo que se toque conserva `ENABLE` + **`FORCE ROW LEVEL SECURITY`**, que la guardia `guard-rls-force` ya exige. Es defensa en profundidad, **no** la frontera |
| 2026-09-11 | ¿Qué pasa con el inventario de una empresa dada de baja? | **No se toca.** Heredado de **QC-76 D29** |
| 2026-09-11 | ¿Nacen permisos nuevos? | **No.** Siguen siendo `inventario.consultar` e `inventario.modificar`, que ya existen |
| 2026-09-11 | ¿Hace falta E2E? | **Sí.** `CHECKPOINTS.md` lo pide para permisos y esto es la misma familia: un fallo aquí es una **fuga de datos entre clientes**, no una molestia. Cubre que alguien de la empresa A no ve ni toca el inventario de la B ni conociendo el identificador |
| 2026-09-11 | Identificadores, marcas de tiempo y borrado | **Heredado, no se reabre.** Identificadores de base en inglés y `created_at`/`updated_at` (QC-4). `products` conserva su borrado lógico; esta ficha no cambia el de nadie |
