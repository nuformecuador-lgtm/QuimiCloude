# QC-57 — orden-y-filtro-en-listados · requirements.md

> Zona: `backend` · Complejidad: `high` · `depends_on`: null · Rama: `feature/QC-57-orden-y-filtro-en-listados`
>
> **Alcance.** Un contrato **genérico y abierto** de consulta, el mismo para las **siete** listas
> del ERP: quien llama manda el nombre del campo de la base de datos, una búsqueda por `name`, un
> orden (`campo` + `asc`/`desc`) y un conjunto de filtros. Cada módulo declara qué campos suyos son
> consultables; lo que no esté declarado se omite sin romper la consulta. Todo se aplica sobre el
> **conjunto completo**, nunca sobre la página ya traída. Trae **migración**: los índices de los
> campos declarados y la columna normalizada de la búsqueda.
>
> **Lo que NO entra.** Las pantallas que consuman esto, cada una en su ficha: **QC-56** (productos
> y recetas), **QC-35** (pedidos), **QC-39** (unidades), **QC-45** (presentaciones). Unificar
> `pageQuerySchema` en `lib/shared/`: no se puede, el dominio no importa de ahí (QC-15).
>
> Sembrado por `/afinar-feature` el 2026-09-04. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`). Ninguna bloquea la feature.

1. **Cómo se normaliza la búsqueda en cada tabla no está decidido**: columna persistida como la que
   ya usan `recipes` y `units` para la unicidad, o función de base aplicada en la consulta. La
   primera cuesta migración y espacio pero indexa limpio; la segunda no duplica dato pero necesita
   índice funcional. Es decisión de `design.md` y afecta a cuántas tablas se tocan.
2. **Qué campos concretos declara consultables cada uno de los siete módulos** no está cerrado. Lo
   propone `spec_author` en F1.2 a partir de lo que cada pantalla ya muestra, y el humano lo revisa
   al aprobar el spec. Lo único fijado aquí es qué **no** puede estar (fila 8).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-04 | ¿Un parámetro por columna, o un contrato genérico? | **Genérico y abierto**: quien llama manda el **nombre del campo de la base de datos**. No hay un parámetro distinto por columna ni por listado, y añadir una columna consultable no cambia la forma del contrato |
| 2026-09-04 | ¿A qué listados se aplica? | **A las SIETE**: productos, presentaciones, recetas, proveedores, catálogo de proveedor, unidades y pedidos. No solo a los dos que QC-56 necesita |
| 2026-09-04 | ¿Cómo se busca? | **Una sola propiedad, que compara contra la columna `name`.** Donde esa columna no existe —**pedidos**— la búsqueda se omite |
| 2026-09-04 | ¿Se ordena por más de una columna? | **NO: por una sola**, `campo` más `asc` o `desc`. Es lo que QC-55 emite hoy (`sort` es un objeto o `null`, no una lista) y **cierra la pregunta abierta 5 de QC-55**. Si algún día son varias, QC-55 ya dejó el cambio acotado a un archivo |
| 2026-09-04 | ¿Qué formas de filtro entiende? | **Las cuatro que QC-55 emite**: texto, rango numérico, selección de un conjunto de valores y rango de fechas. Todo se aplica **sobre el conjunto completo** y nunca sobre la página ya traída — filtrar lo ya descargado es lo que QC-22 y QC-26 rechazaron por engañoso |
| 2026-09-04 | ¿Se puede ordenar y filtrar por cualquier columna que exista? | **NO. Lista blanca por módulo**: cada uno declara cuáles de sus campos son consultables. El contrato sigue siendo abierto —se manda el nombre del campo—, pero lo que no esté declarado se trata como si no existiera. Evita que la UI acabe conociendo el esquema y que se ordene por una columna sin índice, anti-patrón que el reviewer rechaza |
| 2026-09-04 | ¿Qué pasa si el campo pedido no vale? | **Se omite y la consulta NO falla**: la lista vuelve igual. **Pero el servidor lo anota en el log.** Una pantalla que pida `nombre` en vez de `name` mostraría datos sin filtrar, y sin rastro ese error no se descubre nunca. El humano descartó explícitamente omitir en silencio |
| 2026-09-04 | ¿`deleted_at` es consultable? | **NUNCA**, en ninguna tabla. Los borrados lógicos no salen del listado: regla cerrada desde QC-4 y QC-20, y un filtro abierto la dejaría sin efecto |
| 2026-09-04 | ¿La búsqueda distingue acentos? | **NO: ignora acentos y mayúsculas.** Escribir «solucion» encuentra «Solución Buffer pH 7». Hoy productos usa `contains` con `mode: 'insensitive'`, que ignora mayúsculas **pero no acentos**, así que quien busca sin tildes no encuentra lo que existe. Se alinea con cómo el repo **ya** compara nombres para la unicidad —normalizado sin acentos ni mayúsculas, QC-24 y QC-32—: buscar y comparar dejan de discrepar |
| 2026-09-04 | ¿Los índices entran aquí o después? | **AQUÍ, y esta ficha trae migración.** Decisión del humano el 2026-09-04. Entran los índices de todo campo que un módulo declare ordenable o buscable, más el de la columna normalizada de la búsqueda. Dejarlos para después es plantar el anti-patrón «queries sin índice en rutas calientes» y descubrirlo con datos ya cargados. **Toda migración lleva su `down.sql`** |
| 2026-09-04 | Productos ya busca y pedidos ya filtra, con forma propia | **Se MIGRAN al contrato nuevo**, para que haya una sola manera de pedir una lista en todo el ERP. Se adaptan sus llamantes —el **selector de ingredientes** del formulario de recetas, que hoy busca productos por nombre, y lo que consuma el listado de pedidos— y **los tests que hoy pasan tienen que seguir pasando** |
| 2026-09-04 | Unidades no pagina hoy: ¿entra? | **Entra, con la página OPCIONAL.** Acepta orden, filtro y búsqueda como las demás, pero **sin parámetros sigue devolviendo el catálogo entero**, para no romper el selector de unidad del formulario de recetas. Son cinco unidades sembradas: paginar por defecto sería ceremonia |
| 2026-09-04 | ¿Se unifica `pageQuerySchema`, hoy copiado en cuatro módulos? | **NO.** Sigue declarado por módulo. La duplicación es deliberada: **el dominio no puede importar `lib/shared/`** (`docs/architecture.md > La regla de dependencias`, QC-15), y el propio `page.ts` lo deja escrito. Lo que se comparte es la **forma** del contrato, no el archivo |
| 2026-09-04 | ¿Choca con QC-44, que estaba en curso sobre proveedores? | **Ya no.** QC-44 se cerró el 2026-09-04 (PR #35, *Finalizado*). Verificado al sembrar, no supuesto |
| 2026-09-04 | Permiso y rol | **La autorización se valida en el service, con su test.** Heredado de QC-20, QC-25, QC-43 y QC-34, y exigido por `CHECKPOINTS.md > Permisos`. Esta ficha **no cambia quién puede ver qué**: solo cómo se pide la lista |
| 2026-09-04 | Paginación | **10 por defecto y 25 de tope**, de `lib/shared/pagination`, **acotando** en vez de rechazar. Heredado de QC-20 |
| 2026-09-04 | Identificadores de la base | **En inglés**, heredado de QC-4 |
| 2026-09-04 | Dónde se valida la entrada | **Con zod, DENTRO del caso de uso**, como ya hacen `pageQuerySchema` y `listOrdersSchema`. Acotar es de la capa de presentación; validar es del dominio |
| 2026-09-04 | ¿E2E? | **NO, y se difiere con motivo.** Es backend sin pantalla: no hay camino de usuario que recorrer. Mismo criterio y mismo precedente que QC-20, QC-25 y QC-34. Lo cubrirán los E2E de las pantallas que lo consuman |
