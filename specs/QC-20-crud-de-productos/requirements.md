# QC-20 — crud-de-productos · requirements.md

> **Zona:** `backend` · **Complejidad:** `high` · **depends_on:** `QC-14`, `QC-8` ·
> **Rama:** `feature/QC-20-crud-de-productos`
>
> **Alcance.** Los casos de uso del catálogo, sobre el modelo que crea QC-14: alta, consulta
> paginada, edición y borrado de **productos**, y lo mismo para las filas del catálogo de
> **presentaciones**. Incluye la autorización en el service, la validación de borde, las dos
> columnas de auditoría con su migración, el util de paginación reutilizable y las Server
> Actions que la pantalla consumirá. Todo dentro del módulo `inventario`.
>
> **Lo que NO entra.** La pantalla y sus componentes: van a **QC-22 — Pantalla de productos**
> (épica QC-18, creada en el board el 2026-09-02 y bloqueada por esta ficha). Tampoco entran
> los movimientos de inventario, la evaluación de la cantidad de alerta, el historial de
> cambios campo a campo, ni la restauración de un producto ya borrado.
>
> Sembrado por `/afinar-feature` el 2026-09-02. El bloque de Alcance y la tabla de
> «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los
> reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Notación EARS (`docs/specs.md`). **«El sistema»** aquí es el módulo **`inventario`** —sus casos
de uso, sus puertos y sus adaptadores—, el util de paginación de `lib/shared/` y la migración
de esta feature. El modelo de datos ya existe y **no se re-especifica**: lo aportó **QC-14**
(`db/schema.prisma`, `db/migrations/20260902005510_products_and_presentations/`) y aquí solo se
consume y se amplía con las tres columnas que las decisiones D7 y D13 exigen.

Los **ocho casos de uso** a los que se refieren los requisitos de autorización son: crear,
consultar (lista paginada y ficha), editar y borrar **producto**, y los mismos cuatro para
**presentación**.

### Autorización y actor

**R1.** El sistema DEBE recibir el actor —su identificador y su rol— **como parámetro de
entrada** de cada caso de uso, y NO DEBE leer la sesión, la cookie ni ninguna cabecera por su
cuenta desde el dominio.

**R2.** SI el rol del actor no es `Administrador`, ENTONCES cualquiera de los ocho casos de uso
DEBE rechazar la operación con un error de autorización, y NO DEBE realizar ninguna lectura ni
ninguna escritura en el repositorio. Esto incluye **consultar**: el Operador tampoco lee.

**R3.** SI la operación llega sin actor, o con un actor cuyo rol es desconocido, nulo o vacío,
ENTONCES el sistema DEBE rechazarla igual que en R2 (falla cerrado), y NO DEBE tratar la
ausencia de rol como permiso.

**R4.** El sistema DEBE conservar `ROW LEVEL SECURITY` habilitado **y forzado** en `products` y
`presentations` después de la migración de esta feature, y NO DEBE crear ninguna policy que
pretenda sustituir la comprobación de R2.

### Producto — alta y edición

**R5.** CUANDO un actor con rol `Administrador` da de alta un producto con datos válidos, el
sistema DEBE persistirlo asociado a una presentación existente y DEBE devolver su identificador.

**R6.** CUANDO se da de alta un producto, el sistema DEBE registrar al actor como autor de la
creación **y** como autor de la última modificación; y CUANDO se edita o se borra un producto,
DEBE registrar al actor como autor de la última modificación, sin alterar el autor de la
creación.

**R7.** El sistema DEBE almacenar los dos autores como **referencia real a un usuario
existente**, y SI se intenta registrar como autor un identificador que no corresponde a ningún
usuario, ENTONCES DEBE rechazar la operación y no crear ni modificar ninguna fila.

**R8.** El módulo `inventario` NO DEBE consultar el modelo `User` ni la tabla `users` con el
cliente Prisma, y DONDE se necesite el **nombre** del autor, el sistema DEBE obtenerlo a través
del contrato público `@/lib/modules/identity`, nunca por ruta profunda, ni por el repositorio de
`identity`, ni por una consulta propia.

**R9.** SI el nombre de un producto o de una presentación está vacío o se compone solo de
espacios, ENTONCES el sistema DEBE rechazar la operación; y CUANDO el nombre es válido, DEBE
recortar los espacios de sus extremos **antes** de guardarlo.

