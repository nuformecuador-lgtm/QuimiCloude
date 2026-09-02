# QC-32 — modelo-unidades · requirements.md

> **Zona:** `backend` · **Complejidad:** `high` · **depends_on:** `QC-24` ·
> **Rama:** `feature/QC-32-modelo-unidades`
>
> **Alcance.** Crear el catálogo de unidades de medida como **módulo hexagonal propio
> `unidades`**: la tabla `Unit` con su nombre único normalizado y su símbolo opcional, su
> contrato público, su seed arrancador, y reapuntar a él la unidad del producto y la de la
> línea de receta, que hoy son texto libre. Migración con su `down.sql` y los tests. Es la
> primera feature de la épica **QC-37 — Catálogos**.
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

_Pendiente: los escribe spec_author (F1.2)._

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
| 2026-09-02 | ¿Cómo nace el catálogo si no hay pantalla? | **Con un conjunto arrancador en el seed** (kg, g, L, mL, unidad), sobre el seed idempotente que ya existe (**QC-6**): solo crea lo que falta y no pisa lo que alguien haya cambiado a mano |
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
