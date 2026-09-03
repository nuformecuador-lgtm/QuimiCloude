# QC-32 — modelo-unidades · requirements.md

> **Zona:** `backend` · **Complejidad:** `high` · **depends_on:** `QC-24` ·
> **Rama:** `feature/QC-32-modelo-unidades`
>
> **Alcance.** Crear el catálogo de unidades de medida como **módulo hexagonal propio
> `unidades`**: la tabla `Unit` con su nombre único normalizado y su símbolo opcional, su
> contrato público, su conjunto arrancador, y reapuntar a él la unidad del producto y la de la
> línea de receta, que hoy son texto libre. Migración con su `down.sql` y los tests. Es la
> primera feature de la épica **QC-37 — Catálogos**.
>
> **Corrección de alcance del humano, 2026-09-03 (ronda 3).** El conjunto arrancador ya **no**
> se siembra con un seed de aplicación: lo insertan **cuatro filas de la propia migración**
> (`mililitro/ml`, `litro/l`, `gramo/gr`, `kilogramo/kg`). El aparato del seed —caso de uso,
> puerto, adaptador driven, cableado en la composición y llamada en `scripts/seed.ts`— **se
> retira entero**: «no existe nada relacionado con unidades de medida así que ese seeder y
> mapeo está de sobra». El reapuntado de `products.unit` y de la unidad de la línea de receta a
> `unit_id`, y las dos guardias de datos del UP y del DOWN, **siguen siendo el núcleo de la
> ficha y no cambian**. Ver decisión cerrada 9 y pregunta abierta 4.
>
> **Lo que NO entra.** El alta, la edición y el borrado de unidades: van a **QC-38 — CRUD de
> unidades**. Su pantalla: **QC-39 — Pantalla de unidades**. El uso de la unidad desde
> pedidos: **QC-33**. La conversión entre unidades no entra aquí ni en ninguna ficha: no
> existe en este ERP y la unidad sigue siendo anotativa.
>
> Sembrado por `/afinar-feature` el 2026-09-02. El bloque de Alcance y la tabla de
> «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los
> reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Notación EARS (`docs/specs.md`). **«El sistema»** aquí es la **capa de persistencia** de
QuimiCloude —el esquema Prisma (`db/schema.prisma`) más la base Postgres con la migración de
esta feature aplicada—, **más el armazón del módulo `unidades`** y las **fronteras** que
`inventario` y `recetas` tienen con el catálogo nuevo. No hay caso de uso de alta/edición/borrado,
ni service, ni pantalla (decisiones cerradas de permisos y de E2E), así que ningún requisito habla
de quién llama ni desde dónde. **Desde la ronda 3 tampoco hay seed de aplicación**: el conjunto
arrancador lo insertan cuatro filas de la migración, así que en R25 y R26 «el sistema» es la
migración, no `scripts/seed.ts`.

### El catálogo de unidades

**R1.** El sistema DEBE persistir, para cada unidad de medida, un identificador propio, estable y
no derivado de sus datos de negocio, más su **nombre** y su **símbolo**.

**R2.** SI se intenta persistir una unidad sin nombre, ENTONCES el sistema DEBE rechazar la
operación **en la propia base de datos** y no crear ninguna fila.

**R3.** El sistema DEBE aceptar una unidad **sin símbolo**, DEBE conservar esa ausencia como
ausencia de valor —no como cadena vacía ni como copia del nombre— y NO DEBE rechazar la
operación por ello.

**R4.** El sistema DEBE persistir el nombre normalizado de cada unidad —sin acentos, sin
caracteres especiales y sin distinguir mayúsculas de minúsculas— en una **columna propia** junto
al nombre original, y DEBE exponer **una única definición** de esa normalización, publicada por
el contrato público del módulo `unidades`, de modo que la columna y cualquier consumidor futuro
normalicen igual.

**R5.** SI se intenta persistir una unidad cuyo nombre coincida con el de otra unidad ya existente
**una vez normalizado**, ENTONCES el sistema DEBE rechazar la operación **en la propia base de
datos** —contra un índice único, no contra una comprobación previa al vuelo— y no crear ni
modificar ninguna fila.

**R6.** El sistema NO DEBE limitar en la columna la longitud del nombre ni la del símbolo, y NO
DEBE rechazar una unidad por la longitud de ninguno de los dos: los límites de aplicación, si los
hay, pertenecen a **QC-38**.