**R10.** SI el tiempo de entrega recibido es negativo, ENTONCES el sistema DEBE rechazar la
operación en la aplicación, antes de llegar al repositorio.

**R11.** SI el nombre de un producto supera **120** caracteres, o el de una presentación supera
**60**, ENTONCES el sistema DEBE rechazar la operación; y NO DEBE cambiar el tipo de ninguna
columna para imponer ese límite, que vive solo en la validación.

**R12.** El sistema DEBE aceptar dos o más productos con el mismo nombre —coincidan de forma
exacta o solo salvo mayúsculas, acentos o signos—, sin rechazar ninguno.

**R13.** CUANDO un `Administrador` edita un producto, el sistema DEBE permitir modificar la
**existencia** como un campo más, junto al resto de datos de negocio, y DEBE guardar el valor
recibido tal cual, sin derivarlo de ningún movimiento ni recalcularlo.

**R14.** SI la edición o el borrado apuntan a un producto que no existe o que ya está borrado,
ENTONCES el sistema DEBE responder con un error de «no encontrado» y no DEBE crear ni modificar
ninguna fila.

### Producto — borrado

**R15.** CUANDO se borra un producto, el sistema DEBE conservar su fila completa y marcar el
instante del borrado, y NO DEBE eliminarla físicamente.

**R16.** El sistema DEBE excluir los productos borrados de **toda** consulta —lista paginada y
ficha individual—, y NO DEBE ofrecer ninguna operación de restauración ni de listado de
borrados.

### Presentación

**R17.** CUANDO se da de alta o se edita una presentación, el sistema DEBE persistir, junto al
nombre, su **forma normalizada**, y DEBE mantener las dos sincronizadas en toda escritura.

**R18.** SI se intenta dar de alta o renombrar una presentación cuyo nombre normalizado coincide
con el de otra presentación existente, ENTONCES el sistema DEBE rechazar la operación con un
error de duplicado y no DEBE crear ni modificar ninguna fila.

**R19.** El sistema DEBE considerar iguales dos nombres de presentación que solo difieran en
mayúsculas y minúsculas, en acentos o diacríticos, o en caracteres no alfanuméricos —«Bidón
20 L», «bidon 20 l» y «BIDON-20L» son la misma presentación—.

**R20.** El sistema DEBE garantizar la unicidad de R18 con un **índice único en la base de
datos** sobre la columna normalizada, de modo que dos altas simultáneas que superen la
comprobación previa acaben con **una sola** fila creada y la otra rechazada.

**R21.** SI se intenta borrar una presentación que tiene al menos un producto asignado
—**incluidos los productos borrados lógicamente**—, ENTONCES el sistema DEBE rechazar el borrado
con un error de conflicto y conservar la presentación y sus productos sin modificar.

**R22.** MIENTRAS una presentación no tenga ningún producto asignado, el sistema DEBE permitir
su borrado **físico**, tras el cual su fila deja de existir; y NO DEBE marcarla como borrada ni
conservarla.

### Consulta paginada

**R23.** CUANDO se consulta la lista de productos o la de presentaciones, el sistema DEBE
devolver como máximo tantos elementos como indique el tamaño de página solicitado, junto con el
número total de elementos que cumplen la consulta.

**R24.** SI la consulta no indica tamaño de página, ENTONCES el sistema DEBE usar **10**
elementos por página.

**R25.** SI el número de página o el tamaño de página recibidos no son enteros mayores o iguales
a 1, ENTONCES el sistema DEBE rechazar la consulta y no DEBE leer del repositorio.

**R26.** El sistema DEBE recorrer las páginas con un orden **estable y determinista**, de forma
que ningún elemento aparezca en dos páginas ni se omita de todas ellas mientras el conjunto no
cambie.

**R27.** El sistema DEBE resolver el cálculo de la paginación en un **util reutilizable** de
`lib/shared/`, no dentro del caso de uso, y ese util NO DEBE importar ningún módulo ni el punto
de composición.

### Borde, módulo y migración

**R28.** El sistema DEBE validar con un esquema toda entrada externa de los ocho casos de uso en
el borde, y NO DEBE dejar que ningún dato sin validar ni tipar cruce hacia el dominio.

