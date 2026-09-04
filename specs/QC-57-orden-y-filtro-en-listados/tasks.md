# QC-57 — orden-y-filtro-en-listados · tasks.md

> Checklist del implementer. Cada task tiene **criterio de hecho** verificable y sus dependencias.
> `[P]` = puede ir en paralelo con las demás `[P]` de su mismo grupo.
>
> **Un commit por task** (`docs/conventions.md > Commits`). `./init.sh --rapido` al cerrar cada
> grupo; **`./init.sh` completo antes del PR, sin excepción** (regla 5 de `CLAUDE.md`).

## Grupo 0 — Precondición heredada

- [x] **T0. Verificar el punto de partida antes de escribir una línea.** No se da nada por hecho
      (regla 6).
      **Hecho cuando** las cinco comprobaciones están anotadas en `progress/impl_QC-57-*.md`:
      1. el worktree está en `feature/QC-57-orden-y-filtro-en-listados` con `dev` mergeado;
      2. **`./init.sh` termina en verde** sobre ese punto de partida — si algo está rojo **antes**
         de tocar nada, se para y se avisa al leader, no se arregla de paso;
      3. **QC-44 está cerrada** (fila 14: PR #35, *Finalizado*): `lib/modules/proveedores` y
         `app/(private)/proveedores/**` no tienen cambios sin mergear que colisionen;
      4. **QC-55 está `done`** y `components/shared/data-table/data-table-types.ts` existe con la
         forma de `specs/QC-55-.../design.md > 3.1` — es el contrato con el que §3.1 tiene que
         casar; si la forma real difiere del spec, **se para**;
      5. las siete listas de `design.md > 1` existen en las rutas ahí escritas.

- [x] **T0.1. Confirmar la decisión de `pg_trgm`** (`design.md > 4.3`, pregunta abierta 3).
      **Bloquea T4.** No se instala ni se habilita nada por cuenta propia (regla 7).
      **Hecho cuando** en `progress/impl_QC-57-*.md` consta la vía elegida (**A** con extensión y
      búsqueda por subcadena, o **B** sin extensión y búsqueda por prefijo) y quién la aprobó.

## Grupo 1 — El contrato en el dominio (depende de T0)

- [x] **T1. Escribir `list-query.ts` en `inventario`**: tipos `ListSort`/`ListFilterValue`/
      `ListQuery`, fábrica del esquema zod a partir de una lista blanca, y `sanitize` puro que
      devuelve `{ query, ignored }`.
      **Hecho cuando** hay tests unitarios que cubren R1, R3, R5, R7, R8, R9, R12 y R20, y el
      archivo **no importa** `lib/shared/**`, `@prisma/client` ni `next/*`.

- [x] **T2. Replicar `list-query.ts` en `recetas`, `proveedores`, `unidades` y `pedidos`.**
      Copia literal del de T1 (`design.md > 2.1`): la duplicación es la decisión, no un descuido.
      **Hecho cuando** los cinco archivos son idénticos salvo el nombre del módulo en los
      comentarios.
      Depende de T1.

- [x] **T3. Guardia de equivalencia `tests/guards/guard-contrato-listados.test.ts`** (R32).
      **Hecho cuando** somete a los cinco esquemas la misma batería canónica —entrada válida,
      campo no declarado, forma de filtro equivocada, `deletedAt`, `sort` con lista, quinto `kind`,
      búsqueda de solo espacios— y exige el mismo veredicto y la misma salida saneada; y cuando
      **falla** al introducir a mano una divergencia en uno de los cinco (comprobado y revertido).
      Depende de T2.

- [x] **T3.1. Listas blancas por listado** (`design.md > 5`), un archivo por lista.
      **Hecho cuando** las siete están declaradas, ninguna incluye `deletedAt` ni `nameNormalized`,
      y hay un test que lo afirma **sobre las siete a la vez** (R4, R7) — recorriendo las listas,
      no repitiendo siete asertos que alguien puede olvidar ampliar.
      Depende de T1.

## Grupo 2 — Base de datos (depende de T0; T4 depende además de T0.1)

- [x] **T4. Migración `<ts>_list_query_indexes`.** Columna `products.name_normalized`, backfill,
      `NOT NULL`, índices de búsqueda (vía elegida en T0.1) e índices de orden y filtro,
      **parciales** donde hay borrado lógico (`design.md > 10`).
      **Hecho cuando**: `migration.sql` **revisado a mano línea a línea** y sin ningún
      `DROP CONSTRAINT` sobre las FK/CHECK/RLS escritos a mano (`design.md > 10.3`); existe
      `down.sql` que revierte exactamente el UP y **no** hace `DROP EXTENSION`; `pnpm run db:migrate`
      aplica y `pnpm run db:rollback` revierte dejando `_prisma_migrations` coherente (R21, R22).

- [x] **T5. `normalizeProductName` + escritura de `name_normalized` en producto.**
      Gemela de las otras cuatro; se escribe en **toda** alta y edición de producto.
      **Hecho cuando** hay test unitario de la función (mismos casos que `unit-name.test.ts`) y
      test de integración que crea y edita un producto y comprueba la columna (R19, R23).
      Depende de T4.

- [x] **T6. Test de esquema/migración** en `tests/unit/inventario/schema/`.
      **Hecho cuando** afirma que la columna y cada índice nuevo existen con su nombre, que los
      parciales llevan su `WHERE deleted_at IS NULL`, y que el backfill deja la columna igual a lo
      que devuelve `normalizeProductName` para los nombres ya cargados (R21, R23).
      Depende de T4.

## Grupo 3 — Casos de uso (depende del Grupo 1)

- [x] **T7. Puerto `ListQueryLog` en los cinco módulos + implementación única en
      `lib/shared/observability/list-query-log.ts` + cableado en `lib/composition/index.ts`.**
      **Hecho cuando** el log **nunca** recibe el texto buscado ni el valor del filtro, solo el
      listado y los nombres de campo, y hay un test que lo afirma (R6, anti-patrón de PII).

- [x] **T8. [P] `list-products`**: sustituir `productQuerySchema` por el contrato, sanear, loguear
      y delegar (R24, R30, R33).
- [x] **T9. [P] `list-presentations`** con el contrato.
- [x] **T10. [P] `list-recipes`** con el contrato, conservando la inyección de
      `toOffsetLimit`/`buildPage` que ya tiene.
- [x] **T11. [P] `list-suppliers`** y **el listado del catálogo de proveedor**
      (`listBySupplierAlive`), conservando las dos condiciones de vida del `where` (R7).
- [x] **T12. [P] `list-units`** con **página opcional** (`design.md > 7`).
      **Hecho cuando** un test demuestra que **sin parámetros devuelve el catálogo entero** y otro
      que con `page` devuelve `Page<UnitRef>` (R27, R28), y el **selector de unidad** del
      formulario de recetas sigue verde sin tocarlo.
- [x] **T13. [P] `list-orders`**: `status` y `priority` dejan de ser parámetros propios y pasan a
      filtros `select` (R25).

  T8–T13 comparten criterio de hecho: cada uno con su test de **autorización** (falla sin tocar el
  repositorio, con consulta válida **y** con consulta con campos no declarados, R34) y su test de
  **campo no declarado** (200 + orden por defecto + log, `design.md > 12`).
  Dependen de T3.1 y T7.

## Grupo 4 — Adaptadores driven (depende del Grupo 3 y de T4)

- [x] **T14. [P] `product-prisma.ts`**: `orderBy` dinámico con desempate por `id`, `where` con los
      cuatro tipos de filtro, búsqueda contra `name_normalized`; **el mismo `where` para el
      `findMany` y para el `count`** (R10, R13, R14, R15, R16, R18).
- [x] **T15. [P] `presentation-prisma.ts`**, **T16. [P] `recipe-prisma.ts`**,
      **T17. [P] `supplier-prisma.ts`**, **T18. [P] `supplier-catalog-line-prisma.ts`**,
      **T19. [P] `unit-prisma.ts`**, **T20. [P] `order-prisma.ts`** (sin búsqueda, R17; `orderNumber`
      traducido al par año+correlativo; `Decimal` en los rangos numéricos).

  Criterio de hecho común: test de integración que demuestra que el filtro y el orden se aplican
  **sobre el conjunto completo** —con más filas que una página, comprobando que la fila que
  corresponde aparece en la página 1 aunque en el orden de hoy estuviera en la 3 (R13)— y que
  `total` describe el conjunto filtrado (R14). Sin orden explícito, el orden es el de hoy (R11).

## Grupo 5 — Llamantes y cierre

- [x] **T21. Adaptar el selector de ingredientes** del formulario de recetas a la forma nueva
      (R24). **Hecho cuando** sus tests actuales pasan **sin relajar ningún aserto de
      comportamiento**; si alguno hay que tocar, se anota qué y por qué en
      `progress/impl_QC-57-*.md`.
      Depende de T14.

- [x] **T22. Adaptar los llamantes del listado de pedidos** a los filtros `select` (R25).
      Mismo criterio de hecho que T21. Depende de T20.

- [ ] **T23. Comprobar que la suite heredada sigue verde** (R26).
      **Hecho cuando** `./init.sh` completo termina en verde y `progress/impl_QC-57-*.md` deja
      escrito el mapa **`R1..R35 -> test`** (`CHECKPOINTS.md > Trazabilidad`), incluida la fila de
      **R35** («sin E2E», con el motivo y el precedente QC-20/QC-25/QC-34).
      Depende de todo lo anterior.

## Lo que esta ficha NO hace

Ninguna pantalla consume esto todavía: QC-56 (productos y recetas), QC-35 (pedidos), QC-39
(unidades) y QC-45 (presentaciones). Si al terminar alguna lista se quedara sin llamante que le
pase el contrato, **es lo esperado**, no una task olvidada.
