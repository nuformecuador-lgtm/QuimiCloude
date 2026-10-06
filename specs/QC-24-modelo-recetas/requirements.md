# QC-24 — modelo-recetas · requirements.md

> **Zona:** `backend` · **Complejidad:** `high` · **depends_on:** `QC-14` ·
> **Rama:** `feature/QC-24-modelo-recetas`
>
> **Alcance.** Persistir el catálogo de recetas y las líneas de producto que las componen, en un
> **módulo hexagonal nuevo `recetas`**. Dos tablas, la relación con productos como entidad propia
> de la relación, la columna normalizada con su índice único, las dos columnas de auditoría, la
> migración con su `down.sql` y los tests. Es la primera feature de la épica **QC-27 — Recetas**.
>
> **Lo que NO entra.** El alta, la consulta, la edición y el borrado de recetas: van a **QC-25 —
> CRUD de recetas**. La pantalla: **QC-26 — Pantalla de recetas**. La subida de la imagen a
> Supabase Storage y la librería de cliente que hace falta para ello: **QC-25**. Tampoco entra el
> historial de versiones de fórmula, que no tiene ficha.
>
> Sembrado por `/afinar-feature` el 2026-09-02. El bloque de Alcance y la tabla de
> «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los
> reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Notación EARS (`docs/specs.md`). **«El sistema»** aquí es la **capa de persistencia** de
QuimiCloude —el esquema Prisma (`db/schema.prisma`) más la base Postgres con la migración de
esta feature aplicada— **más el armazón del módulo `recetas`** y la frontera que ese módulo
tiene con `inventario`. No hay caso de uso, ni service, ni interfaz de usuario en esta ficha
(decisiones cerradas de E2E y de permisos), así que ningún requisito habla de quién llama ni
desde dónde.

### Estructura de la receta

**R1.** El sistema DEBE persistir, para cada receta, un identificador propio, estable y no
derivado de sus datos de negocio, más su nombre, su descripción, sus pasos y la dirección de su
imagen.

**R2.** SI se intenta persistir una receta sin nombre, ENTONCES el sistema DEBE rechazar la
operación y no crear ninguna fila.

**R3.** El sistema NO DEBE limitar la longitud del nombre ni la de la descripción en la propia
columna, y NO DEBE rechazar una receta por la longitud de ninguno de los dos: el límite de 120 y
500 caracteres es validación de aplicación y pertenece a **QC-25**.

**R4.** El sistema DEBE almacenar los pasos de una receta como **un único documento JSON en una
sola columna**, conservando el orden de la lista tal como se guardó; NO DEBE mantener ninguna
entidad ni tabla separada de «paso», NO DEBE derivar ninguna columna de orden, y NO DEBE
rechazar un documento por su forma ni por su contenido.

**R5.** SI se persiste una receta sin indicar pasos, ENTONCES el sistema DEBE registrar una
**lista vacía**, y NO DEBE dejar los pasos como ausencia de valor.

**R6.** El sistema DEBE almacenar la imagen de la receta como **una única columna de texto
opcional** con su dirección, y NO DEBE almacenar el contenido del archivo, ni subirlo, ni
conocer el servicio donde vive.

### Unicidad del nombre de la receta

**R7.** SI se intenta persistir una receta cuyo nombre coincida con el de otra receta ya
existente **una vez normalizado** —sin acentos, sin caracteres especiales y sin distinguir
mayúsculas de minúsculas—, ENTONCES el sistema DEBE rechazar la operación **en la propia base de
datos** y no crear ni modificar ninguna fila.

**R8.** El sistema DEBE persistir el nombre normalizado de cada receta en una columna propia
junto al nombre original, y DEBE exponer **una única definición** de esa normalización, publicada
por el contrato del módulo `recetas`, de modo que la columna y cualquier consumidor futuro
normalicen igual.

**R9.** MIENTRAS una receta esté borrada lógicamente, el sistema DEBE permitir que otra receta
viva use su mismo nombre normalizado (ver pregunta abierta 3).

