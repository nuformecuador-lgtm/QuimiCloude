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

> «Listado» significa cualquiera de los **siete** de R2. «Campo consultable» significa un campo
> presente en la lista blanca que ese listado declara (R4). Los requisitos hablan del QUÉ: dónde
> vive cada pieza y con qué forma se escribe es `design.md`.

### El contrato

**R1.** El sistema DEBE ofrecer **un solo** contrato de consulta de lista, con la **misma forma**
para los siete listados, compuesto por: página, tamaño de página, un **orden** que es un objeto
`{campo, dirección}` **o nulo**, un conjunto de **filtros** indexado por nombre de campo, y una
**búsqueda**.

**R2.** El sistema DEBE aceptar ese contrato en los **SIETE** listados: productos,
presentaciones, recetas, proveedores, catálogo de proveedor, unidades y pedidos.

**R3.** El sistema DEBE identificar cada campo consultable por el **nombre del campo de la base**,
en inglés, y CUANDO un listado añada un campo consultable nuevo, la **forma** del contrato NO DEBE
cambiar: no aparece ningún parámetro nuevo ni ninguna propiedad nueva.

**R4.** Cada uno de los siete listados DEBE declarar explícitamente su **lista blanca**: qué campos
suyos son ordenables, qué campos son filtrables y con qué forma de filtro cada uno.

**R5.** SI la consulta pide ordenar o filtrar por un campo que **no** está en la lista blanca de
ese listado, ENTONCES el sistema DEBE **omitir esa parte** y devolver la lista como si no se
hubiera pedido, y la consulta **NO DEBE** fallar.

**R6.** CUANDO el sistema omite una parte de la consulta por no estar declarada, DEBE registrar en
el **log del servidor** una advertencia que nombre el listado y el campo omitido.

**R7.** `deletedAt` (`deleted_at`) NO DEBE aparecer en la lista blanca de **ningún** listado; SI la
consulta lo pide como orden o como filtro, ENTONCES se omite y se registra como cualquier otro
campo no declarado (R5, R6), y ninguna fila con borrado lógico DEBE salir del listado en ningún
caso.

**R8.** SI la consulta trae para un campo declarado una **forma de filtro distinta** de la que ese
campo declara (por ejemplo un rango numérico sobre un campo de texto), ENTONCES el sistema DEBE
omitir ese filtro y registrarlo (R6), sin fallar.

### Orden

**R9.** El sistema DEBE ordenar por **como mucho un** campo. El contrato NO DEBE admitir una lista
de órdenes.

**R10.** CUANDO la consulta trae un orden por un campo ordenable declarado, el sistema DEBE
aplicarlo en la **dirección** pedida (`asc` o `desc`) sobre el conjunto completo, con un desempate
estable por identificador para que ninguna fila se repita ni se pierda entre páginas.

**R11.** SI la consulta no trae orden (nulo), ENTONCES el listado DEBE devolver el **mismo orden
por defecto que tiene hoy**.

### Filtros

**R12.** El sistema DEBE entender exactamente **cuatro** formas de filtro —texto, rango numérico,
selección de un conjunto de valores y rango de fechas— y **ninguna más**.

**R13.** El sistema DEBE aplicar orden, filtros y búsqueda sobre el **conjunto completo** de filas
del listado y **antes** de paginar; NUNCA sobre la página ya obtenida.

**R14.** CUANDO se aplican filtros o búsqueda, el **total** y el **número de páginas** devueltos
DEBEN describir el conjunto **ya filtrado**, no el catálogo entero.

**R15.** CUANDO la consulta trae más de un filtro, el sistema DEBE aplicarlos **todos a la vez**:
una fila sale solo si los cumple todos.

### Búsqueda

**R16.** La búsqueda DEBE ser **una sola propiedad** del contrato y DEBE compararse contra el campo
`name` del listado.

**R17.** DONDE el listado **no tiene** campo `name` —pedidos—, la búsqueda DEBE **omitirse** y
registrarse (R6), y la consulta DEBE devolver la lista como si no se hubiera buscado.

**R18.** La búsqueda DEBE ignorar **acentos y mayúsculas**: buscar `solucion` DEBE encontrar
`Solución Buffer pH 7`.

