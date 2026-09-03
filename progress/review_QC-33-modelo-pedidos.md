# QC-33 — modelo-pedidos · review

> Rama `feature/QC-33-modelo-pedidos`, HEAD `c4461b6`, PR #26 (base `dev`). Diff revisado:
> `origin/dev...HEAD` (26 archivos, 5711 inserciones, 10 borrados).
> Revisado en el worktree `.worktrees/QC-33-modelo-pedidos`, nunca en el principal.
> El gate completo lo corrió el leader (120/121 archivos verdes, 1336 tests, typecheck y lint
> limpios) y **no se repitió**: aquí solo se corrió lo necesario para morder los hallazgos.
> Todas las mutaciones de este informe se aplicaron y **se revirtieron**; el árbol quedó limpio
> (`git status --porcelain` vacío) y **no se escribió una sola fila en la base**: las dos
> mutaciones de integración vivieron dentro de la transacción revertida del propio test.

## Veredicto

**APROBADO** — 0 mayores, 5 menores.

## Checklist

### Especificación

- [x] `requirements.md` con 42 requisitos EARS numerados R1–R42, 29 decisiones cerradas y 2
      preguntas abiertas (la 2 explícitamente subida a QC-34, la 1 sin efecto sobre el esquema).
- [x] `design.md` con alternativas descartadas y su porqué (§ 8.2 la columna `order_number TEXT`
      única, § 5.3 las tres estrategias de asignación del correlativo con su coste).
- [ ] `tasks.md` con **todas** las tasks marcadas — **T10 sigue sin marcar** (menor 1).

### Trazabilidad (regla 4)

- [x] Los **42** requisitos tienen test concreto y no vacío. Verificado uno a uno contra los
      títulos reales de `tests/unit/pedidos/`, `module-contract.test.ts` y
      `tests/integration/pedidos/pedidos-constraints.int.test.ts`, no contra la bitácora.
- [x] El mapa R -> test está en `progress/impl_QC-33-modelo-pedidos.md` sección 6 y coincide con
      lo que hay en disco.
- [x] **Los tests muerden.** Nueve mutaciones aplicadas a la producción, las nueve rojas:
      1. `migration.sql`: índice único con `WHERE "deleted_at" IS NULL` (R22) -> 2 casos rojos.
      2. `migration.sql`: `EXTRACT(YEAR FROM ("created_at"))` sin `AT TIME ZONE` (R41) -> rojo.
      3. `migration.sql`: `orders_delivered_not_deleted` reescrito a `CHECK (1=1)` (R29) -> 2 rojos.
      4. `migration.sql`: sin `FORCE ROW LEVEL SECURITY` (R37) -> rojo en el test y también en
         `tests/guards/guard-rls-force.test.ts`.
      5. `migration.sql`: `orders_unit_id_fkey` de RESTRICT a CASCADE (R13) -> 2 rojos.
      6. `schema.prisma`: `OrderPriority` reordenado a BAJA, ALTA, MEDIA, CRITICA (R16/R35) ->
         rojo en `pedidos-schema` y en `module-contract`.
      7. `schema.prisma`: columna `total` mas `model OrderLine` (R2/R10) -> 4 rojos.
      8. `lib/modules/pedidos/domain/order-number.ts`: `padStart(4)` (R24) -> los 4 casos rojos.
      9. `lib/modules/pedidos/adapters/driven/tmp-mut.ts` con `prisma.order.findMany()` (R31) ->
         3 rojos en `module-contract`.

### Los cinco tests ajenos acotados, comparados uno a uno contra `origin/dev`

- [x] **9 borrados en total, y son exactamente las cuatro líneas de alcance global**
      (`expect(schema).not.toMatch(/enum/)` en identity x2, inventario x1, recetas x1) más las
      5 líneas de la consulta reescrita en `recetas-constraints`. Todo lo demás es suma.
- [x] **Ningún `toEqual` degradado a `toContain`.** `recetas-constraints.int.test.ts:907` conserva
      `expect(unitTypes).toEqual([])` sobre la lista filtrada; `unidades-constraints.int.test.ts:773`
      conserva `expect(foreignKeys).toEqual([...])` con la lista **exacta**, ahora de tres, con
      `orders_unit_id_fkey` sumada la primera (`ORDER BY conname`) y con `confdeltype: 'r'` y
      `confupdtype: 'c'`, que es lo que R13 de QC-32 exige de cualquier referencia al catálogo.
