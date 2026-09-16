# QC-50 — aislamiento-por-empresa-en-recetas · requirements.md

> **Zona** `backend` · **Complejidad** `medium` · **depends_on** `QC-48`, `QC-32` (`done`) ·
> **Rama** `feature/QC-50-aislamiento-por-empresa-en-recetas`
>
> ## Alcance
>
> La tabla `recipes` gana `company_id` **NOT NULL** con clave foránea a `companies`. Toda consulta y
> toda escritura del módulo `recetas` se limitan a la empresa de la sesión, y leer o modificar una
> receta de otra empresa **se rechaza aunque se conozca el identificador**.
>
> Una línea de receta solo puede usar **productos de la empresa de su receta** y **unidades de
> sistema o de esa empresa**. El nombre de receta pasa a ser **único por empresa**. Además **se
> cierra el hueco que dejó QC-60**: un pedido ya no puede apuntar a una receta de otra empresa.
> Migración con su `down.sql` y backfill de las filas vivas a «QuimiCloud». Lleva **E2E**.
>
> ## Lo que NO entra
>
> - **Pasar las fotos de receta a enlaces privados**: no se hace, por decisión (decisión cerrada 5).
> - **Proveedores** → **QC-59**.
> - **La guardia de esquema** que exige empresa en toda tabla de negocio → **QC-61**.
> - **La limpieza del residuo de tests** → **QC-77**; aquí se asignan, no se borran.
> - **Inventario** ya lo aisló **QC-49**, **unidades** **QC-76** y **pedidos** **QC-60**.
>
> _Sembrado por `/afinar-feature` el 2026-09-16. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`._

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-16 | ¿Qué tablas ganan columna de empresa? | **Solo `recipes`.** Medido en la base el 2026-09-16: **5 recetas vivas, 5 líneas, 0 fotos**; todos los productos usados en líneas son de QuimiCloud y todas las unidades son de sistema |
| 2026-09-16 | ¿La línea de receta guarda su propia empresa? | **No: su empresa es la de su receta.** Una línea no se consulta fuera de su receta y se borra con ella (`ON DELETE CASCADE`), así que no hay dos datos que puedan contradecirse. **Se aparta a conciencia de QC-49 D2**, que dio columna propia al lote porque QC-81 necesitaba unicidad `(empresa, lote)`; las líneas no tienen ninguna necesidad parecida |
| 2026-09-16 | ¿Qué productos puede usar una línea? | **Solo los de la empresa de la receta.** Es el encargo que dejó escrito **QC-49**: `ProductCatalog.findRefs` quedó **sin ámbito «hasta QC-50»**, con la consecuencia aceptada de que una receta de A resolvía un producto de B. Esta ficha lo cierra. `recipe_lines.product_id` no tiene clave foránea —el producto es de otro módulo—, así que la frontera es el service |
| 2026-09-16 | ¿Qué unidades puede usar una línea? | **Las de sistema valen para todas las empresas; las de una empresa, solo para esa.** Heredado de **QC-76**, que hizo la empresa **opcional** en las unidades justamente para que existan las de sistema. Hoy las 5 líneas usan unidades de sistema |
| 2026-09-16 | ¿Las fotos de receta se aíslan por empresa? | **No. Son material de referencia, no algo privado ni crítico.** Siguen sirviéndose con **enlace público** (`getPublicUrl`). Decisión del humano. Poner la empresa en la ruta no aislaría nada, y pasar a enlaces privados no se hace |
| 2026-09-16 | ¿Se cierra el hueco pedido → receta que dejó QC-60? | **Sí, aquí.** Crear o editar un pedido con una receta de otra empresa **se rechaza igual que si la receta no existiera**. Es lo que QC-60 dejó escrito «hasta QC-50» (su *Pregunta abierta 1*). Toca el módulo `pedidos`, igual que QC-60 tocó `asignaciones` para cerrar su propio enlace. Medido: **3 pedidos apuntan a 1 sola receta**, todo de QuimiCloud |
| 2026-09-16 | ¿El nombre de receta sigue siendo único global? | **No: único dentro de cada empresa.** Dos empresas pueden tener cada una su «Desengrasante industrial». Hoy el índice `recipes_name_unique` es global sobre `name_normalized` entre recetas vivas. Heredado del mismo cambio de **QC-49 D3** en presentaciones. Medido: **ningún nombre repetido**, así que el cambio no choca con datos existentes |
| 2026-09-16 | ¿Qué pasa con las filas que ya existen? | **Se asignan a «QuimiCloud»**, la única empresa real. Heredado de **QC-49 D4** y **QC-60** |
| 2026-09-16 | ¿«La base se siembra limpia» significa vaciar recetas? | **No.** No se borra ninguna fila. Heredado de **QC-49 D5** y **QC-60**; la limpieza del residuo es **QC-77** |
| 2026-09-16 | ¿Dónde se valida la frontera? | **En el service**, antes de tocar el repositorio. Heredado de **QC-49 D6** y de `docs/architecture.md > Acceso a datos y autorizacion`: un aislamiento implementado **solo** como policy de RLS no cuenta como implementado, y la empresa que viaja firmada en la sesión (QC-48) tampoco autoriza por sí sola |
| 2026-09-16 | ¿Dónde vive el filtro por empresa? | **En un único punto de consulta del módulo**, no repetido en cada caso de uso. Heredado de **QC-49 D7**, **QC-60** y **QC-76 D15/D16** |
| 2026-09-16 | ¿Y la RLS? | `recipes` y `recipe_lines` conservan `ENABLE` + **`FORCE ROW LEVEL SECURITY`**, que la guardia `guard-rls-force` ya exige. Defensa en profundidad, **no** la frontera. Heredado de **QC-49 D8** |
| 2026-09-16 | ¿Qué pasa con las recetas de una empresa dada de baja? | **No se tocan.** Heredado de **QC-49 D9** y **QC-76 D29** |
| 2026-09-16 | ¿Nacen permisos nuevos? | **No.** Siguen siendo `recetas.consultar` y `recetas.modificar`. Heredado de **QC-49 D10** |
| 2026-09-16 | ¿Hace falta E2E? | **Sí.** `CHECKPOINTS.md` lo pide para permisos y esto es la misma familia: un fallo aquí es una **fuga de datos entre clientes**. Cubre que alguien de la empresa A no ve ni toca las recetas de la B ni conociendo el identificador. Heredado de **QC-49 D11** y **QC-60** |
| 2026-09-16 | Identificadores, marcas de tiempo, borrado y migración | **Heredado, no se reabre.** Identificadores de base en inglés y `created_at`/`updated_at` (QC-4). `recipes` conserva su borrado lógico. Migración **nueva** con su `down.sql`, que **aborta entera** en vez de descartar dato en silencio si revertir perdiera información —por ejemplo, dos empresas con el mismo nombre de receta, que harían imposible recrear el único global—. Heredado de **QC-49 R6/R7** y **QC-60** |
