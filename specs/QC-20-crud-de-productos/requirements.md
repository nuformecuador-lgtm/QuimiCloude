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

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna. Las cinco que dejó la acotación se cerraron el mismo día y están abajo (D14–D18).

Las de QC-14 que apuntaban aquí también quedan cerradas: **«quién puede ver y tocar
productos»** (pregunta abierta 4 de `specs/QC-14-modelo-producto/requirements.md`) la cierra
D2, y el **E2E que QC-14 difirió** lo cierra D4. Sigue abierta, y no es de esta ficha, la
trazabilidad por lote y vencimiento (pregunta 2 del dominio en `docs/architecture.md`).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-02 | ¿Se parte la ficha `fullstack`? | **Sí.** QC-20 se queda con el backend; la pantalla sale a **QC-22 — Pantalla de productos**, bloqueada por esta. Se aparta del precedente de QC-15 y QC-13, que no se partieron |
| 2026-09-02 | ¿Quién puede hacer qué? | **Solo Administrador**, y para todo: consultar, crear, editar y borrar, tanto productos como presentaciones. El Operador **ni siquiera consulta**. Se valida en el **service** con su test — una policy de RLS no cuenta como implementado (`docs/architecture.md > Acceso a datos y autorizacion`, `CHECKPOINTS.md > Datos y seguridad`) |
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
| 2026-09-02 | El cálculo de la paginación | **Se extrae a un util reutilizable por todo CRUD futuro**, no se resuelve dentro del caso de uso. Vive en `lib/shared/`, que es hoja del grafo y no importa módulos ni `composition` (**QC-15**, `CHECKPOINTS.md > Modulos hexagonales`) |
| 2026-09-02 | ¿De dónde sale el usuario en sesión? | De **QC-8 — sesión actual**, que pasa a ser **bloqueante** de esta ficha (link escrito en el board el 2026-09-02). El *service* recibe el actor y su rol por parámetro; quien lo resuelve es el adaptador driving |
| 2026-09-02 | Módulo, capas y borde | Módulo **`inventario`**. Mutaciones por **Server Action** en `adapters/driving/`, no Route Handler (`docs/architecture.md > Server Actions vs Route Handlers`). Validación de entrada con **zod** en el borde (`docs/conventions.md`). Identificadores de la DB **en inglés** (**QC-4**) |
| 2026-09-02 | Librería nueva | **Ninguna.** No hay nada aquí que delegar; la paginación es aritmética propia. Regla 7 de `CLAUDE.md` sin propuesta que abrir |