- [x] Cada criterio nuevo **sigue muriendo** si alguien convirtiera el conjunto cerrado de ese
      módulo en un enum. Mordido de verdad, no leído:
      - `enum DocumentType { CC }` en `db/schema.prisma` -> `identity-schema.test.ts`, 2 rojos.
      - `enum Clasificacion { KILOGRAMO }` (nombre inocente, etiqueta del catálogo) ->
        `inventario-schema.test.ts` y `recetas-schema.test.ts`, rojos los dos.
      - `enum UnitCode { ALGO }` (nombre delator, etiqueta inocente) -> los mismos dos rojos.
      - `CREATE TYPE "Clasificacion" AS ENUM ('kilogramo')` ejecutado **dentro de la transacción
        revertida** de `recetas-constraints.int.test.ts` -> rojo, detectado por etiqueta:
        `expected [ { typname: 'Clasificacion', ... } ] to deeply equal []`.
      - `CREATE TABLE tmp_qc33 (... unit_id uuid REFERENCES units(id))` dentro de la transacción
        revertida de `unidades-constraints.int.test.ts` -> rojo, `"conname": "tmp_qc33_unit_id_fkey"`.
- [x] `recetas-constraints` **no** lleva lista negra de `OrderStatus`/`OrderPriority`: filtra por
      sujeto propio (nombre con pinta de unidad, o etiqueta que coincida con un nombre o símbolo
      leído de `tx.unit.findMany`) y añade `expect(unitWords.size).toBeGreaterThan(0)` para que el
      filtro no pueda quedarse sin sujeto. Los dos unitarios leen las palabras de los
      `INSERT INTO "units"` de las migraciones y **lanzan** si no encuentran ninguna.

### R41, el CHECK del año en UTC

- [x] El constraint es `CHECK ("order_year" = EXTRACT(YEAR FROM ("created_at" AT TIME ZONE 'UTC'))::int)`
      (`db/migrations/20260903191204_orders/migration.sql:163-164`), con la forma de dos argumentos
      —`timezone(text, timestamptz)`, IMMUTABLE— y el porqué escrito al lado.
- [x] **El caso de frontera muerde de verdad, y no es el feliz.**
      `tests/integration/pedidos/pedidos-constraints.int.test.ts:944` inserta
      `created_at = '2026-12-31T20:00:00-05:00'` con `order_year = 2026` y exige `23514`
      (`expect(conElAnoLocal).toBe(CHECK_VIOLATION)`); después inserta el mismo instante con
      `order_year = 2027`, lo relee y comprueba `orderYear === 2027` y
      `createdAt.toISOString() === '2027-01-01T01:00:00.000Z'`. Corrido contra Postgres real: verde.
      La aserción es inherentemente mordiente: sin el CHECK el INSERT pasaría y
      `expectRejectedByDatabase` lanzaría «se esperaba que la base rechazara la operación».
- [x] El estático lo respalda: `pedidos-migration.test.ts:449` compara el texto exacto y cae al
      quitar el `AT TIME ZONE 'UTC'` (mutación 2, verificada).

### Ningún año literal que caduque el 1 de enero

- [x] `pedidos-constraints.int.test.ts` calcula el año con `new Date().getUTCFullYear()`
      (`currentUtcYear()`, línea 175) en todos los casos que dejan `created_at` por defecto.
- [x] Los **dos únicos** casos con años literales —el reinicio anual (línea 873) y la frontera de
      R41 (línea 944)— fijan **también `created_at` explícitamente**, así que el par
      (`order_year`, `created_at`) es consistente para siempre y el CHECK no puede ponerse rojo con
      el cambio de año. Los literales de los **títulos** de otros casos son cosméticos: el cuerpo
      usa el helper. **No hay ningún año escrito a mano que caduque.**

### El correlativo

- [x] `CREATE UNIQUE INDEX "orders_order_year_order_sequence_key" ON "orders"("order_year", "order_sequence");`
      **sin WHERE**: total, al revés que `recipes_name_unique` de QC-24 (R22). Confirmado también
      contra la base real (`impl` sección 3, índice sin predicado) y por el caso de integración
      «tras borrar lógicamente el pedido (año, 1), un segundo (año, 1) sigue fallando con 23505»,
      que solo puede pasar si el índice es total.
- [x] R42 se prueba **en positivo**: (año, 1) y (año, 5) se aceptan, se releen los dos, y se
      comprueba además que la posición 3 sigue con `count === 0`: nadie rellena el hueco.
- [x] El spec es honesto: `design.md` 5.3 dice explícitamente que **quién calcula la siguiente
      posición no cabe aquí y se sube a QC-34**, con las tres estrategias y su coste; la pregunta
      abierta 2 de `requirements.md` sigue abierta y el parte no la finge cerrada.