### Estructura de la línea de receta

**R10.** El sistema DEBE persistir cada pareja receta–producto como **entidad propia** con su
propia cantidad y su propia unidad de medida, y NO DEBE modelarla como una tabla de unión sin
datos.

**R11.** SI se intenta persistir en una misma receta una segunda línea que apunte al mismo
producto, ENTONCES el sistema DEBE rechazar la operación **en la propia base de datos** y no
crear ninguna fila.

**R12.** El sistema DEBE permitir que una receta tenga un número ilimitado de líneas y que un
mismo producto aparezca en un número ilimitado de recetas distintas.

**R13.** El sistema DEBE almacenar la cantidad de la línea como número **decimal exacto** de 14
dígitos de precisión y 4 decimales, DEBE devolver sin pérdida cualquier valor con hasta 4
decimales, y NO DEBE usar ninguna representación de coma flotante binaria (`float`, `double`,
`real`).

**R14.** SI se intenta persistir una línea cuya cantidad sea cero, negativa o ausente, ENTONCES
el sistema DEBE rechazar la operación **en la propia base de datos** y no crear ni modificar
ninguna fila.

**R15.** El sistema DEBE exigir una unidad de medida en cada línea, DEBE almacenarla como texto
libre, y NO DEBE restringirla a un conjunto de valores admitidos, NO DEBE tomarla de la unidad
del producto ni derivar de ella ninguna conversión entre unidades.

**R16.** SI se intenta persistir una línea sin receta, sin producto, o con una receta o un
producto inexistentes, ENTONCES el sistema DEBE rechazar la operación y no crear ninguna fila.

### Frontera de módulo

**R17.** El sistema DEBE declarar `recetas` como módulo propietario de los dos modelos de esta
feature, y ningún módulo distinto de `recetas` DEBE consultarlos con el cliente Prisma.

**R18.** El módulo `recetas` NO DEBE consultar el modelo de producto con el cliente Prisma, ni
importar el dominio, los puertos o los adaptadores de `inventario` por ruta profunda: todo lo que
`recetas` sepa del producto DEBE llegarle por el contrato público de `inventario`
(`@/lib/modules/inventario`), que DEBE publicar ese contrato.

**R19.** El sistema DEBE declarar la referencia de la línea al producto y las dos referencias de
auditoría al usuario como **campos escalares sin relación de Prisma**, de modo que ninguna
consulta del cliente Prisma pueda atravesar desde una receta o una línea hasta un producto o un
usuario; y DEBE mantener aun así la restricción de clave foránea **real en la base de datos**.

**R20.** El módulo `recetas` DEBE nacer con la forma hexagonal del repositorio: un contrato
público (`index.ts`) que solo reexporta símbolos de su propio `domain/`, las carpetas `domain/`,
`ports/` y `adapters/` como únicas carpetas del módulo, y ningún `'use server'` alcanzable desde
ese contrato.

### Auditoría, borrado y marcas de tiempo

**R21.** El sistema DEBE registrar, para cada receta, qué usuario la creó y qué usuario la
modificó por última vez **cuando ese usuario exista**, y SI se intenta registrar como autor un
usuario inexistente, ENTONCES DEBE rechazar la operación.

**R22.** CUANDO se borra una receta, el sistema DEBE conservar su fila completa y registrar el
instante del borrado, sin eliminar ninguno de sus datos.

**R23.** El sistema DEBE registrar, para cada receta y cada línea, el instante de creación y el
instante de la última modificación, y DEBE actualizar el segundo cada vez que la fila cambia.

**R24.** CUANDO se quita un producto de una receta, el sistema DEBE eliminar la fila de la línea
por completo, y NO DEBE conservar ninguna marca de borrado lógico de líneas.

**R25.** SI se elimina físicamente una receta, ENTONCES el sistema DEBE eliminar también todas
sus líneas y NO DEBE dejar ninguna línea huérfana.

**R26.** CUANDO se borra lógicamente una receta, el sistema DEBE conservar sus líneas sin
modificar y asociadas a ella.