**R19.** La búsqueda DEBE usar la **misma forma normalizada** con la que ese módulo ya compara
nombres para la unicidad; NO DEBE existir una segunda definición de «mismo nombre» dentro de un
módulo.

**R20.** SI la búsqueda llega vacía o compuesta solo de espacios, ENTONCES el sistema DEBE tratarla
como ausencia de búsqueda y devolver la lista sin filtrar por texto.

### Base de datos

**R21.** Al terminar esta feature, **todo** campo que algún listado declare ordenable o buscable
DEBE tener **índice** en la base.

**R22.** La feature DEBE traer una migración versionada con su **`down.sql`**, que revierte
exactamente lo que hace su `migration.sql`.

**R23.** La columna normalizada de la búsqueda DEBE existir en toda tabla buscable y DEBE quedar
**poblada para las filas que ya existen**, no solo para las que se escriban después.

### Lo que ya tenía forma propia

**R24.** El listado de **productos** DEBE dejar de exponer su parámetro de búsqueda propio y
aceptar la búsqueda del contrato; el **selector de ingredientes** del formulario de recetas DEBE
seguir encontrando productos por nombre, ahora a través del contrato.

**R25.** El listado de **pedidos** DEBE dejar de exponer sus parámetros propios de estado y
prioridad y aceptarlos como **filtros de selección** del contrato, conservando que un pedido
`CANCELADO` sí se consulta.

**R26.** Los comportamientos que hoy verifican los tests de productos y de pedidos DEBEN seguir
verificándose después de la migración.

### Unidades

**R27.** El listado de **unidades** DEBE aceptar orden, filtro y búsqueda como los demás.

**R28.** SI la consulta de unidades llega **sin parámetros**, ENTONCES el sistema DEBE devolver el
**catálogo entero**, sin paginar.

### Paginación, validación y permisos

**R29.** DONDE la consulta pide paginación, el sistema DEBE aplicar **10** por defecto y **acotar**
a **25** como máximo, sin rechazar la consulta por pedir más.

**R30.** El sistema DEBE validar la entrada del contrato **con zod y dentro del caso de uso**,
antes de tocar el repositorio.

**R31.** Cada listado DEBE declarar su esquema de consulta **dentro de su propio módulo**; el
dominio NO DEBE depender de ningún archivo compartido fuera de su módulo para hacerlo.

**R32.** Ante la **misma** entrada canónica, los esquemas de consulta de todos los módulos DEBEN
aceptar y rechazar **lo mismo**: la forma del contrato es una sola aunque el archivo sea seis.

**R33.** Cada uno de los siete listados DEBE seguir validando la **autorización en su caso de uso**
antes de consultar el repositorio, y esta feature NO DEBE cambiar quién puede ver qué.

**R34.** SI el actor no está autorizado, ENTONCES el listado DEBE fallar **sin tocar el
repositorio**, tanto con una consulta válida como con una que traiga campos no declarados.

### Verificación

**R35.** La feature DEBE quedar cubierta por tests unitarios y de integración, y **NO DEBE** añadir
pruebas E2E: no hay camino de usuario que recorrer, y la cobertura E2E se difiere a las fichas de
pantalla que consuman el contrato, con el motivo escrito en `design.md`.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con los
requisitos que la hacen testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | Contrato **genérico y abierto**: se manda el nombre del campo de la base | R1, R3 |
| 2 | Se aplica a las **SIETE** listas | R2 |
| 3 | Una sola propiedad de búsqueda, contra `name`; en pedidos se omite | R16, R17 |
| 4 | Orden por **una sola** columna, `campo` + `asc`/`desc` | R1, R9, R10, R11 |
| 5 | **Cuatro** formas de filtro, sobre el conjunto completo | R12, R13, R14, R15 |
| 6 | **Lista blanca por módulo**; lo no declarado no existe | R4, R5, R8 |
| 7 | Campo inválido: se omite, no falla, **y se anota en el log** | R5, R6, R8, R17 |
| 8 | `deleted_at` **nunca** consultable | R7 |
| 9 | La búsqueda ignora **acentos y mayúsculas**, alineada con la unicidad | R18, R19, R23 |
| 10 | Los índices entran **aquí**, con migración y su `down.sql` | R21, R22, R23 |
| 11 | Productos y pedidos **se migran**; sus tests siguen pasando | R11, R20, R24, R25, R26 |
| 12 | Unidades entra, con la **página opcional** | R27, R28 |
| 13 | `pageQuerySchema` **no** se unifica: se comparte la forma, no el archivo | R1, R31, R32 |
| 14 | QC-44 ya no choca (cerrada el 2026-09-04) | R2 (proveedores y su catálogo entran como los demás; la precondición se verifica en `tasks.md > T0`) |
| 15 | Autorización **en el service**, con su test; no cambia quién ve qué | R33, R34 |
| 16 | Paginación **10 / 25**, acotando en vez de rechazar | R29 |
| 17 | Identificadores de la base **en inglés** | R3 |
| 18 | Validación con **zod, dentro del caso de uso** | R30 |
| 19 | **Sin E2E**, diferido con motivo | R35 |