### Las demás decisiones con forma verificable

- [x] `orders_delivered_not_deleted CHECK ("deleted_at" IS NULL OR "status" <> 'ENTREGADO')`,
      literal como lo fijó el humano, probado en los dos sentidos (borrar un ENTREGADO y entregar
      uno ya borrado, ambos 23514) y con R30 en positivo (borrar PENDIENTE y EN_CURSO pasa).
- [x] `orders_quantity_positive CHECK ("quantity" > 0)` y `orders_unit_price_non_negative
      CHECK ("unit_price" >= 0)`, con el cero aceptado como precio y rechazado como cantidad. La
      diferencia entre `>` y `>=` está probada en los dos casos.
- [x] Las **cuatro** FK reales con ON DELETE RESTRICT ON UPDATE CASCADE (receta, unidad y los dos
      autores), escritas a mano porque las columnas son escalares **sin `@relation`** (R33). El
      barrido de `prisma.recipe`, `prisma.unit`, `prisma.user` y `prisma.order` es una función pura
      aplicada dos veces y la entrada sintética sale señalada: la lista vacía no lo es por vacuidad.
- [x] Borrado lógico con `created_at`, `updated_at` y `deleted_at`; `updated_at` sin DEFAULT, igual
      que las siete tablas anteriores del repo (convención, no olvido: comprobado en las migraciones).
- [x] Auditoría anulable: `created_by`/`updated_by` NULL aceptados, autor inexistente 23503.
- [x] ENABLE **y** FORCE ROW LEVEL SECURITY sobre `orders` (R37), confirmado en la base real
      (`relrowsecurity` y `relforcerowsecurity` en true) y vigilado por `guard-rls-force`.
- [x] Identificadores en inglés, valores de los dos enum en castellano por decisión del humano; el
      test de idioma cae ante un identificador con acento (caso propio en `pedidos-migration`).
- [x] `down.sql` borra la tabla y **los dos tipos**, en ese orden, sin tocar `pgcrypto` ni ninguna
      tabla ajena; ciclo UP -> DOWN -> UP ejecutado contra Postgres real (`impl` sección 3), con
      `pg_type` vacío tras el DOWN y `_prisma_migrations` coherente.

### Dependencias (regla 7)

- [x] **Ninguna dependencia nueva.** `package.json` y `pnpm-lock.yaml` **no aparecen** en
      `git diff --stat origin/dev...HEAD`. Tampoco hay utilidad escrita a mano que duplique una
      librería del stack: lo único nuevo es un `padStart` de una línea.

### Multiplataforma

- N/A, verificado: el diff no toca `app/`, `components/` ni ningún `.tsx`. La feature es esquema,
  migración y armazón de módulo (R39, decisión 25: E2E diferido con motivo).

### Módulos hexagonales

- [x] `lib/modules/pedidos/` con `domain/`, `ports/` y `adapters/{driven,driving}` y nada más; las
      tres últimas nacen vacías con `.gitkeep`, y el test lo exige.
- [x] El barrel solo reexporta de `./domain`; su cierre transitivo no alcanza `'use server'`,
      `@prisma/client`, `next/*`, `react`, `@/lib/shared` ni `@/lib/composition`.
- [x] `pedidos` conoce receta y unidad **solo por el barrel**, con `import type`, y sin ninguna ruta
      profunda a `recetas`, `unidades`, `identity` ni `inventario`.
- [x] `Order` lleva `/// @module pedidos`.

### RecipeId en el contrato de `recetas`

- [x] **Aditivo y nada más.** `lib/modules/recetas/index.ts` gana **una** línea
      (`export type { RecipeId } from './domain/recipe-catalog';`) y
      `lib/modules/recetas/domain/recipe-catalog.ts` nace con 5 líneas. El diff contra `origin/dev`
      —que ya trae QC-25, crud-de-recetas— no borra ni reordena ningún export del contrato, y
      `Recipe` no se toca en `db/schema.prisma` (R5, con su test: «Recipe queda exactamente como la
      dejó QC-24»).

### Verificación ejecutable

- [x] Corrido por el reviewer en el worktree: `tests/unit/pedidos` más `tests/integration/pedidos`
      más los cinco acotados -> **10 archivos, 182 tests, todos verdes**. Los 27 casos de
      integración corren contra Postgres real (comprobado con `--reporter=verbose`, no asumido).