**R29.** El sistema DEBE exponer las mutaciones del catálogo como **Server Actions** en
`adapters/driving/` del módulo `inventario`, y NO DEBE crear ningún route handler para ellas.

**R30.** El sistema DEBE nombrar en **inglés** todas las columnas, índices y restricciones que
cree esta feature.

**R31.** El sistema DEBE alojar los casos de uso en `lib/modules/inventario/domain/`, con los
accesos a datos detrás de puertos implementados en `adapters/driven/` y cableados **solo** en
`lib/composition/`; el dominio NO DEBE importar framework, Prisma, `lib/shared/` ni el punto de
composición, y el contrato `lib/modules/inventario/index.ts` NO DEBE reexportar nada que no sea
de `./domain`.

**R32.** CUANDO se revierte la migración de esta feature, el sistema DEBE quedar exactamente en
el estado de esquema previo a aplicarla, sin dejar columnas, índices ni restricciones
residuales.

**R33.** El sistema NO DEBE incorporar ninguna dependencia de terceros nueva para cumplir los
requisitos anteriores.

**R34.** El sistema NO DEBE incluir en esta feature ninguna pantalla, página ni componente de
interfaz —van a **QC-22**—; por lo tanto esta feature no aporta ningún flujo navegable que un
test E2E pueda visitar, y su verificación es unitaria y de integración.

### Añadidos al cerrarse las preguntas abiertas (2026-09-02)

Numerados al final para no renumerar nada de lo anterior. **R26 no cambia**: sigue exigiendo un
orden estable; **R35** dice cuál es.

**R35.** El sistema DEBE ordenar las dos listas por **nombre ascendente**, y DEBE desempatar por
el identificador ascendente. El desempate no es opcional: el nombre del producto **no es único**
(D14, R12), así que sin él dos homónimos pueden intercambiarse entre consultas y R26 dejaría de
cumplirse.

**R36.** SI la consulta pide un tamaño de página mayor que **25**, ENTONCES el sistema DEBE
devolver como máximo 25 elementos, y NO DEBE ejecutar una consulta sin límite superior. El
tamaño por defecto sigue siendo **10** (D15, R24).

**R37.** SI el nombre de una presentación queda **vacío** después de normalizarlo —porque no
contiene ningún carácter alfanumérico—, ENTONCES el sistema DEBE rechazarlo como nombre
inválido, y NO DEBE dejar que llegue al índice único y se anuncie como duplicado.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con el
requisito que la hace testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | La ficha se parte: aquí el backend, la pantalla a QC-22 | R34 |
| 2 | Solo Administrador, también para consultar, validado en el service | R2, R3 |
| 3 | La existencia se edita a mano, como un campo más | R13 |
| 4 | E2E diferido con motivo | R34 |
| 5 | Borrado de producto lógico y sin restaurar | R15, R16 |
| 6 | Borrado de presentación físico y bloqueado por la FK | R21, R22 |
| 7 | `created_by` / `updated_by` en `products`, con migración y `down.sql` | R6, R32 |
| 8 | Las columnas de auditoría son FK real a `users`, sin cruzar el módulo | R7, R8 |
| 9 | Nombre vacío se rechaza; se recortan los espacios | R9 |
| 10 | Tiempo de entrega negativo se rechaza en la aplicación | R10 |
| 11 | Largo máximo 120 / 60, solo en la validación | R11 |
| 12 | Presentaciones duplicadas prohibidas por nombre normalizado | R18, R19 |
| 13 | Unicidad por columna normalizada persistida con índice único | R17, R20, R32 |
| 14 | El nombre del producto sigue sin ser único | R12 |
| 15 | Consulta paginada, 10 por página por defecto | R23, R24, R25 |
| 16 | El cálculo de la paginación se extrae a `lib/shared/` | R27 |
| 17 | El actor y su rol entran por parámetro (QC-8 los resuelve) | R1 |
| 18 | Módulo `inventario`, Server Action, zod en el borde, DB en inglés | R28, R29, R30, R31, R33 |
| 19 | Orden por defecto `name ASC`, con `id ASC` de desempate | R26, R35 |
| 20 | El listado devuelve solo los ids de los autores | R8 |
| 21 | Tope superior del tamaño de página: 25 | R36 |
| 22 | Nombre de presentación que normaliza a vacío: se rechaza | R37 |
| 23 | `ADMIN_ROLE_NAME` vive en `inventario/domain/actor.ts` | R2, R31 |