**R27.** MIENTRAS un producto usado por al menos una línea esté borrado lógicamente, el sistema
DEBE conservar esa línea apuntando al mismo producto; y SI se intenta eliminar físicamente un
producto referenciado por alguna línea, ENTONCES DEBE rechazar el borrado.

### Esquema, seguridad y migración

**R28.** El sistema DEBE nombrar en **inglés** todas las tablas, columnas, índices y
restricciones que cree esta feature.

**R29.** El sistema DEBE tener `ROW LEVEL SECURITY` activado **y forzado**
(`FORCE ROW LEVEL SECURITY`) en las dos tablas que crea esta feature.

**R30.** CUANDO se revierte la migración de esta feature, el sistema DEBE quedar exactamente en
el estado de esquema previo a aplicarla, sin dejar tablas, restricciones, índices ni columnas
residuales.

### Límite de alcance

**R31.** El sistema NO DEBE incluir en esta feature ninguna operación de alta, consulta, edición
o borrado de recetas ni de sus líneas, ni ninguna regla de permisos, ni adaptador driving, ruta,
Server Action o pantalla que las exponga; por lo tanto esta feature no aporta ningún flujo
navegable que un test E2E pueda visitar.

**R32.** El sistema NO DEBE incorporar ninguna dependencia de terceros nueva para cumplir los
requisitos anteriores.

### Añadidos tras cerrar las preguntas abiertas (2026-09-02)