Requisitos que no salen de una fila de la tabla y de dónde salen: **R10** (el desempate estable) y
**R11** (el orden por defecto de hoy) del comportamiento ya escrito en los ocho adaptadores —
`orderBy: [{ name: 'asc' }, { id: 'asc' }]` y su comentario en `product-prisma.ts`, que explica que
el desempate evita que dos homónimos se intercambien entre páginas—; **R14** y **R15** del bloque
de Alcance («todo se aplica sobre el conjunto completo») más el precedente literal de
`listOrdersSchema`, cuyos dos filtros ya son «opcionales y combinables»; **R20** del
`productQuerySchema` de hoy, que ya trata una búsqueda de solo espacios como la lista completa;
**R32** del coste que la fila 13 acepta —seis copias solo son un contrato si algo comprueba que
siguen diciendo lo mismo—.

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`). Ninguna bloquea la feature.

1. **Cómo se normaliza la búsqueda en cada tabla no está decidido**: columna persistida como la que
   ya usan `recipes` y `units` para la unicidad, o función de base aplicada en la consulta. La
   primera cuesta migración y espacio pero indexa limpio; la segunda no duplica dato pero necesita
   índice funcional. Es decisión de `design.md` y afecta a cuántas tablas se tocan.
2. **Qué campos concretos declara consultables cada uno de los siete módulos** no está cerrado. Lo
   propone `spec_author` en F1.2 a partir de lo que cada pantalla ya muestra, y el humano lo revisa
   al aprobar el spec. Lo único fijado aquí es qué **no** puede estar (fila 8).

### Estado de las dos anteriores tras F1.2

- **1 — CERRADA en `design.md > 4`**: **columna persistida**. Cinco de las seis tablas buscables ya
  la tienen (`name_normalized` en `presentations`, `recipes`, `suppliers`,
  `supplier_catalog_lines`, `units`) y ya la escriben con una función pura del dominio; la que
  falta es `products`. El índice funcional se descarta con su porqué en `design.md > 4.2`.
- **2 — PROPUESTA en `design.md > 5`**, tabla por tabla. Sigue siendo del humano al aprobar: lo que
  `design.md` aporta es una propuesta razonada, no un cierre.

### Añadidas por spec_author en F1.2

> **Las tres CERRADAS por el humano el 2026-09-04**, antes de aprobar el spec. Sus decisiones
> son las **tres últimas filas** de `## Decisiones cerradas (no reabrir)`; ahí está lo que vale.
> Se conservan aquí con su enunciado porque explican por qué había que preguntarlas — y la 1
> documenta que la extensión ya estaba disponible en el servidor, que es lo que abarató la vía A.

3. **La búsqueda por SUBCADENA no tiene índice que la sirva.** Se conserva la semántica de hoy
   —productos busca con `contains`—, pero un índice btree no acelera `%texto%`: eso lo sirve un
   índice **GIN de trigramas**, que necesita la extensión de Postgres `pg_trgm`. No es una
   dependencia de npm y la guardia de `docs/dependencias.md` no la ve, así que **no se da por
   buena** (regla 7 de `CLAUDE.md`): la decide el humano al aprobar el spec, con las dos salidas
   escritas en `design.md > 4.3`. Afecta a la migración y, si se rechaza, a la semántica de la
   búsqueda (pasa a **prefijo**).