- [x] El único rojo del gate es ajeno y está decidido por el humano
      (`tests/integration/identity/identity-seed.int.test.ts`, 8 casos, fila residual `FeldesQuack`
      en `products` bloqueando `DELETE FROM users` con 23503 contra `products_created_by_fkey`).
      **No se reabrió, no se tocó, no se enmascaró.** Declarado en el PR y en `impl` sección 9.
- [x] Sin secretos, sin contexto hardcodeado, sin webhooks nuevos.

## Hallazgos

### Mayores (bloqueantes)

**Ninguno.**

### Menores

**menor 1 — `specs/QC-33-modelo-pedidos/tasks.md:222`: T10 sigue sin marcar.**
`### [ ] T10. Sincronizar con dev y correr el gate completo` es la única casilla sin marcar de las
doce, y `CHECKPOINTS.md > Especificación` exige que **todas** estén marcadas para pasar a `done`. El
trabajo **sí se hizo**: el merge con `dev` está en `8b0e543` y el gate completo lo corrió el leader,
con resultado en `impl` sección 8 y en el cuerpo del PR. Es el tilde, no la tarea. No bloquea el
merge; sí hay que marcarla antes de mover la ficha a `done`.

**menor 2 — `specs/QC-33-modelo-pedidos/tasks.md`, «Hecho cuando» de T9: lista R10 donde parece
querer decir R8.** El implementer lo detectó, no lo corrigió por su cuenta (bien: regla 6) y lo dejó
a criterio del reviewer. Criterio: **el texto de T9 es lo que está mal, no el código.** Los dos
requisitos quedaron cubiertos —R8 con «guarda y relee un precio unitario con cuatro decimales sin
pérdida», R10 con el caso extra que lee las 14 columnas de `information_schema.columns`— y **ese
caso extra se queda**: cierra R10 y R3 también contra la base, que es más de lo que pedía la tabla.
Lo que sobra es la errata.

**menor 3 — `tests/unit/pedidos/module-contract.test.ts:290`: el cierre transitivo del barrel se
detiene en la frontera de módulo.** `reachableFrom(barrel)` sigue solo imports relativos dentro de
`pedidos`, así que las prohibiciones de `'use server'`, `@prisma/client` y `next/*` no se evalúan
sobre el barrel de `recetas` que `order-contents.ts` importa. Hoy no hay agujero real: la
importación es `import type`, se borra al compilar, y el propio test la ancla con un regex
`import type { ... RecipeId ... }`. Pero si mañana alguien la convierte en importación de valor, la
red que la caza es ese regex y no el cierre transitivo, que seguiría sin mirar al otro lado de la
frontera. Merece endurecerse cuando QC-34 llene `ports/` y `adapters/`.

**menor 4 — `tests/integration/recetas/recetas-constraints.int.test.ts:900-906`: el filtro por
etiqueta usa símbolos de unidad de una y dos letras.** Las palabras salen de `tx.unit.findMany`, que
hoy incluye los símbolos `ml`, `l`, `gr`, `kg`. Un enum futuro perfectamente legítimo cuyo valor sea
`L` o `GR` daría un rojo que no es el que el caso quiere cazar. Es un falso positivo potencial, no
un falso verde —el error va del lado seguro— y por eso es menor. Si aparece, la respuesta es filtrar
solo por `name` y dejar los símbolos fuera, nunca aflojar el `toEqual([])`.

**menor 5 — el rojo ajeno de `identity-seed` no está anotado como deuda en disco.** Está declarado
en el PR y diagnosticado en `impl` sección 9, pero `CHECKPOINTS.md > Verificación final` pide que lo
que queda abierto viva en `progress/current.md > Deudas y cosas abiertas` y no en silencio. Cuando
el PR se cierre, el diagnóstico queda enterrado en un parte de feature. Conviene una línea en
`current.md` que muera sola el día que la fila `FeldesQuack` desaparezca. **No se reabre la decisión
del humano** —no borrar la fila, no arreglar el helper, no meterlo al baseline—: solo dónde queda
anotada.

## Conclusión

La feature cumple los 42 requisitos con tests que muerden, respeta las 29 decisiones cerradas sin
excepción, no añade dependencias, no toca UI y deja las dos preguntas abiertas donde tienen que
estar. Lo más sensible —los cinco tests ajenos— se acotó **al sujeto y no a la baja**: se comprobó,
mutación por mutación, que cada uno sigue muriendo ante el enum que vigilaba, y que la lista exacta
de FK hacia `units` sigue siendo exacta. Los cinco menores son de higiene y ninguno afecta al
comportamiento del código.

**Veredicto: APROBADO.**