Requisitos que no salen de una fila de la tabla, y de dónde salen: **R4** de
`docs/architecture.md > Acceso a datos y autorizacion` (RLS forzada, defensa en profundidad, ya
existente y que la migración no debe romper); **R5**, **R14** y **R26** del propio alcance —el
camino feliz del alta, el caso de la ficha inexistente y la condición sin la cual una consulta
paginada no significa nada—.

## Preguntas abiertas

Ninguna. Las cinco que dejó la acotación se cerraron el mismo día y están abajo (D14–D18).

Las de QC-14 que apuntaban aquí también quedan cerradas: **«quién puede ver y tocar
productos»** (pregunta abierta 4 de `specs/QC-14-modelo-producto/requirements.md`) la cierra
D2, y el **E2E que QC-14 difirió** lo cierra D4. Sigue abierta, y no es de esta ficha, la
trazabilidad por lote y vencimiento (pregunta 2 del dominio en `docs/architecture.md`).

### Las cinco que abrió `spec_author` al escribir el diseño (F1.2)

**Cerradas el 2026-09-02**, todas por el humano, y escritas como **D19–D23** en la tabla de
decisiones. No queda ninguna abierta: la 3 cambió la posición que traía el diseño (el tope pasó
de 100 a **25**) y se propagó al util de `lib/shared/`, a **R36** y a su test.

## Decisiones cerradas (no reabrir)

