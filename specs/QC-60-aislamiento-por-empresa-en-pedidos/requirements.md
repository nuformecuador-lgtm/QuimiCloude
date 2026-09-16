# QC-60 — aislamiento-por-empresa-en-pedidos · requirements.md

> **Zona** `backend` · **Complejidad** `medium` · **depends_on** `QC-48` (`done`) ·
> **Rama** `feature/QC-60-aislamiento-por-empresa-en-pedidos`
>
> ## Alcance
>
> La tabla `orders` gana `company_id` **NOT NULL** con clave foránea a `companies`. Toda consulta
> y toda escritura del módulo `pedidos` se limitan a la empresa de la sesión, y leer o modificar un
> pedido de otra empresa **se rechaza aunque se conozca el identificador**.
>
> El **correlativo pasa a medirse dentro de la empresa**: la unicidad va de `(año, secuencia)` a
> `(empresa, año, secuencia)`. El enlace de `order_assignments` hacia el pedido pasa a ser
> **compuesto** `(pedido, empresa)`. Migración con su `down.sql` y backfill de las filas vivas a
> «QuimiCloud». Lleva **E2E**.
>
> ## Lo que NO entra
>
> - **Las recetas** → **QC-50**, y con ellas la coherencia pedido→receta (ver *Preguntas
>   abiertas* 1). Esta ficha **declara el hueco, no lo cierra**.
> - **La guardia de esquema** que exige empresa en toda tabla de negocio → **QC-61**.
> - **La limpieza de las 47 empresas residuo de tests** → **QC-77**; aquí se asignan, no se borran.
> - **Inventario** ya lo aisló **QC-49**, **unidades** **QC-76**, y **proveedores** es **QC-59**.
>
> _Sembrado por `/afinar-feature` el 2026-09-15. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`._

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Las tres que pedían decisión humana **se cerraron el 2026-09-15 al acotar** y están abajo, en la
tabla de decisiones. Quedan dos, y las dos son **informativas**: no piden decisión, avisan.

**1. La ventana pedido → receta queda abierta hasta QC-50.** `orders.recipe_id` apunta a `recipes`,
que **no tienen empresa** (`db/schema.prisma:743`). A partir de esta ficha, un pedido de la empresa
A puede seguir apuntando a una receta de la B si alguien teclea el identificador. Es exactamente el
mismo patrón que QC-49 dejó escrito para `ProductCatalog.findRefs` y para
`supplier_catalog_lines.presentation_id`: consecuencia declarada, con ficha destinataria. **QC-50
no está acotada ni tiene fecha**, así que la ventana no tiene cierre previsto.

**2. El residuo de tests está creciendo, con QC-77 ya `done`.** QC-49 contó **37 empresas** el
2026-09-11; el 2026-09-15 hay **48**. El backfill de esta ficha no se ve afectado —solo QuimiCloud
tiene pedidos— pero la limpieza que QC-77 prometió no está ocurriendo, y quien mida «una sola
empresa real» en una ficha futura se va a encontrar el mismo ruido.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-15 | ¿Qué tablas entran? | **Solo `orders`.** La ficha decía «y sus lineas» y **eso es falso**: no existe ninguna tabla de líneas de pedido. Un pedido es una receta más una cantidad (`db/schema.prisma:1080`). La `description` del board se corrigió antes de sembrar |
| 2026-09-15 | ¿El número de pedido es por empresa? | **Sí, cada empresa lleva el suyo.** La unicidad pasa de `(año, secuencia)` a `(empresa, año, secuencia)`. Hoy el contador es **uno solo** y los huecos de la numeración delatan cuántos pedidos hace el vecino |
| 2026-09-15 | ¿Se renumeran los pedidos que ya existen? | **No.** Medido en la base el 2026-09-15: 3 pedidos vivos, los tres de QuimiCloud, con los correlativos **37, 44 y 77** de 2026 —los huecos los gastaron las corridas de test—. QuimiCloud continúa desde donde va; «empieza en 1» es para la empresa que todavía no tiene ninguno |
| 2026-09-15 | ¿Y la coherencia pedido → receta? | **Se declara el hueco, no se cierra aquí.** Hasta **QC-50** un pedido de A puede apuntar a una receta de B. **No se añade `depends_on: QC-50`**: la alternativa era aplazar esta ficha dos fichas más. Mismo patrón que **QC-49** con `findRefs` |
| 2026-09-15 | ¿Entra el enlace de `order_assignments`? | **Sí, compuesto `(pedido, empresa)`,** como ya son los de persona y grupo en esa misma tabla. Lo dejó apuntado el propio esquema (`OJO 2` de `OrderAssignment`), que dice que la FK es simple **solo** porque `orders` no tenía empresa y que eso «es la épica QC-46», o sea ésta. Hoy cuesta cero: **0 asignaciones guardadas**. Toca una tabla del módulo `asignaciones`, y es deliberado |
| 2026-09-15 | ¿Qué pasa con las filas que ya existen? | **Se asignan a «QuimiCloud»**, la única empresa real de las 48. Heredado de **QC-49 D4** |
| 2026-09-15 | ¿«La base se siembra limpia» significa vaciar pedidos? | **No.** No se borra ninguna fila. Heredado de **QC-49 D5**; la limpieza del residuo es **QC-77** |
| 2026-09-15 | ¿Dónde se valida la frontera? | **En el service**, antes de tocar el repositorio. Heredado de **QC-49 D6** y de `docs/architecture.md > Acceso a datos y autorizacion`: un aislamiento implementado **solo** como policy de RLS no cuenta como implementado, y la empresa que viaja firmada en la sesión (QC-48) tampoco autoriza por sí sola |
| 2026-09-15 | ¿Dónde vive el filtro por empresa? | **En un único punto de consulta del módulo**, no repetido en cada caso de uso. Heredado de **QC-49 D7** y **QC-76 D15/D16** |
| 2026-09-15 | ¿Y la RLS? | `orders` conserva `ENABLE` + **`FORCE ROW LEVEL SECURITY`**, que la guardia `guard-rls-force` ya exige. Es defensa en profundidad, **no** la frontera. Heredado de **QC-49 D8** |
| 2026-09-15 | ¿Qué pasa con los pedidos de una empresa dada de baja? | **No se tocan.** Heredado de **QC-49 D9** / **QC-76 D29** |
| 2026-09-15 | ¿Nacen permisos nuevos? | **No.** Siguen siendo `pedidos.consultar` y `pedidos.modificar`, que ya existen (`identity/domain/permissions.ts:94`). Heredado de **QC-49 D10** |
| 2026-09-15 | ¿Hace falta E2E? | **Sí.** `CHECKPOINTS.md` lo pide para permisos y esto es la misma familia: un fallo aquí es una **fuga de datos entre clientes**. Cubre que alguien de la empresa A no ve ni toca los pedidos de la B ni conociendo el identificador. Heredado de **QC-49 D11** |
| 2026-09-15 | Identificadores, marcas de tiempo y borrado | **Heredado, no se reabre.** Identificadores de base en inglés y `created_at`/`updated_at` (QC-4). `orders` conserva su borrado lógico; esta ficha no cambia el de nadie. Heredado de **QC-49 D12** |
