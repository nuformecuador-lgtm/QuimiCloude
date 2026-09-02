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

_Pendiente: los escribe spec_author (F1.2)._

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
| 2026-09-02 | Permisos | **Aquí no se deciden**: no hay service en esta ficha. Los fija **QC-25**, que ya dice «solo el Administrador», y allí van con su test (`CHECKPOINTS.md > Permisos`) |
| 2026-09-02 | Librería nueva | **Ninguna.** Es esquema Prisma, migración y el armazón del módulo. La única librería del área —el cliente de Supabase para subir la imagen— es de **QC-25** y entra por la regla 7 allí |
