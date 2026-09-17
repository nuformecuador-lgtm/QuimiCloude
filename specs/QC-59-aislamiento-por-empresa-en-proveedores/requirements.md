# QC-59 — aislamiento-por-empresa-en-proveedores · requirements.md

> **Zona** `backend` · **Complejidad** `medium` · **`depends_on`** `QC-48`, `QC-49` ·
> **Rama** `feature/QC-59-aislamiento-por-empresa-en-proveedores`
>
> **Alcance.** Los proveedores y las líneas de su catálogo pasan a pertenecer cada uno a una
> empresa. Toda consulta y toda escritura de proveedores se limitan a la empresa de quien pide, y
> leer o modificar un proveedor de otra empresa se rechaza aunque se conozca su identificador. Una
> línea solo puede apuntar a una presentación de su propia empresa, y a una unidad de sistema o de
> su empresa. Es el **último módulo del arco multiempresa**: inventario lo aisló QC-49, unidades
> QC-76, pedidos QC-60 y recetas QC-50.
>
> **Lo que NO entra.** La guardia de esquema que exige empresa en toda tabla de negocio
> (**QC-61**, que esta ficha desbloquea) y la limpieza del residuo de tests (**QC-77**).
>
> Sembrado por `/afinar-feature` el 2026-09-17. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-17 | ¿Qué tablas ganan columna de empresa? | **Las dos: `suppliers` y `supplier_catalog_lines`.** **Se aparta a conciencia de QC-50 D2**, donde la línea de receta **no** lleva columna y hereda la de su cabecera: aquí la línea la necesita para poder ser **origen** de las claves foráneas compuestas de las dos filas siguientes |
| 2026-09-17 | ¿Cómo se impide que la empresa de la línea contradiga la de su proveedor? | **Clave foránea compuesta** `(company_id, supplier_id)` → `suppliers(company_id, id)`. Es lo que **elimina** el riesgo que motivó QC-50 D2 —dos datos que pueden contradecirse— en vez de esquivarlo no teniendo columna |
| 2026-09-17 | ¿Cómo se impide que una línea apunte a una presentación de otra empresa? | **En la base, con clave foránea compuesta** `(company_id, presentation_id)` → `presentations(company_id, id)`. La base lo vuelve **imposible**, sin un solo `SELECT` |
| 2026-09-17 | ¿Se reabre el acoplamiento entre `proveedores` e `inventario`? | **No. La decisión 3 de QC-52 queda INTACTA**: no nace ningún puerto de `proveedores` hacia `inventario`. Esa ficha quitó a propósito la consulta que resolvía referencias del catálogo de artículos y dejó escrito que volver a atarlos «contradiría la ficha entera». La frontera de la presentación la pone la base, no una pregunta entre módulos |
| 2026-09-17 | ¿Qué cuesta esa decisión? | **Dos índices únicos nuevos como destino de las claves foráneas**: `(company_id, id)` en `presentations` y en `suppliers`. Postgres exige que las columnas referenciadas sean únicas. Son **redundantes por definición** —la clave primaria ya lo garantiza— y su único fin es ese. **Uno de ellos toca una tabla de `inventario`**: verificado el 2026-09-17 que hoy no existe ninguno de los dos |
| 2026-09-17 | ¿Y la unidad de la línea? | **Se valida en el service**: las de sistema valen para todas las empresas, las de una empresa solo para esa. Heredado de **QC-50 D4** y **QC-76**, que hizo la empresa **opcional** en unidades justamente para que existan las de sistema. Una clave foránea compuesta **no puede** expresar «la de sistema o la mía»: con `company_id` en la línea, una unidad de sistema sería rechazada. **Esto sí añade una consulta de `proveedores` hacia `unidades`** —no hacia `inventario`—, y queda dicho porque roza el espíritu de QC-52 aunque no su letra. Medido: la única línea viva usa una unidad de sistema |
| 2026-09-17 | ¿El nombre de proveedor sigue siendo único global? | **No: único dentro de cada empresa.** Heredado de **QC-49 D3** y **QC-50 D7**. **El índice `suppliers_name_unique` es PARCIAL** (`WHERE deleted_at IS NULL`) y **tiene que seguir siéndolo**: si se perdiera el `WHERE`, dar de baja un proveedor dejaría su nombre **ocupado para siempre**. Es la misma trampa que QC-50 cazó al copiar el molde de QC-49, que allí era total. Medido: ningún nombre repetido hoy |
| 2026-09-17 | ¿Cambia la unicidad de la línea de catálogo? | **No.** Sigue siendo `(supplier_id, name_normalized, presentation_id)`, ya parcial: `supplier_id` implica la empresa, así que añadirla sería redundante |
| 2026-09-17 | ¿Las imágenes de las líneas se aíslan por empresa? | **No.** Siguen sirviéndose con **enlace público**. Heredado de **QC-50 D5**: son material de referencia comercial, no algo crítico. Medido: **0 líneas con imagen** |
| 2026-09-17 | ¿Qué pasa con las filas que ya existen? | **Se asignan a «QuimiCloud»**, la única empresa real. Medido el 2026-09-17: **51 proveedores vivos** y **1 línea viva**, con presentación de QuimiCloud. Heredado de **QC-49 D4**, **QC-60** y **QC-50 D8** |
| 2026-09-17 | ¿«La base se siembra limpia» significa vaciar proveedores? | **No.** No se borra ninguna fila. Heredado de **QC-49 D5**, **QC-60** y **QC-50 D9**; la limpieza del residuo de tests es **QC-77**. De las 48 empresas, solo QuimiCloud es real |
| 2026-09-17 | ¿Dónde se valida la frontera? | **En el service**, antes de tocar el repositorio. Heredado de **QC-49 D6** y de `docs/architecture.md > Acceso a datos y autorizacion`: un aislamiento implementado **solo** como policy de RLS no cuenta como implementado |
| 2026-09-17 | ¿Dónde vive el filtro por empresa? | **En un único punto de consulta del módulo**, no repetido en cada caso de uso. Heredado de **QC-49 D7**, **QC-60**, **QC-76 D15/D16** y **QC-50 D11** |
| 2026-09-17 | ¿Y la RLS? | `suppliers` y `supplier_catalog_lines` conservan `ENABLE` + **`FORCE ROW LEVEL SECURITY`**, que la guardia `guard-rls-force` ya exige. Defensa en profundidad, **no** la frontera. Heredado de **QC-49 D8** |
| 2026-09-17 | ¿Qué pasa con los proveedores de una empresa dada de baja? | **No se tocan.** Heredado de **QC-49 D9**, **QC-76 D29** y **QC-50 D13** |
| 2026-09-17 | ¿Nacen permisos nuevos? | **No.** Siguen siendo `proveedores.consultar` y `proveedores.modificar`. Heredado de **QC-49 D10** |
| 2026-09-17 | ¿Hace falta E2E? | **Sí.** `CHECKPOINTS.md` lo pide para permisos y esto es la misma familia: un fallo aquí es una **fuga de datos entre clientes**. Cubre que alguien de la empresa A no ve ni toca los proveedores de la B ni conociendo el identificador. Heredado de **QC-49 D11**, **QC-60** y **QC-50 D15** |
| 2026-09-17 | ¿Hay algún hueco heredado que cerrar desde otro módulo? | **No, y se verificó en el código**: ningún módulo lee `proveedores` desde fuera —solo el cableado de `lib/composition`—. Se dice explícitamente porque **QC-50 sí tenía uno** (pedido → receta, que QC-60 dejó abierto) y porque esta ficha **deja de tener** el que QC-49 declaró «hasta QC-50»: ese ya está cerrado |
| 2026-09-17 | ¿Identificadores, marcas de tiempo y borrado? | **Identificadores en inglés**, `created_at`/`updated_at`/`deleted_at` y **borrado lógico**, como todo el repo desde la 4. La migración lleva **`down.sql` que aborta** si encuentra datos que no podría revertir, heredado de **QC-50 D16** |