Las **18 primeras** las fijó el humano en la acotación, antes del spec. Las **cinco últimas
(D19–D23)** las cerró el mismo humano el mismo día, después de F1.2, respondiendo a las preguntas
abiertas que dejó `spec_author`. Valen exactamente igual: no se reabren.

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-02 | ¿Se parte la ficha `fullstack`? | **Sí.** QC-20 se queda con el backend; la pantalla sale a **QC-22 — Pantalla de productos**, bloqueada por esta. Se aparta del precedente de QC-15 y QC-13, que no se partieron |
| 2026-09-02 | ¿Quién puede hacer qué? | **Solo Administrador**, y para todo: consultar, crear, editar y borrar, tanto productos como presentaciones. El Operador **ni siquiera consulta**. Se valida en el **service** con su test — una policy de RLS no cuenta como implementado (`docs/architecture.md > Acceso a datos y autorizacion`, `docs/checkpoints-proyecto.md > Datos y seguridad`) |
| 2026-09-02 | ¿La existencia (`stock`) se edita a mano? | **Sí, como un campo más.** No hay ficha de movimientos en el backlog; sin esto la existencia sería siempre 0 |
| 2026-09-02 | ¿E2E? | **Diferido con motivo.** Esta ficha no tiene pantalla ni guardia de sesión real (QC-13 sigue `pending`), así que no hay flujo navegable que visitar. Lo decide **QC-22**. Cierra el diferimiento que QC-14 dejó apuntando aquí |
| 2026-09-02 | ¿Qué significa borrar un producto? | **Borrado lógico y sin restaurar.** Se marca `deleted_at` y **toda** consulta lo excluye. Sin papelera y sin operación de restaurar. Heredado de **QC-4** y de `docs/architecture.md > Dominio` n.º 3 |
| 2026-09-02 | ¿Y borrar una presentación? | **Físico, y bloqueado por la FK** mientras tenga productos asignados. Heredado de **QC-14**: `presentations` no lleva `deleted_at` precisamente para que la FK `ON DELETE RESTRICT` pueda impedirlo |
| 2026-09-02 | ¿Se guarda quién tocó cada producto? | **Sí: `created_by` y `updated_by` en `products`**, con migración nueva y su `down.sql`. Sin historial campo a campo — eso sería tabla propia y ficha propia. Lo pide `docs/architecture.md > Dominio` n.º 3, porque aquí sí se mueve la existencia a mano |
| 2026-09-02 | Las columnas de auditoría, ¿FK real? | **Sí, FK real a `users`.** Es una FK que cruza la frontera de módulo, así que el `design.md` tiene que decir cómo se respeta **QC-15** con ella: el módulo `inventario` **no consulta el modelo `User`**, y para mostrar el nombre del autor pide el contrato público de `identity` (`@/lib/modules/identity`), nunca su repositorio ni su tabla |
| 2026-09-02 | Nombre vacío | **Se rechaza**, y se recortan los espacios de los extremos antes de guardar. La base acepta `''`: QC-14 lo dejó escrito y delegó el borde en esta ficha |
| 2026-09-02 | Tiempo de entrega negativo | **Se rechaza en la aplicación.** `delivery_time` se quedó sin `CHECK` en la base a propósito (decisión 4 del leader en QC-14), y aquí se cierra el agujero |
| 2026-09-02 | Largo máximo del nombre | **120 caracteres el producto, 60 la presentación.** Vive **solo en la validación**, no en la columna: sin migración que cambie el tipo |
| 2026-09-02 | Presentaciones duplicadas | **Prohibidas por nombre normalizado**: sin acentos, sin caracteres especiales y sin distinguir mayúsculas. «Bidón 20 L», «bidon 20 l» y «BIDON-20L» son la misma, y la segunda se rechaza |
| 2026-09-02 | ¿Cómo se garantiza esa unicidad? | **Columna normalizada persistida con índice único**, no comparación al vuelo. Sin índice no sería una garantía real, y QC-14 anotó justo esto como *«lo más caro de revertir»*. Es migración de esta ficha |
| 2026-09-02 | ¿Y el nombre del **producto**? | **Sigue sin ser único.** La unicidad aplica **solo** a presentaciones: la decisión 6 de **QC-14** no se deroga ni se matiza |
| 2026-09-02 | Forma de la consulta | **Paginada**, con **10 elementos por página por defecto** |
| 2026-09-02 | El cálculo de la paginación | **Se extrae a un util reutilizable por todo CRUD futuro**, no se resuelve dentro del caso de uso. Vive en `lib/shared/`, que es hoja del grafo y no importa módulos ni `composition` (**QC-15**, `docs/checkpoints-proyecto.md > Modulos hexagonales`) |
| 2026-09-02 | ¿De dónde sale el usuario en sesión? | De **QC-8 — sesión actual**, que pasa a ser **bloqueante** de esta ficha (link escrito en el board el 2026-09-02). El *service* recibe el actor y su rol por parámetro; quien lo resuelve es el adaptador driving |
| 2026-09-02 | Módulo, capas y borde | Módulo **`inventario`**. Mutaciones por **Server Action** en `adapters/driving/`, no Route Handler (`docs/architecture.md > Server Actions vs Route Handlers`). Validación de entrada con **zod** en el borde (`docs/conventions.md`). Identificadores de la DB **en inglés** (**QC-4**) |
| 2026-09-02 | Librería nueva | **Ninguna.** No hay nada aquí que delegar; la paginación es aritmética propia. Regla 7 de `CLAUDE.md` sin propuesta que abrir |
| 2026-09-02 | Orden por defecto del listado | **`name ASC`, con `id ASC` de desempate.** El desempate no es adorno: el nombre del producto **no es único** (decisión 6 de **QC-14**, D14 aquí), así que sin él dos homónimos se intercambian entre páginas y la paginación deja de ser estable — que es justo lo que exige R26 |
| 2026-09-02 | ¿El listado devuelve el nombre del autor? | **No: solo los ids** de `created_by` y `updated_by`. Aquí no se resuelve ningún nombre. Quien lo necesite lo pide al contrato público de `identity` (D8, R8), y eso es alcance de **QC-22**, no de esta ficha |
| 2026-09-02 | Tope superior del tamaño de página | **25.** El defecto sigue siendo **10** (D15). Corrige la posición de 100 que traía el `design.md`: sin tope, una petición con un tamaño enorme es una consulta sin límite |
| 2026-09-02 | Nombre de presentación que al normalizar queda vacío | **Se rechaza** como nombre inválido. Un `«---»` no puede llegar al índice único y anunciarse al usuario como «ya existe» |
| 2026-09-02 | ¿Dónde vive la constante del rol `Administrador`? | **Propia, en `lib/modules/inventario/domain/actor.ts`**, hasta que el contrato público de `identity` la exponga (QC-6 sigue `spec_ready`). Cuando exista, se importa del barrel `@/lib/modules/identity`, nunca por ruta profunda |