**R7.** El sistema NO DEBE crear ningún índice único ni ninguna restricción sobre el símbolo, y
DEBE aceptar dos unidades distintas con el mismo símbolo (ver pregunta abierta 1).

**R8.** El sistema NO DEBE declarar ninguna marca de borrado lógico en el catálogo de unidades: la
tabla de unidades NO DEBE tener columna `deleted_at` ni equivalente.

**R9.** El sistema DEBE registrar, para cada unidad, el instante de creación y el instante de la
última modificación, y DEBE actualizar el segundo cada vez que la fila cambia.

### La unidad del producto y la de la línea de receta

**R10.** El sistema DEBE expresar la unidad de un producto como **referencia al catálogo de
unidades**, DEBE permitir que un producto **no** declare unidad, y NO DEBE conservar en el
producto ninguna columna de unidad de texto libre.

**R11.** El sistema DEBE expresar la unidad de una línea de receta como **referencia al catálogo
de unidades**, DEBE **exigirla** en toda línea, y NO DEBE conservar en la línea ninguna columna de
unidad de texto libre.

**R12.** SI se intenta persistir un producto o una línea de receta cuya referencia de unidad no
corresponda a ninguna unidad existente, ENTONCES el sistema DEBE rechazar la operación **en la
propia base de datos** y no crear ni modificar ninguna fila.

**R13.** SI se intenta eliminar una unidad referenciada por al menos un producto o por al menos
una línea de receta, ENTONCES el sistema DEBE rechazar el borrado y conservar la unidad y sus
referencias intactas.

**R14.** El sistema NO DEBE derivar, convertir ni comparar cantidades entre unidades distintas, NO
DEBE tomar la unidad de una línea de receta de la unidad de su producto, y NO DEBE restringir qué
unidad puede usar un producto o una línea: la unidad es puramente anotativa.

### Frontera de módulo

**R15.** El sistema DEBE declarar `unidades` como módulo propietario del modelo de esta feature, y
ningún módulo distinto de `unidades` DEBE consultarlo con el cliente Prisma.

**R16.** Los módulos `inventario` y `recetas` NO DEBEN importar el dominio, los puertos ni los
adaptadores de `unidades` por ruta profunda: todo lo que sepan de una unidad DEBE llegarles por el
contrato público `@/lib/modules/unidades`, que DEBE publicarlo.

**R17.** El módulo `unidades` DEBE nacer con la forma hexagonal del repositorio: un contrato
público (`index.ts`) que solo reexporta símbolos de su propio `domain/`, las carpetas `domain/`,
`ports/` y `adapters/` como únicas carpetas del módulo, y ningún `'use server'` alcanzable desde
ese contrato.

**R18.** El sistema DEBE declarar las dos referencias de unidad —la del producto y la de la línea
de receta— como **campos escalares sin relación de Prisma**, de modo que ninguna consulta del
cliente Prisma pueda atravesar desde un producto o una línea hasta una unidad; y DEBE mantener aun
así la restricción de clave foránea **real en la base de datos**.

**R19.** El sistema NO DEBE exponer la unidad de un producto como texto en ninguna superficie
pública de `inventario`: donde hoy `inventario` publica la unidad hacia fuera o la recibe del
borde, DEBE hacerlo con la referencia al catálogo, usando los tipos que publica
`@/lib/modules/unidades`.

### Esquema, seguridad y migración

**R20.** El sistema DEBE nombrar en **inglés** la tabla, las columnas, los índices y las
restricciones que cree o renombre esta feature.

**R21.** El sistema DEBE tener `ROW LEVEL SECURITY` activado **y forzado**
(`FORCE ROW LEVEL SECURITY`) en la tabla que crea esta feature.

**R22.** SI al aplicar la migración existe alguna fila de producto con unidad escrita o alguna
línea de receta con unidad escrita, ENTONCES el sistema DEBE **abortar la migración completa**, no
DEBE aplicar ninguno de sus cambios y NO DEBE descartar ni sobrescribir ese dato.

**R23.** CUANDO se revierte la migración de esta feature, el sistema DEBE quedar exactamente en el
estado de esquema previo a aplicarla —la unidad del producto vuelve a ser texto opcional, la de la
línea de receta texto obligatorio, y no queda tabla, columna, índice ni restricción residual del
catálogo—.