4. **Huso horario del filtro de rango de fechas.** QC-55 emite `YYYY-MM-DD` sin huso y las columnas
   son `timestamptz`. Interpretar «del 1 al 3» en UTC o en la zona de quien mira cambia qué filas
   salen en los bordes del día. Posición por defecto escrita en `design.md > 3.3` (UTC, extremos
   inclusivos), sin decidir por el humano.
5. **Orden de los nulos.** Varios campos ordenables son anulables (`stock`, `qtyAlert`,
   `minPurchase`, `deliveryTime`). Postgres pone los `NULL` al final en `ASC` y al principio en
   `DESC`; nadie ha decidido si esa es la lectura que se quiere. Posición por defecto: el
   comportamiento por defecto de Postgres, sin `NULLS FIRST/LAST` explícito (`design.md > 3.3`).

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
| 2026-09-04 | Permiso y rol | **La autorización se valida en el service, con su test.** Heredado de QC-20, QC-25, QC-43 y QC-34, y exigido por `docs/checkpoints-proyecto.md > Permisos`. Esta ficha **no cambia quién puede ver qué**: solo cómo se pide la lista |
| 2026-09-04 | Paginación | **10 por defecto y 25 de tope**, de `lib/shared/pagination`, **acotando** en vez de rechazar. Heredado de QC-20 |
| 2026-09-04 | Identificadores de la base | **En inglés**, heredado de QC-4 |
| 2026-09-04 | Dónde se valida la entrada | **Con zod, DENTRO del caso de uso**, como ya hacen `pageQuerySchema` y `listOrdersSchema`. Acotar es de la capa de presentación; validar es del dominio |
| 2026-09-04 | ¿E2E? | **NO, y se difiere con motivo.** Es backend sin pantalla: no hay camino de usuario que recorrer. Mismo criterio y mismo precedente que QC-20, QC-25 y QC-34. Lo cubrirán los E2E de las pantallas que lo consuman |
| 2026-09-04 | `pg_trgm`: ¿se habilita la extensión, o se baja a búsqueda por prefijo? | **SE HABILITA (vía A). La búsqueda sigue siendo por SUBCADENA.** Decidido por el humano el 2026-09-04 sobre dos datos medidos contra el servidor real, no supuestos: **`pg_trgm` ya está DISPONIBLE ahí** (`pg_available_extensions` la da en `1.6`, sin instalar), así que cuesta una línea en la migración y otra en el `down`; y **hay 6 productos vivos**, así que el escaneo secuencial que motivó la pregunta hoy no duele — la vía B no ahorraba nada real y solo costaba comportamiento. **El motivo es de producto, no de rendimiento**: bajar a prefijo degradaría en silencio algo que YA funciona —el selector de ingredientes busca por subcadena— y en un catálogo químico los nombres son compuestos («Hipoclorito de sodio 5%», «Solución Buffer pH 7»), donde buscar por una palabra del medio es el caso normal. **El riesgo queda anotado y aceptado**: es una dependencia de INFRAESTRUCTURA que **ninguna guardia vigila** —no es un paquete de npm—, y si la base se mudara a un Postgres sin `pg_trgm` la migración fallaría. Mismo criterio con el que se aceptó a conciencia el riesgo de `dnd-kit` en QC-26 |
| 2026-09-04 | ¿Contra qué reloj se compara el filtro de rango de fechas? | **UTC**, que es como Postgres guarda los `timestamptz` y lo que `spec_author` había puesto como posición por defecto. Extremos inclusivos. **La consecuencia se acepta a conciencia**: un pedido creado el día 4 después de las 19:00 hora de Bogotá cae en el día 5 en UTC, así que quien filtre por el 4 no lo verá. Se descartó convertir con el huso de Colombia y se descartó que la pantalla mandara el huso —eso habría obligado a tocar el contrato de QC-55, que hoy no lo emite— |
| 2026-09-04 | Al ordenar por un campo anulable, ¿dónde van los vacíos? | **SIEMPRE AL FINAL**, en ascendente y en descendente, declarado explícito en la consulta y no heredado del comportamiento por defecto de Postgres. Afecta a `stock`, `qty_alert`, `min_purchase` y `delivery_time`. El motivo: quien ordena por existencia quiere ver los extremos reales, y por defecto ordenar de mayor a menor arrancaría con todos los productos que no tienen existencia registrada |