**R33.** El sistema DEBE aceptar una receta **sin autor de creación y sin autor de última
modificación**, DEBE conservarlos como ausencia de valor, y NO DEBE rechazar la operación por
ello: la ausencia significa «no la creó una persona» —una importación o una siembra—, no «se
perdió el dato».

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con el
requisito que la hace testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | Módulo propio `recetas`; el producto se conoce por el contrato de `inventario` | R17, R18, R20 |
| 2 | Las columnas de auditoría las crea esta ficha | R21 |
| 3 | Auditoría: FK real a `users`, escalares sin `@relation` | R19, R21 |
| 4 | 120 / 500 caracteres viven en la validación de aplicación | R3 |
| 5 | La línea se borra físicamente y se va con su receta | R24, R25 |
| 6 | Borrado lógico de la receta con las tres marcas de tiempo | R22, R23, R26 |
| 7 | Unicidad del nombre por columna normalizada + índice único | R7, R8, R9 |
| 8 | Cantidad `decimal(14,4)`, obligatoria y `> 0` por `CHECK` | R13, R14 |
| 9 | Unidad de la línea: texto libre obligatorio y anotativo | R15 |
| 10 | Los pasos, un único documento JSON en la columna | R4, R5 |
| 11 | La imagen, una sola columna de texto opcional | R6 |
| 12 | La relación receta-producto es entidad propia, única por pareja | R10, R11, R12, R16 |
| 13 | Un producto dado de baja no se lleva la línea | R27 |
| 14 | RLS activada y forzada en las dos tablas | R29 |
| 15 | Migración con `down.sql` que revierte al esquema exacto anterior | R30 |
| 16 | Identificadores de la base en inglés | R28 |
| 17 | E2E diferido con motivo | R31 |
| 18 | Los permisos no se deciden aquí | R31 |
| 19 | Ninguna librería nueva | R32 |
| 20 | El nombre de una receta borrada queda libre (índice único parcial) | R9 |
| 21 | La descripción es opcional | R1, R3 |
| 22 | El autor puede quedar vacío | R33 (y R21, que ya solo exige registrarlo cuando existe) |

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`). Ninguna bloquea el modelo, pero las dos
son **caras de cerrar después**, no columnas que se añadan un martes.

1. **¿Hará falta historial de versiones de fórmula?** Hoy **no**: se ofreció al acotar y se
   descartó a favor de que las líneas se borren de verdad (D4). El problema de retrofitearlo no es
   la tabla, es que para cuando alguien lo pida **las versiones anteriores ya se perdieron**: no
   hay dato del que reconstruirlas. En un ERP de formulación química suele acabar haciendo falta,
   y a menudo por normativa. Si aparece, es ficha propia de la épica QC-27.
2. **La precisión de la cantidad se hereda de `cost`, que es dinero.** `decimal(14,4)` da cuatro
   decimales. Si alguna fórmula real necesita microgramos de un catalizador, se queda corta, y
   ampliarla con recetas ya cargadas obliga a migrar. Se asume el riesgo a conciencia, igual que
   QC-14 asumió el de la unidad como texto libre.

Las tres que añadió `spec_author` en F1.2 —índice único parcial, obligatoriedad de la descripción
y obligatoriedad del autor— **el humano las cerró el 2026-09-02** y bajaron a la tabla de
decisiones cerradas (filas 20, 21 y 22). Aquí ya no quedan.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-02 | ¿Recetas es un módulo propio o parte de `inventario`? | **Módulo propio `recetas`**, hexagonal como `identity` e `inventario` (**QC-15**): su dominio, sus puertos, sus adaptadores y su cableado en `lib/composition`. La línea conoce al producto **por el contrato público de `inventario`** (`@/lib/modules/inventario`), nunca por su tabla, su modelo de Prisma ni su repositorio. Coherente con que el humano separase Recetas como épica propia (**QC-27**) el mismo día |
| 2026-09-02 | ¿Quién crea las columnas de auditoría? | **Esta ficha**, en la migración inicial: `created_by` y `updated_by` en `recipes`. Se aparta a propósito de QC-14/QC-20, donde el modelo nació sin auditoría y el CRUD la añadió — allí se decidió **después** de que el modelo estuviera mergeado; aquí ya se sabe, y dos migraciones sobre una tabla recién creada no compran nada |
| 2026-09-02 | Forma de esas columnas de auditoría | **FK real a `users`, pero declaradas como escalares SIN `@relation` de Prisma**, con la FK escrita a mano en el `migration.sql`. Heredado de **QC-20 D8**, y es lo que impide que el ORM atraviese de `recetas` a `users` con un `include`. **La guardia de módulos no detectaría ese cruce**, porque no es un import |
| 2026-09-02 | Largo máximo del nombre y la descripción | **120 el nombre, 500 la descripción.** Viven en la **validación de aplicación** (QC-25), no en la columna: sin migración que cambie el tipo. Heredado de **QC-20 D11**. El nombre reutiliza el mismo 120 del producto |
| 2026-09-02 | Al quitar un producto de una receta, ¿la línea desaparece? | **Sí, borrado físico de la línea.** Sin `deleted_at`: la línea es parte de la receta, no un hecho histórico, y corregir una fórmula es una edición normal. Al borrar la receta, sus líneas se van con ella. Mismo criterio que el catálogo de presentaciones en **QC-14** |
| 2026-09-02 | Borrado de la receta | **Lógico**, con `created_at` / `updated_at` / `deleted_at`. Heredado de **QC-4** y reforzado por `docs/architecture.md > Dominio` n.º 3. Ya lo daba por hecho la ficha de QC-25 («borrar una receta la oculta y no se restaura») |
| 2026-09-02 | Unicidad del nombre de la receta | **Sí, y comparando normalizado**: sin acentos, sin caracteres especiales y sin distinguir mayúsculas. Se garantiza con **columna normalizada persistida más índice único**, no con comparación al vuelo — heredado de **QC-20 D16**, donde se decidió que sin índice no es una garantía real |
| 2026-09-02 | Tipo y precisión de la cantidad | **`decimal(14,4)`, obligatoria y siempre `> 0`** (ni negativa ni cero), garantizado por `CHECK` en la base. Nunca `float`. Heredado de **QC-14** |
| 2026-09-02 | Unidad de medida de la línea | **Texto libre obligatorio y puramente anotativo.** No hay conversión entre unidades y **no** se toma de la unidad del producto, que es opcional. Coherente con la pregunta abierta n.º 1 del dominio, cerrada por QC-14 |
| 2026-09-02 | Forma de los pasos | **Un único documento JSON en la columna**, no tabla aparte: lista ordenada de textos, y el orden es el de la lista. La base guarda el documento tal cual; que sea una lista de textos y que ninguno venga vacío **lo hace cumplir la capa de aplicación** (QC-25), no la columna |
| 2026-09-02 | Forma de la imagen | **Una sola columna de texto opcional** con la dirección del archivo. El modelo no sube nada ni sabe dónde vive. La subida a Supabase Storage y su librería son de **QC-25** |
| 2026-09-02 | La relación receta-producto | **Entidad propia**, no tabla de unión sin datos: cada pareja guarda su cantidad y su unidad. Índice único `(recipe_id, product_id)` para que un producto no aparezca dos veces en la misma receta |
| 2026-09-02 | ¿Qué pasa si se da de baja un producto usado en recetas? | **La receta conserva su línea.** El borrado de producto es lógico (QC-20 D5), así que la fila sigue existiendo y la línea sigue apuntando al mismo producto |
| 2026-09-02 | RLS | **Activada y forzada** (`FORCE ROW LEVEL SECURITY`) en las dos tablas. Heredado de **QC-4 R19**. No sustituye a la autorización en el service (`docs/architecture.md > Acceso a datos y autorizacion`) |
| 2026-09-02 | Migración | `migration.sql` (UP) más `down.sql` (DOWN) obligatorio, y revertirla deja el esquema exactamente como estaba. Heredado de **QC-4 R20** |
| 2026-09-02 | Idioma de los identificadores de la DB | **Inglés** (tablas, columnas, índices, restricciones). Heredado de **QC-4** |
| 2026-09-02 | E2E | **Diferido con motivo**: no hay pantalla ni flujo navegable que visitar, es esquema y migración. Lo decide **QC-26**. Mismo criterio que QC-14 |
| 2026-09-02 | Permisos | **Aquí no se deciden**: no hay service en esta ficha. Los fija **QC-25**, que ya dice «solo el Administrador», y allí van con su test (`docs/checkpoints-proyecto.md > Permisos`) |
| 2026-09-02 | Librería nueva | **Ninguna.** Es esquema Prisma, migración y el armazón del módulo. La única librería del área —el cliente de Supabase para subir la imagen— es de **QC-25** y entra por la regla 7 allí |
| 2026-09-02 | ¿El nombre de una receta borrada queda libre? | **Sí.** El índice único es **parcial**: solo alcanza a las recetas vivas (`WHERE deleted_at IS NULL`). Borrar una receta libera su nombre. Heredado de **QC-4**, que lo resolvió igual para el correo y el documento de `users`; QC-20 D16 no tuvo que responderlo porque `presentations` no tiene borrado lógico. Cierra la pregunta abierta 3 de `spec_author` |
| 2026-09-02 | ¿La descripción es obligatoria? | **No, es opcional.** Confirma lo que dice la ficha del board. Su largo máximo (500) sigue siendo validación de aplicación en **QC-25**. Cierra la pregunta abierta 4 de `spec_author` |
| 2026-09-02 | ¿Puede existir una receta sin autor? | **Sí: `created_by` y `updated_by` son anulables.** Algo que no es una persona —una importación masiva, un seed— tiene que poder crear recetas. Un autor vacío significa **«no la creó una persona»**, no «se perdió el dato»; quien lo lea lo muestra así (**QC-25**). Se aparta de la posición por defecto que había tomado `spec_author` (`NOT NULL`). Cierra la pregunta abierta 5 de `spec_author` |

## Enmienda 2026-10-01 — versiones de receta (QC-172)

La unicidad del nombre (R7, R9) se parte en dos ámbitos disjuntos: entre **originales** vivas de la
misma empresa (`recipes_company_name_unique`, ahora con `parent_recipe_id IS NULL`) y entre
**versiones** vivas de la misma original (nuevo `recipes_version_name_unique`). Una versión puede
llamarse como otra receta original. Detalle en
[`specs/QC-172-versiones-de-receta/`](../QC-172-versiones-de-receta/).