**R24.** SI al revertir la migración existe alguna fila que apunte a una unidad del catálogo,
ENTONCES el sistema DEBE **abortar la reversión completa** y NO DEBE inventar ni vaciar en
silencio el texto de unidad de esas filas (es R22 leído al revés: fallar antes que perder el
dato).

### El conjunto arrancador

> **Reescritos el 2026-09-03 (ronda 3)** por la corrección de alcance del humano. Antes decían:
> R25, «CUANDO se ejecuta el seed, el sistema DEBE dejar creadas las **cinco** unidades del
> conjunto arrancador —kilogramo, gramo, litro, mililitro y unidad— y NO DEBE crear ninguna
> otra»; R26, «CUANDO se ejecuta el seed sobre una base que ya tiene alguna de esas unidades, el
> sistema DEBE crear **solo las que falten** […]; ejecutarlo dos veces seguidas DEBE dejar
> exactamente el mismo estado que ejecutarlo una». Ese enunciado suponía un seed de aplicación
> idempotente sobre el de QC-6, que ya no existe. Se conserva aquí para que se lea qué cambió.

**R25.** CUANDO se aplica la migración de esta feature, el sistema DEBE dejar creadas en el
catálogo exactamente las **cuatro** unidades arrancadoras —`mililitro`/`ml`, `litro`/`l`,
`gramo`/`gr` y `kilogramo`/`kg`, con el nombre en minúscula y las cuatro con símbolo— y NO DEBE
crear ninguna otra.

**R26.** El nombre normalizado persistido de cada unidad arrancadora DEBE coincidir con el que
produce sobre su nombre la **única definición** de la normalización (R4); y el sistema NO DEBE
incluir ningún seed de aplicación —ni caso de uso, ni puerto, ni adaptador, ni cableado en la
composición, ni llamada en `scripts/seed.ts`— que cree, actualice o pise unidades del catálogo.

> Por qué R26 dice eso y no «idempotencia». El arrancador vive ahora en SQL, y `name_normalized`
> se escribe **literal** ahí porque no hay forma de llamar a `normalizeUnitName` (TypeScript)
> desde una migración: es un duplicado que se desincroniza en silencio, y R26 es lo que lo
> vigila. La repetición ya no es un riesgo del seed —una migración se aplica una vez y
> `_prisma_migrations` lo garantiza—, sino la reintroducción de un seed por la puerta de atrás:
> de ahí la segunda mitad, que es negativa y comprobable sobre el árbol de archivos.

### Límite de alcance

**R27.** El sistema NO DEBE incluir en esta feature ninguna operación de alta, edición o borrado
de unidades, ni ninguna regla de permisos, ni adaptador driving, ruta, Server Action o pantalla
que las exponga; por lo tanto esta feature no aporta ningún flujo navegable que un test E2E pueda
visitar.

**R28.** El sistema NO DEBE incorporar ninguna dependencia de terceros nueva para cumplir los
requisitos anteriores.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con el
requisito que la hace testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | Módulo propio `unidades`; los demás lo consumen por su contrato | R15, R16, R17, R19 |
| 2 | Épica nueva QC-37 «Catálogos»; la frontera de la épica es la del módulo | R15, R17 (la frontera de la épica **es** la del módulo, `docs/jira.md`: lo testeable de esta fila es que exista un módulo propio con su contrato; el resto es metadato del board) |
| 3 | Nombre y símbolo | R1 |
| 4 | Nombre obligatorio, símbolo opcional | R2, R3 |
| 5 | Unicidad del nombre por columna normalizada persistida + índice único | R4, R5 |
| 6 | La base está vacía; la migración falla si encuentra unidad escrita | R22 |
| 7 | La unidad del producto sigue siendo opcional | R10 |
| 8 | La unidad de la línea de receta sigue siendo obligatoria | R11 |
| 9 | Conjunto arrancador **en la propia migración** (sustituye al seed idempotente de QC-6, 2026-09-03) | R25, R26 |
| 10 | No se puede borrar una unidad en uso (`ON DELETE RESTRICT`) | R13 |
| 11 | Sin `deleted_at` en el catálogo | R8 |
| 12 | No hay conversión entre unidades | R14 |
| 13 | Altera dos tablas ajenas; el `down.sql` las devuelve a texto | R10, R11, R18, R23, R24 |
| 14 | RLS activada y forzada | R21 |
| 15 | `migration.sql` + `down.sql` que revierte al esquema exacto anterior | R20, R23 |
| 16 | Identificadores de la base en inglés | R20 |
| 17 | Los permisos no se deciden aquí | R27 |
| 18 | E2E diferido con motivo | R27 |
| 19 | Ninguna librería nueva | R28 |

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`).

1. **¿El símbolo debe ser único cuando existe?** No se decidió. Esta ficha **no** crea índice
   único sobre el símbolo: la identidad de la unidad es el nombre. Añadirlo después es de las
   pocas cosas baratas del repo — el catálogo es corto y no hay que migrar datos —, pero
   mientras tanto nada impide dos unidades distintas con el mismo símbolo.
2. **«La base está vacía» es cierto hoy, y se verifica el día del merge, no hoy.** La
   migración se escribe suponiendo que no hay productos ni recetas cargadas. Si para entonces
   los hay, la decisión se reabre: o se convierten los textos existentes en unidades, o las
   columnas quedan vacías. La migración debe **fallar en vez de perder el dato** si encuentra
   filas con unidad escrita.
3. **Presentación y unidad siguen siendo dos catálogos distintos.** No se evaluó si algún día
   convergen. Hoy responden preguntas distintas: la presentación clasifica el producto, la
   unidad anota en qué se mide.

**Añadidas por `spec_author` el 2026-09-03 (F1.2).** Ninguna bloquea el modelo, y ninguna se
rellena con un supuesto sin decirlo. La **4 la cerró el humano** ese mismo día; la **5 sigue
abierta**, con su posición por defecto escrita aquí (ningún `CHECK` de longitud mínima: los bordes
de aplicación son de QC-38).

4. ~~**El nombre y el símbolo exactos de las cinco unidades arrancadoras.**~~ **CERRADA por el
   humano el 2026-09-03.** Son **cuatro**, con nombre completo en **minúscula** y **las cuatro con
   símbolo**: `mililitro`/`ml`, `litro`/`l`, `gramo`/`gr`, `kilogramo`/`kg`. **«unidad»
   desaparece** del arrancador. Queda fijado en R25, y el símbolo opcional (R3) sigue existiendo
   como capacidad de la columna aunque ninguna fila arrancadora lo estrene ya.
   Lo que preguntaba, para que se lea qué se decidió: la decisión 9 nombraba el conjunto como
   «kg, g, L, mL, unidad», que son **símbolos**, y la decisión 3 daba el ejemplo «Kilogramo» /
   «kg»; faltaba (a) la capitalización y (b) si «unidad» llevaba símbolo.
5. **¿Un nombre de unidad en blanco es un nombre?** `NOT NULL` acepta `''`, y la normalización de
   un nombre hecho solo de signos devuelve `''`, con lo que **dos unidades en blanco chocarían**
   contra el índice único de R5 con el mensaje «ya existe una unidad con ese nombre». No se añade
   ningún `CHECK` de longitud mínima: los bordes de aplicación son de **QC-38**, igual que QC-14,
   QC-20 y QC-24 los dejaron en su ficha de CRUD. Se anota porque el síntoma es confuso si nadie
   lo esperaba.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-02 | ¿De quién es el catálogo de unidades? | **Módulo propio `unidades`**, hexagonal como `identity`, `inventario` y `recetas` (**QC-15**). Inventario, recetas y pedidos lo consumen **por su contrato público** (`@/lib/modules/unidades`), nunca por su tabla ni su repositorio. Por eso la ficha deja de colgar de la épica Inventario |
| 2026-09-02 | ¿Qué épica? | **Épica nueva QC-37 «Catálogos»**, para los catálogos compartidos y cortos del ERP. La frontera de la épica vuelve a ser la del módulo (`docs/jira.md`) |
| 2026-09-02 | ¿Nombre solo, o nombre y símbolo? | **Nombre y símbolo.** «Kilogramo» / «kg» |
| 2026-09-02 | Obligatoriedad | **Nombre obligatorio, símbolo opcional.** Sin símbolo, quien muestre la unidad pinta el nombre |
| 2026-09-02 | Unicidad del nombre | **Sí, comparando normalizado**: sin acentos, sin caracteres especiales y sin distinguir mayúsculas. Con **columna normalizada persistida más índice único**, no comparación al vuelo. Heredado de **QC-20 D16** y **QC-24** |
| 2026-09-02 | ¿Qué pasa con los textos de unidad ya guardados? | **Nada: la base está vacía.** La migración crea la tabla y cambia las columnas, sin conversión de datos. Si encuentra filas con unidad escrita, **falla** en vez de descartarlas (ver pregunta abierta 2) |
| 2026-09-02 | ¿La unidad del producto sigue siendo opcional? | **Sí.** Se conserva lo que fijó **QC-14**: un producto puede no declarar unidad |
| 2026-09-02 | ¿La unidad de la línea de receta sigue siendo obligatoria? | **Sí.** Se conserva lo que fijó **QC-24**. Lo que cambia es la forma —FK en vez de texto—, no la regla |
| 2026-09-02 | ¿Cómo nace el catálogo si no hay pantalla? | ~~**Con un conjunto arrancador en el seed** (kg, g, L, mL, unidad), sobre el seed idempotente que ya existe (**QC-6**): solo crea lo que falta y no pisa lo que alguien haya cambiado a mano~~ · **SUSTITUIDA el 2026-09-03 por la fila de abajo.** No se borra: es lo que se implementó en las rondas 1 y 2 |
| 2026-09-03 | ¿Cómo nace el catálogo si no hay pantalla? (sustituye a la decisión 9) | **Con cuatro filas insertadas por la propia migración** de esta feature: `mililitro`/`ml`, `litro`/`l`, `gramo`/`gr`, `kilogramo`/`kg`. **Se retira el aparato del seed entero** —caso de uso, puerto, adaptador driven, `export const unidades` de la composición y la llamada en `scripts/seed.ts`—. Motivo del humano: «no existe nada relacionado con unidades de medida así que ese seeder y mapeo está de sobra». Un catálogo cerrado de cuatro filas que nace con la tabla no necesita un caso de uso idempotente que lo siembre; y donde vive el dato es donde se crea la tabla. Lo que **no** cambia: el reapuntado a `unit_id` de las dos tablas ajenas y las dos guardias de datos (UP y DOWN) |
| 2026-09-02 | ¿Se puede borrar una unidad en uso? | **No.** `ON DELETE RESTRICT` desde producto y desde línea de receta |
| 2026-09-02 | Borrado del catálogo | **Sin `deleted_at`**, igual que `Role` y `Presentation`: el borrado lógico es un UPDATE y una FK no puede bloquear un UPDATE, así que la columna neutralizaría en silencio la única garantía real de la fila anterior |
| 2026-09-02 | ¿Hay conversión entre unidades? | **No, y no la habrá en esta ficha.** La unidad sigue siendo puramente anotativa. Coherente con **QC-14** y **QC-24** |
| 2026-09-02 | Esta ficha altera dos tablas que no son suyas | **Sí, y por eso está bloqueada por QC-24**, que está creando ahora mismo la línea de receta con su columna de texto. `products.unit` y la unidad de la línea pasan a `unit_id`. El `down.sql` las devuelve a texto |
| 2026-09-02 | RLS | **Activada y forzada** (`FORCE ROW LEVEL SECURITY`). Heredado de **QC-4 R19**. No sustituye a la autorización en el service |
| 2026-09-02 | Migración | `migration.sql` (UP) más `down.sql` (DOWN) obligatorio, y revertirla deja el esquema exactamente como estaba. Heredado de **QC-4 R20** |
| 2026-09-02 | Idioma de los identificadores de la DB | **Inglés** (`units`, `unit_id`, …). Heredado de **QC-4** |
| 2026-09-02 | Permisos | **Aquí no se deciden**: no hay service. Los fija **QC-38**, con su test (`CHECKPOINTS.md > Permisos`) |
| 2026-09-02 | E2E | **Diferido con motivo**: no hay pantalla ni flujo navegable, es esquema, seed y migración. Lo decide **QC-39**. Mismo criterio que QC-14 y QC-24 |
| 2026-09-02 | Librería nueva | **Ninguna.** Es esquema Prisma, migración, seed y el armazón del módulo. Regla 7 de `CLAUDE.md` sin propuesta que abrir |
