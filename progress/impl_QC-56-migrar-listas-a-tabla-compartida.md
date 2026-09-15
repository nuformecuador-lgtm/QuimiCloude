# QC-56 — migrar-listas-a-tabla-compartida · bitacora de implementacion

> Implementer · F2.1 · worktree `.worktrees/QC-56-migrar-listas-a-tabla-compartida`, rama
> `feature/QC-56-migrar-listas-a-tabla-compartida` (base `2415e55`). Spec aprobado el 2026-09-15.
> Esta bitacora se va completando por tandas; el gate (`./init.sh --rapido` / completo) lo corre el leader.

## Estado por tarea

| Task | Estado | Notas |
|---|---|---|
| T0 | hecha (venia del spec) | |
| T1, T2, T3, T4, T5, T14 | **hechas** (tanda 1, commit `e866e00`) | ver «Tanda 1» |
| T6, T7 | **hechas** (tanda 2, commit `72bd494`) | ver «Tandas 2 y 3» |
| T8, T9 | **hechas** (tanda 3, commit `5d9116e`) | ver «Tandas 2 y 3» |
| T10 | **hecha** (commits `4405db7`, `fa97e52`) | `fa97e52` anade la coherencia columnas↔`RECIPE_QUERYABLE` (R7/R11) |
| T11 | **hecha** (commit `4a5a31b`) | |
| T12 | **hecha** (commits `e7d78b0`, `4393e77`) | `4393e77` anade la coherencia columnas↔`SUPPLIER_QUERYABLE` (R7/R11) |
| T13 | **hecha** (commits `58807a9` puntos 1-2, `b0052b4` punto 3) | |
| T15, T16 | **hechas** (commit `b0052b4`) | R6 de recetas: rojo heredado de QC-93 |
| — | casos R30 y R28 (commit `a580de0`) | cierre de trazabilidad detectado en T18 |
| T17 | **hecha** (commit de cierre) | R26 verde en los dos motores; R51 rojo heredado de QC-80; R52 rojo heredado de QC-93 |
| T18 | **hecha** (commit de cierre) | secciones «T18 — Mapa» y «Desviaciones consolidadas» |

## Bloqueo de la base (2026-09-15)

**Pasos hechos, con su codigo de salida real:**

1. `pnpm install --frozen-lockfile` → exit 0; `pnpm-lock.yaml` y `package.json` sin cambios.
2. `pnpm exec prisma generate` → exit 0.
3. `pnpm exec next typegen` → exit 0.
4. Nombre `QuimiCloude_QC56` comprobado libre contra `pg_database`. En el `.env` del worktree
   (git-ignorado) se cambio **solo** el nombre de base de `DATABASE_URL` y `DIRECT_URL`.
5. `pnpm exec prisma migrate deploy` → exit 1 en `20260911130000_inventory_company_scope` con el
   error esperado de QC-49 («hay 0 empresa(s) en la tabla»).
6. `pnpm run db:seed` → **exit 1, fallo DISTINTO al previsto**:

```
Invalid `db.user.create()` invocation in
lib/modules/identity/adapters/driven/persistence/initial-access-repository-prisma.ts:127:39
The column `existe` does not exist in the current database.
```

**Diagnostico.** `existe` es Prisma leyendo mal el mensaje de Postgres en castellano. El cliente
generado ya incluye `users.sessions_valid_from`, que anade
`db/migrations/20260912103000_session_revocation/migration.sql:28`, una migracion **posterior** a
QC-49 (tambien lo es `20260911155021_credential_setup_tokens`). Como `migrate deploy` se detiene en
QC-49, esa columna no existe y el seed no puede crear el usuario inicial. La receta
«migrar → seed → `migrate resolve --rolled-back` → migrar» (`progress/current.md`) ya no funciona
sobre base vacia en esta rama. No se encontro otra receta en `scripts/`.

**Estado en que quedo la base (comprobado tras el fallo):**
- `QuimiCloude_QC56` existe, con migraciones aplicadas hasta `20260911120000_presentation_unit`.
- `20260911130000_inventory_company_scope` queda **fallida** (sin terminar, sin `rolled_back`): no
  se llego a ejecutar `resolve`.
- `companies`, `users` y `roles` con 0 filas (el seed no dejo nada a medias).

**Decision del leader (2026-09-15):** no se toca esa base ni el `.env`; el leader investiga como
montarla. T15–T17 quedan pendientes hasta entonces.

## Tandas 2 y 3 — commits `72bd494` (tablas) y `5d9116e` (seccion, esqueleto, pagina, barrel)

F = `app/(private)/produccion/formulas`, S = `app/(private)/proveedores`.

| Task | Archivos |
|---|---|
| T6 | M `F/components/recipe-table.tsx` |
| T7 | M `S/components/supplier-table.tsx` |
| T8 | M `F/components/recipe-list-section.tsx`, `recipe-table-skeleton.tsx`, `index.ts`, `F/page.tsx`; D `F/components/recipe-list-toolbar.tsx` |
| T9 | M `S/components/supplier-list-section.tsx`, `supplier-table-skeleton.tsx`, `index.ts`, `S/page.tsx`; D `S/components/supplier-list-toolbar.tsx` |

Sin tocar: `recipe-list-empty.tsx`, `supplier-list-empty.tsx` (su `firstPageHref` ya llega con el
href del parser), `recipe-list-error.tsx`, `supplier-list-error.tsx`, `F/nueva/**`, `F/[id]/**`,
`S/[id]/**`, catalogo, `components/shared/data-table/**`.

**Comprobaciones pedidas por tasks.md:**
- `totalPages >= 1` con cero filas en las dos listas: recetas pasa por `buildPage` real
  (`lib/composition/index.ts:702`), proveedores por `buildPage` en
  `lib/modules/proveedores/adapters/driven/persistence/supplier-prisma.ts:360`; `lib/shared/pagination.ts:62`
  devuelve 1 con `total === 0`. **No se acota en la tabla.**
- `TABLE_ID`: `'recetas'` y `'proveedores'` unicos; los otros siete valen `inventario`,
  `presentaciones`, `unidades`, `proveedor-catalogo`, `pedidos`, `usuarios`, `grupos-de-trabajo`.
- Ninguna de las dos tablas importa `components/ui/table` (solo los esqueletos, como productos).
- **H6 se sostiene en el codigo**: con `status="idle"` y cero filas, `data-table.tsx:240-262, 325-332`
  mantiene `DataTableFilters` y la paginacion en la misma posicion y `DataTableEmpty` pinta
  `texts.empty` y `emptyAction`. Sin contradiccion con el spec.

**Verificacion de los subagentes:**
- `pnpm typecheck` → exit 2 con **0 errores en `app/`**; quedan 6, todos en tests de T10/T12
  (`recipe-page.test.tsx:21,338,360`, `supplier-page.test.tsx:17,366,385`: `RECIPE_COLUMNS` /
  `SUPPLIER_COLUMNS` ya no existen).
- `pnpm exec eslint` sobre los 10 archivos → exit 0.
- `vitest run` `recipe-list-params.test.ts` 37/37; `supplier-list-params.test.ts` +
  `guard-convenciones-proveedores.test.ts` 45/45 (los tests de parser de la tanda 1 ya verdes sin tocarlos).
- `vitest related` recetas: 9 archivos, 173 pasan, 10 fallan (todos en `recipe-page.test.tsx`, T10).
  `recipe-route-contract.test.ts` (no lo selecciona `related`, lee fuentes con `fs`): 22 pasan, 3
  fallan (ENOENT `recipe-columns.ts` x2; `recipe.imageUrl` esperado en `recipe-table.tsx`), T11.
- `vitest related` proveedores: `supplier-list-params` 38/38, `navegacion/pantallas-exigen-permiso` 34/34,
  `supplier-page.test.tsx` 24/36 (12 rojos de testIds viejos y del negativo de QC-44 R11, T12).
  Los dos `supplier-route-contract.test.ts`: 18/18 verdes.

**Desviaciones / decisiones a revisar:**
1. `F/page.tsx` y `S/page.tsx` tipan `searchParams` en local (los tipos `*ListSearchParams` salieron del barrel).
2. «Limpiar» y «volver a la primera» de «sin resultados» son `next/link` reales; con clic normal
   navegan en la misma `startTransition` (proveedores via `onNavigate`, Next >= 15.3), con
   Ctrl/Cmd/Mayus abren pestana.
3. Los barrels exportan algo mas que la lista de design 4.3: recetas `IMAGE_COLUMN_LABEL`,
   `ACTIONS_COLUMN_ID`, `EMPTY_CELL`, `RecipeColumnsDeps`; proveedores `ACTIONS_COLUMN_ID`,
   `ACTIONS_COLUMN_LABEL`, `EMPTY_CELL`, `SupplierColumnId`, `SupplierColumn`, `SupplierColumnsDeps`.
   Los rotulos de «limpiar»/«primera pagina» de proveedores son constantes locales no exportadas.
4. Comentarios de `F/page.tsx`, `F/components/index.ts` y los reescritos de proveedores dejan de citar
   `R<n>`/`QC-*`/`design.md` (quedan mezclados en el commit de la tanda, no en un `chore` aparte).
5. En proveedores no hay boton de alta junto a la tabla con filas (no lo habia); se conservan los
   dos `SupplierSheet` (cabecera y vacio).

## Tanda 4 — commits `4a5a31b` (T11), `58807a9` (T13 parcial), `4405db7` (T10)

**T11** — M `tests/unit/recetas-ui/recipe-route-contract.test.ts`. 26/26 (antes 3 rojos de 25).
- `ARCHIVOS_DE_LA_LISTA` sin toolbar ni `recipe-columns.ts`, con `recipe-columns.tsx` y `recipe-columns-skeleton.ts`.
- R2/R3 leen `recipe-columns.tsx`: no contiene `.description` ni `id: 'description'`. **Matiz**: el
  literal `'description'` si aparece, en el `Exclude` que lo prohibe; el test afirma que esta ahi
  (mismo criterio que la autoria).
- El negativo de QC-26 R14 se sustituye por dos casos: **R10** (ningun `.sort(`, `.toSorted(`,
  `.reverse(`, `.filter(`, `.slice(`, `.splice(`... en seccion/tabla/columnas/esqueletos; filas
  pasadas tal cual; `orderBy` sigue prohibido; se permite por nombre solo `.toISOString().slice(`
  del formateo de fecha) y **R11** (el parser importa `RECIPE_QUERYABLE` del barrel y no tiene copia
  a mano de los campos).
- R5 lee `recipe-columns.tsx`. `CARPETAS_LEGITIMAS` y `exportadas` no cierran listas afectadas: sin cambios.
- **Prueba de mordida**: `rows={recipes.filter(...)}` en `recipe-table.tsx` → 1 rojo (solo R10);
  restaurado con `cp`, `git status` limpio.
- eslint exit 0.

**T13 (parcial)** — M `tests/unit/shared/data-table-alcance.test.ts`. 15/15.
- `FORMULAS_ROUTE` como septima carpeta autorizada (comentario fechado); «seis»→«siete»;
  `toBeGreaterThan(6)`; el caso de recetas se invierte (SI consume). Una pantalla no declarada sigue en rojo (R29).
- **Caso nuevo R20** (l.433-500): archivos de `origin/dev...HEAD` + `git status --porcelain` no tocan
  `components/shared/data-table/**`; si el rango no resuelve lanza error; precondicion de rama: el
  diff trae `formulas/page.tsx` y `specs/QC-56-.../`, si no queda `skipped` con motivo.
  `origin/dev` = `a271eec` (la `dev` local, `a80a674`, esta atrasada).
- **Mordida R20**: comentario sin commitear en `components/shared/data-table/index.ts` → rojo;
  restaurado con `cp`; `git status` y `git diff origin/dev...HEAD` del componente vacios.
- **Pendiente**: la lista cerrada de E2E (l.404) usa `toEqual`, obliga en los dos sentidos; hoy
  `e2e/recetas.spec.ts` y `e2e/recetas-pasos.spec.ts` no referencian `data-table`, anadirlos la
  pondria en rojo. Se completa con T15/T16.

**T10** — M `tests/unit/recetas-ui/recipe-page.test.tsx`. **44/44 en dos corridas** (~14,5 s), sin
avisos de `act`/`key`. eslint exit 0; los dos `@ts-expect-error` (`'description'`, `'createdBy'`
como `RecipeColumnId`) se consumen (sin TS2578).
- Notas: (1) «boton y `aria-sort` solo en ordenables» se interpreta como boton de orden distinto del
  disparador de menu `data-table-header-menu-<id>` (imagen y pasos lo tienen porque se pueden fijar).
  (2) Para ver `aria-busy="true"` con `router.push` simulado, el test monta un doble
  `NavegacionPendiente` en `<Suspense>` que mantiene la transicion suspendida hasta soltarla; no toca
  produccion. (3) Comentarios del archivo limpiados en el mismo cambio.
- **Hueco detectado por el implementer**: el caso que recorre columnas contra `RECIPE_QUERYABLE`
  (design 4.1, R7/R11) no estaba; `recipe-columns.tsx` escribe los flags a mano. Encargado como
  complemento: commit `fa97e52`, 45/45; mordida (quitar `sortable` de `updatedAt`) → rojo, restaurado con `cp`.

**T12** — M `tests/unit/proveedores-ui/supplier-page.test.tsx`. Commit `e7d78b0`.
`supplier-page` + `guard-convenciones-proveedores` + los dos `supplier-route-contract` → **4 archivos,
72/72**, dos corridas sin el flake de jsdom. `pnpm typecheck` **exit 0 en todo el proyecto**; eslint exit 0.
- Mapa de testIds a la tabla compartida; `SUPPLIER_COLUMNS` → `buildSupplierColumns(...)`; imports solo por barrel.
- El negativo de QC-44 R11 pasa a positivo en el mismo `it` («R6, R7, R10: ofrece busqueda y orden...»).
- **`supplier-route-contract.test.ts` (los dos) NO se tocan**: `tests/unit/proveedores-ui/...` lee
  `components/` en tiempo de ejecucion y `tests/unit/proveedores/...` no mira los archivos de la
  lista; ninguno cierra lista de archivos.
- **Limite**: el clic en `supplier-list-clear-search` se verifica solo por `href`. En vitest
  `next/link` resuelve al `Link` del pages router, que sin contexto de router sale antes de
  `onNavigate` (`node_modules/next/dist/client/link.js`, guarda `if (!router)`) y jsdom falla con
  «navigation to another Document». Recetas si pulsa (su enlace usa `onClick`). **Diferencia de
  implementacion entre las dos tablas** (proveedores `onNavigate`, recetas `onClick`) que el
  reviewer puede querer igualar; el clic real queda para el E2E.
- Comentarios antiguos de los casos no tocados (alta/edicion, baja, error inesperado) siguen citando `R<n>`/`QC-<n>`.
- Coherencia columnas↔lista blanca: `sortable` ya cubierto (l.551-553); filtro solo contra
  `CREATED_AT_COLUMN_ID` (l.601-603). Complemento con `SUPPLIER_QUERYABLE.filterable` en curso.

## Receta de la base que paso el leader (a aplicar en T15–T17)

La de `progress/current.md` esta obsoleta. La valida es la de la plantilla de QC-77
(`tests/helpers/test-database.ts:515-572`, `buildTemplateSchema`): `pnpm run db:test template` →
`DROP DATABASE "QuimiCloude_QC56" WITH (FORCE)` → `CREATE DATABASE "QuimiCloude_QC56" TEMPLATE
"<plantilla>"` → `prisma migrate status` + rol Administrador y usuario inicial presentes. Sin tocar el
`.env`. Resultado:
- Paso 1, `pnpm run db:test template` → **exit 0**: `plantilla reutilizada: qct_tpl_5a5346ed8f4d (28 migraciones)`.
- Paso 2, `DROP DATABASE IF EXISTS "QuimiCloude_QC56" WITH (FORCE)` contra `postgres` → ok (antes se
  verifico que el `.env` apunta a `QuimiCloude_QC56` y que la plantilla existe).
- Paso 3, `CREATE DATABASE "QuimiCloude_QC56" TEMPLATE "qct_tpl_5a5346ed8f4d"` → ok al primer intento (sin 55006).
- Paso 4, `pnpm exec prisma migrate status` → **exit 0**, `28 migrations found`, `Database schema is up to date!`.
  Consulta directa: roles `Administrador, Operador`; `users` 1; `companies` 1; `_prisma_migrations`
  29 filas, 1 no terminada/revertida (la de QC-49 marcada `rolled-back` por la propia receta de la plantilla).
- `.env` no se toco. **T15–T17 desbloqueadas** (2026-09-15).

## Tanda 1 — commit `e866e00`

| Task | Archivos | Subagente |
|---|---|---|
| T1 | M `lib/modules/proveedores/index.ts` (+1 linea: `export { SUPPLIER_QUERYABLE } ...`) | frontend_dev |
| T2 | M `app/(private)/produccion/formulas/components/recipe-list-params.ts`; M `tests/unit/recetas-ui/recipe-list-params.test.ts` (37 casos) | frontend_dev |
| T3 | M `app/(private)/proveedores/components/supplier-list-params.ts`; M `tests/unit/proveedores-ui/supplier-list-params.test.ts` (38 casos, R31 con `toBe`) | frontend_dev |
| T4 | D `formulas/components/recipe-columns.ts`; A `recipe-columns.tsx`, `recipe-columns-skeleton.ts` | frontend_dev |
| T5 | D `proveedores/components/supplier-columns.ts`; A `supplier-columns.tsx`, `supplier-columns-skeleton.ts` | frontend_dev |
| T14 | M `specs/QC-26-pantalla-de-recetas/requirements.md` (bloques l.85-97 bajo R8 y l.123-136 bajo R14); M `specs/QC-44-pantalla-de-proveedores/requirements.md` (bloque l.117-136 tras la enmienda del 2026-09-07, sin reescribirla) | frontend_dev |

**Verificacion de la tanda (subagentes):**
- `pnpm typecheck` → exit 2, **rotura intermedia prevista**: 0 errores en los archivos de la tanda;
  los restantes estan en barrels, tabla, esqueleto, seccion y toolbar de las dos rutas (T6–T9) y en
  `recipe-page.test.tsx:338,360` / `supplier-page.test.tsx:366,385` (T10/T12).
- `pnpm exec eslint` sobre los archivos de la tanda → exit 0.
- Tests de parsers: los dos importan por el barrel de la ruta (la guardia
  `tests/unit/proveedores-ui/guard-convenciones-proveedores.test.ts:211-236` prohibe ruta profunda
  tambien en `tests/`), asi que quedan rojos hasta que T8/T9 reexporten. Con copias temporales
  importando el parser directo (borradas): **2 archivos, 75 tests verdes**.
- `vitest related` (T1–T3): 124 archivos verdes, 4 rojos (los dos tests de parser por el barrel;
  `recipe-page`/`supplier-page` por la rotura intermedia). Guardias `module-contract`,
  `listas-blancas-listados`, `guard-arquitectura-modulos`, `guard-convenciones-proveedores` verdes.

**Decisiones y notas de la tanda:**
- Ningun test cerraba la lista de exportaciones del barrel de proveedores (revisados
  `tests/unit/proveedores/module-contract.test.ts` y `guard-convenciones-proveedores.test.ts`).
- Fecha: solo `YYYY-MM-DD` que exista de verdad (ano/mes/dia comprobados); `Date.parse` —el de
  pedidos— da por buena `2026-02-30` en node. Extremo con hora se descarta.
- Busqueda y filtro `createdAt` se leen solo si la lista blanca los declara (`searchable`,
  `filterable.createdAt === 'dateRange'`) (R11).
- `RecipeListSearchParams` / `SupplierListSearchParams` dejan de exportarse (lista exacta de T2).
- Sin probar aun que `id: 'description'` no compile en `RecipeColumnId`: se cubre en T10.
- Comentarios que citan los `.ts` borrados, fuera de alcance: `app/(private)/pedidos/components/order-columns.tsx:108`,
  `app/(private)/configuracion/usuarios/components/user-labels.ts:116-117`. No se tocan (R28).
- Los comentarios de `lib/modules/proveedores/index.ts` citan tasks/specs; no se limpian (T1: nada mas en `lib/`).

## Tanda 5 (recetas) — commit `b0052b4`

**Archivos:** M `e2e/recetas.spec.ts` (T15), M `e2e/recetas-pasos.spec.ts` (T16) y M
`tests/unit/shared/data-table-alcance.test.ts` (T13 punto 3). La lista cerrada de E2E pasa de nueve a
once (`e2e/recetas-pasos.spec.ts` y `e2e/recetas.spec.ts`), y el test afirma que `e2e/errores.spec.ts` no entra.

**Recetas creadas con Prisma, no por la UI:** el alta por pantalla ya la recorre el caso R52, y una
receta existe sin lineas ni empresa. Basta `prisma.recipe.createMany` con `name` y
`nameNormalized: normalizeRecipeName(name)`.

### Lineas tocadas en los E2E de recetas (para QC-93), numeracion original -> nueva

`e2e/recetas.spec.ts` (el bloque de QC-93 del original son las l.376-388):

| Hunk (original -> nuevo) | Que | Declarado en T15 |
|---|---|---|
| tras l.61 -> **nueva l.62** | `import { normalizeRecipeName } from '@/lib/modules/recetas';` | **no**; desviacion **aceptada por el leader** (2026-09-15) |
| entre l.99 y l.100 -> **nuevas l.101-104** | comentario + `orderRecipeAName` / `orderRecipeBName` | si (l.94-98, nombres) |
| l.200-203 -> l.205-207; l.206-207 -> l.210-211 | comentario y `findRecipeCell` a `data-table-cell-name` / `data-table-next` | si (l.199-222) |
| l.220 -> l.224 | `recipe-list` -> `data-table` | si (l.199-222) |
| entre l.280 y l.281 -> **nuevas l.285-293** | `beforeAll`: `prisma.recipe.createMany` de las dos recetas de orden | si (l.224-281) |
| l.289 -> l.302 | comentario del `afterAll` | si (l.283-317) |
| l.297 -> l.310-312 | `afterAll` borra `recipeName`, `orderRecipeAName` y `orderRecipeBName` por nombre exacto | si (l.283-317) |
| entre l.375 y l.376 -> **nuevas l.391-442** | test «busca las recetas propias por su nombre y las ordena por nombre descendente (R26)» | si (tras l.374, antes de l.376) |
| **l.386 -> l.453** (dentro del bloque QC-93) | `recipe-table` -> `data-table` en el caso R6 | si (l.386-387) |

`e2e/recetas-pasos.spec.ts`:

| Hunk (original -> nuevo) | Que | Declarado en T16 |
|---|---|---|
| l.193-195 -> l.193-195 | comentario de `findRecipeRow` | si (l.192-213) |
| l.198-199 -> l.198-201 | fila por `data-table-row-*` con `data-table-cell-name`; `data-table-next` | si |
| l.212 -> l.214 | `recipe-list` -> `data-table` | si |

### Salida de Playwright (recetas): `e2e/recetas.spec.ts` + `e2e/recetas-pasos.spec.ts`, Chromium y WebKit

```
Running 8 tests using 6 workers
  ok   [chromium] e2e/recetas.spec.ts:391 busca las recetas propias por su nombre y las ordena por nombre descendente (R26) (35.9s)
  ok   [chromium] e2e/recetas.spec.ts:339 el Administrador entra, da de alta una receta con una linea y un paso, y la ve en la lista (R52) (36.8s)
  ok   [webkit]   e2e/recetas.spec.ts:339 ... (R52) (43.6s)
  ok   [chromium] e2e/recetas-pasos.spec.ts:319 el Administrador redacta un paso ... hasta Finalizar (R28) (48.1s)
  ok   [webkit]   e2e/recetas.spec.ts:391 ... (R26) (11.7s)
  ok   [webkit]   e2e/recetas-pasos.spec.ts:319 ... (R28) (51.8s)
  FAIL [chromium] e2e/recetas.spec.ts:443 un usuario que no es Administrador acaba fuera y no ve el catalogo (R6) (1.2m)
  FAIL [webkit]   e2e/recetas.spec.ts:443 ... (R6) (1.1m)
  TimeoutError: page.waitForURL: Timeout 60000ms exceeded.
    navigated to "http://localhost:3117/inventario"
    > 158 |   await page.waitForURL((url) => url.pathname === DASHBOARD_ROUTE, { timeout: 60_000 });
        at login (e2e/recetas.spec.ts:158:14)
  2 failed, 6 passed (2.2m), PLAYWRIGHT_EXIT=1
```

Tras la corrida no quedaron recetas huerfanas con el prefijo del RUN.

**R6 de recetas (el Operador queda fuera): rojo HEREDADO de QC-93, que no se arregla en esta rama
(decision del leader, 2026-09-15).** La causa: el Operador aterriza en `/inventario` y el helper
`login` (`e2e/recetas.spec.ts:158`) espera `DASHBOARD_ROUTE`. El test falla en el login, antes de
llegar a ninguna asercion sobre la lista. Es uno de los cuatro casos de aterrizaje que arregla QC-93
(`recetas.spec.ts:376` del original), que aun no esta en `dev`. Esta rama solo cambio su testId
(l.386 -> l.453).

## Gate del leader (2026-09-15)

El leader corrio `./init.sh --rapido` en el worktree: **`== init OK ==`, exit 0** (2098 tests
relacionados y 411 guardias), con los archivos de la tanda 5 de recetas todavia sin commit.
**Aviso no bloqueante: fallo `prisma generate`.** El gate avisa y sigue, y `pnpm typecheck` salio
verde. No lo corrio el implementer.

## Casos R30 y R28 — commit `a580de0`

Al preparar el mapa de T18 salieron dos huecos: R30 no tenia test, y R28 solo lo sostenian las
guardias en la parte de proveedores. Se encargaron a `frontend_dev`:

- `tests/unit/recetas-ui/recipe-route-contract.test.ts:841` «R30: la lista no conserva tabla ni barra propias y si su vacio, su error y su esqueleto».
- `tests/unit/proveedores-ui/supplier-route-contract.test.ts:114`, con el mismo nombre. Solo cubre la
  lista (`page.tsx` + `proveedores/components/`); el catalogo vive en `[id]/components/` y su esqueleto no cuenta.
- `tests/unit/shared/data-table-alcance.test.ts:509` «R28: fuera de las dos rutas, tests, E2E, specs y progreso la rama solo toca el barrel de proveedores».
  Reutiliza el helper y la precondicion de rama del caso R20. **Ojo al cerrar la feature:** exige
  coincidencia exacta, asi que si la rama commitea algo fuera de esas carpetas (`feature_list.json`,
  `docs/`) se pone en rojo.
- `vitest run` de los tres archivos + `guard-convenciones-proveedores`: **4 archivos, 55/55, 0 skipped**.
  eslint exit 0, typecheck exit 0.
- Mordidas: un `recipe-list-toolbar.tsx` vacio → rojo; borrar `supplier-list-empty.tsx` → rojo; un
  `lib/modules/proveedores/tmp-qc56.ts` sin commitear → rojo. Todo restaurado.

## Tanda 5 (proveedores) — T17

**Archivo:** M `e2e/proveedores.spec.ts`. Lo escribio un primer `frontend_dev`, que se cayo por el
watchdog de 600 s sin informar. Un segundo `frontend_dev` lo verifico, lo diagnostico y entrego
informe tarde. El implementer reviso el diff contra T17 y lanzo ademas una corrida solo en Chromium
con `--reporter=list` antes de que el leader ordenara no volver a correr (ver al final).

**Proveedores creados con Prisma:** `prisma.supplier.createMany` con `name`,
`nameNormalized: normalizeSupplierName(name)` y `phone`, porque la restriccion
`suppliers_contact_required` exige telefono. El `afterAll` los borra por nombre exacto junto a
`supplierName`.

### Lineas tocadas en `e2e/proveedores.spec.ts` (para QC-93), numeracion original -> nueva

El bloque de QC-93 del original son las l.467-483. Salida de `git diff -U0`:

| Hunk (original -> nuevo) | Que | Declarado en T17 |
|---|---|---|
| tras l.66 -> **nueva l.67** | `import { normalizeSupplierName } from '@/lib/modules/proveedores';` | **no**; desviacion **aceptada por el leader** (2026-09-15) |
| tras l.109 -> **nuevas l.111-114** | comentario + `orderSupplierAName` / `orderSupplierBName` | si (l.106-108, nombres) |
| l.236-240 -> l.241-243 | comentario de `findSupplierRow` | si (l.235-259) |
| l.243-244 -> l.246-247 | fila por `data-table-row-*`; `data-table-next` | si (l.235-259) |
| l.257 -> l.260 | `supplier-list` -> `data-table` | si (l.235-259) |
| tras l.327 -> **nuevas l.331-340** | `beforeAll`: `prisma.supplier.createMany` de los dos proveedores de orden | si (l.283-328) |
| l.342 -> l.355-357 | `afterAll` borra `supplierName`, `orderSupplierAName` y `orderSupplierBName` por nombre exacto | si (l.330-365) |
| tras l.466 -> **nuevas l.482-541** | test «busca los proveedores propios por su nombre y los ordena por nombre descendente (R26)» | si (tras l.465, antes de l.467) |
| **l.480 -> l.555** (dentro del bloque QC-93) | `supplier-row` -> `[data-testid^="data-table-row-"]` en el caso R52 | si (l.479-481) |

Declaradas pero sin tocar: **l.402 y l.411**. La fila y `supplier-detail-link` del recorrido R51 ya
funcionan a traves de `findSupplierRow`.

### Resultado por caso y motor (evidencia del `frontend_dev`: `scratchpad\pw-proveedores.txt`, `pw-r51.txt`, `trace-r51-{chromium,webkit}/`, `t17-db-check.cjs`, `typecheck-t17-final.txt`)

| Caso | Chromium | WebKit | Clasificacion |
|---|---|---|---|
| «busca los proveedores propios por su nombre y los ordena por nombre descendente (R26)» | **pasa** (25,7 s) | **pasa** (28,2 s) | de esta rama, **verde** |
| «el Administrador entra, da de alta un proveedor, abre su detalle, anade una linea de catalogo y la ve en la lista (R51)» | falla | falla | **heredado de QC-80** |
| «un usuario que no es Administrador acaba fuera y no ve ningun dato de proveedores (R52)» | falla | falla | **heredado de QC-93** |

**R51, heredado de QC-80.** `QuimiCloude_QC56` tiene 0 presentaciones, asi que el recorrido crea
siempre la presentacion en linea. `choosePresentation` (`e2e/proveedores.spec.ts:198-203`) solo
rellena el nombre, y `components/shared/presentation-select.tsx:301-309` exige la unidad desde
`af96771`. La traza muestra `presentation-error-unit` («Elige la unidad de la presentación.») y
`presentation-create` no se cierra: `toHaveCount(0)` recibe 1 durante 60 s (l.203, llamado desde l.443).
La rama no toca ese camino, porque fuera de rutas y tests solo cambia `lib/modules/proveedores/index.ts`,
y el helper viene de `5a9c87ba`, anterior a QC-80. Coincide con la causa B de
`.worktrees/QC-93-aterrizaje-sin-permiso-de-modulo/progress/impl_QC-93-aterrizaje-sin-permiso-de-modulo.md:346`
(«la unidad de la presentacion es obligatoria y los E2E solo rellenan el nombre; el bloque/panel de
alta no se cierra», con `proveedores.spec.ts:360` en su numeracion). **No se arregla aqui.**

**R52, heredado de QC-93.** `login-action.ts:92-95` aterriza en `firstVisibleNavHref` y el helper
`login` espera `DASHBOARD_ROUTE` (`e2e/proveedores.spec.ts:185`). Traza: `navigated to
"http://localhost:3117/inventario"` y despues `TimeoutError: page.waitForURL: Timeout 60000ms exceeded`.
Es la causa A de la misma bitacora de QC-93 (l.79). La rama no toca esos archivos; solo cambio el
testId de fila del caso (l.480 -> l.555).

**Ruido de la corrida de las 15:24.** `pw-proveedores.txt` incluye `Module not found:
'./supplier-list-empty'`. En ese momento el agente de R30 tenia el archivo fuera de su sitio para su
prueba de mordida, y luego lo restauro. Hoy el archivo esta donde debe y la corrida aislada no da ese error.

**Huerfanas:** 0 (ningun proveedor con `qc44_e2e_` ni filas de fixture). eslint de
`e2e/proveedores.spec.ts` exit 0; `pnpm typecheck` exit 0.

**Corrida del implementer, solo Chromium y `--reporter=list`:** el puerto 3117 estaba libre (`netstat` sin coincidencias) y la corrida es anterior a la orden del leader de no volver a correr. Se deja constancia y no se corrio WebKit. Salida en `scratchpad\pw-prov-chromium.txt`:

```
  ✓  3 [chromium] e2e/proveedores.spec.ts:482 busca los proveedores propios por su nombre y los ordena por nombre descendente (R26) (14.2s)
  ✘  2 [chromium] e2e/proveedores.spec.ts:542 un usuario que no es Administrador acaba fuera y no ve ningun dato de proveedores (R52) (1.1m)
       navigated to "http://localhost:3117/inventario"
       > 185 |   await page.waitForURL((url) => url.pathname === DASHBOARD_ROUTE, { timeout: 60_000 });
  ✘  1 [chromium] e2e/proveedores.spec.ts:387 el Administrador entra, da de alta un proveedor, abre su detalle, anade una linea de catalogo y la ve en la lista (R51) (1.3m)
       Locator: getByTestId('presentation-create')
       > 203 |     await expect(page.getByTestId('presentation-create')).toHaveCount(0, { timeout: 60_000 });
  2 failed, 1 passed (1.5m), PLAYWRIGHT_EXIT=1
```

La corrida coincide con la clasificacion de arriba: R26 verde, R51 por la causa de QC-80 (l.203) y R52 por la de QC-93 (l.185). No aparece `Module not found`.

## T18 — Mapa `R<n> -> test` (R1-R33)

Abreviaturas:
- `RP` = `tests/unit/recetas-ui/recipe-page.test.tsx`
- `SP` = `tests/unit/proveedores-ui/supplier-page.test.tsx`
- `RC` = `tests/unit/recetas-ui/recipe-route-contract.test.ts`
- `SC` = `tests/unit/proveedores-ui/supplier-route-contract.test.ts`
- `RLP` = `tests/unit/recetas-ui/recipe-list-params.test.ts`
- `SLP` = `tests/unit/proveedores-ui/supplier-list-params.test.ts`
- `DTA` = `tests/unit/shared/data-table-alcance.test.ts`
- `E2E-R` = `e2e/recetas.spec.ts`
- `E2E-RP` = `e2e/recetas-pasos.spec.ts`
- `E2E-P` = `e2e/proveedores.spec.ts`

| R | Test(s), nombre exacto |
|---|---|
| R1 | RP «R1: la lista monta la tabla compartida dentro del armazon privado, sin main ni paginacion propios»; SP «R1: se renderiza dentro del armazon privado con la tabla compartida, sin tabla ni paginacion propias»; E2E-RP «el Administrador redacta un paso con negrilla y lista de verificacion, lo guarda, lo reabre igual y recorre la vista previa hasta Finalizar (R28)» (localiza la receta en la tabla compartida, T16) |
| R2 | RP «R2: la lista presenta imagen, nombre, pasos, creado, actualizado y acciones, y nunca la descripcion» (con `@ts-expect-error` de `'description'`); RC «R2, R3: la lista no puede pintar quien creo o modifico una receta ni su descripcion»; SP «R2, R18: presenta exactamente nombre, telefono, correo, creado, actualizado y acciones, y el esqueleto cuenta las mismas» |
| R3 | RP «R3: la lista no muestra id, createdBy ni updatedBy»; RC «R2, R3: ...»; SP «R3: no muestra el id tecnico, el nombre normalizado ni los ids de autoria» |
| R4 | SP «R4: cada fila enlaza al detalle de su proveedor con la ruta del helper»; E2E-P «busca los proveedores propios por su nombre y los ordena por nombre descendente (R26)» (comprueba `supplier-detail-link` en la fila) |
| R5 | RP «R5: la imagen usa la direccion de la consulta tal cual y sin imagen se pinta el marcador»; RC «la imagen se pinta con la direccion que entrega la consulta y ningun archivo compone una URL de almacenamiento» |
| R6 | RP «R6, R7, R8, R10: hay busqueda, solo name, createdAt y updatedAt ordenan por cabecera, y ordenar navega sin reordenar las filas» y «R6: el orden elegido en el menu de la cabecera navega, y la cabecera expone el orden vigente»; SP «R6, R7, R10: ofrece busqueda y orden por cabecera en nombre y fechas, y pinta las filas del simulador en su orden» y «R6: el orden de la URL llega a la accion y a aria-sort, y el menu de la cabecera navega con el orden elegido»; E2E-R «busca las recetas propias por su nombre y las ordena por nombre descendente (R26)»; E2E-P «busca los proveedores propios por su nombre y los ordena por nombre descendente (R26)» |
| R7 | RP «R7: los menus de imagen y pasos no ofrecen orden» y «R7, R11: cada columna ordena y filtra exactamente lo que declara la lista blanca, y nada de la lista blanca queda sin columna»; SP «R7: telefono, correo y acciones no ofrecen orden ni en la cabecera ni en su menu» y «R7, R11: cada columna ordena y filtra exactamente lo que declara la lista blanca, y nada de la lista blanca queda sin columna» |
| R8 | RP «R8: vaciar la busqueda navega sin termino y escribir uno navega con el, una sola vez tras el rebote»; SP «R8:la busqueda navega con el termino al cumplirse SEARCH_DEBOUNCE_MS, y vaciarla navega sin termino»; E2E-R «... (R26)»; E2E-P «busca los proveedores propios por su nombre y los ordena por nombre descendente (R26)» |
| R9 | RP «R9: el atajo de fecha navega con el rango, limpiarlo navega sin el, y ninguna otra columna filtra»; SP «R9: el atajo de fecha navega con el rango de creacion, limpiarlo navega sin rango, y ninguna otra columna filtra» |
| R10 | RP «R10: las filas son las que devolvio la operacion y en su orden, aunque la URL pida otro orden»; RC «R10: ningun archivo de tabla o columnas ordena, filtra ni recorta las filas recibidas» (mordida hecha); SP «R10: pinta las filas tal cual llegan aunque la URL pida otro orden y un termino que no coincide» |
| R11 | RLP «R11: el filtro de fecha solo existe porque la lista blanca declara createdAt como rango de fechas» y «R11: el parser toma la lista blanca del contrato del modulo y no mantiene una copia»; SLP «R11: el filtro de fecha solo existe porque la lista blanca declara createdAt como rango de fechas» y «R11, R31: el parser toma la lista blanca del contrato del modulo, no por ruta profunda ni copiada»; RC «R11: el parser deriva los campos de RECIPE_QUERYABLE del barrel y no mantiene copia a mano»; RP y SP «R7, R11: ...» (mordidas hechas) |
| R12 | RLP y SLP «R12: sin parametros devuelve la primera pagina, el tamano por defecto y nada acotado», «R12, R13: $caso» (`it.each` del contrato de URL), «R12: la consulta construida se vuelve a leer igual, con y sin todos los campos», «R12: la consulta no escribe busqueda, orden ni fechas cuando estan vacios» y «R12: el destino se deriva de la constante de ruta de formulas / de proveedores»; RP «R12: una URL con pagina, tamano, orden, busqueda y rango pide la lista con todos ellos» |
| R13 | RLP y SLP «R12, R13: $caso»; RP «R13: los parametros invalidos se acotan uno a uno y la lista se presenta sin fallar» |
| R14 | RP «R14: mientras un gesto esta en vuelo la tabla se marca ocupada y el campo de busqueda conserva foco y texto» y «R14, R33: pasar de filas a sin resultados con el mismo arbol conserva el campo de busqueda, su foco y su texto»; SP «R14: con la navegacion en vuelo la tabla se marca aria-busy y la busqueda conserva el foco y el texto» |
| R15 | RP «R15: pintar una pagina invoca la operacion de listado una sola vez y nunca la de detalle»; RC «pintar una pagina de lista cuesta una sola invocacion de listado y ningun archivo de la lista lleva la marca de producto de baja» y «los componentes de cliente no importan composicion, Prisma ni sesion por su cuenta»; SP «R15, R22: pide la lista una sola vez con 10 por defecto, ofrece 10 y 25, y cambiar el tamano navega a la primera pagina» |
| R16 | RP «R16: sin busqueda ni filtro y sin recetas presenta el vacio propio fuera de la tabla, con crear»; SP «R16: sin proveedores ni busqueda presenta el estado vacio con la accion de crear, fuera de la tabla» y «el estado vacio ofrece crear el primer proveedor y abre el mismo panel» |
| R17 | RP «R17: una pagina que se quedo atras ofrece volver a la primera conservando tamano y orden»; SP «R17: una pagina que se quedo atras sin busqueda ofrece volver a la primera conservando tamano y orden» |
| R18 | RP «R18: mientras carga presenta el esqueleto propio con tantas filas como el tamano pedido y sin tabla» y «R18: el esqueleto cuenta tantas celdas como columnas declara la lista»; SP «R18: mientras carga presenta el esqueleto propio con tantas filas como el tamano pedido» y «R2, R18: ...» |
| R19 | RP «R19: un error de la consulta presenta el error propio con reintento, fuera de la tabla», «R19: un error unauthorized se presenta y no se muestra ningun dato de la lista» y «lista de recetas — el identificador del error inesperado (QC-71 R17, R18)» > «el error inesperado ensena el identificador como texto, con su etiqueta»; SP «R19: un error de la consulta presenta el estado de error con reintento y no una tabla vacia», «R19: un unauthorized de la operacion no muestra ningun dato de proveedores» y «pantalla de proveedores — el identificador del error inesperado (QC-71 R17, R18)» > «la lista con el error inesperado ensena el identificador como texto y con su etiqueta» |
| R20 | RP «R20: el estado «$estado» se presenta sin ninguno de los otros» (`it.each`: error, vacio, sinResultados, cargando, filas); SP «R20: vacio, sin resultados, cargando y error son mutuamente excluyentes y se distinguen por data-testid»; DTA «R20: el diff de la rama no toca ningun archivo de components/shared/data-table/» (mordida hecha) |
| R21 | RP «R21: las acciones van en una columna que no se puede fijar, siempre visibles y con area tactil de 44x44» y «R21: editar navega a la pagina de la receta y crear a la de alta, sin abrir panel ni modal»; SP «R21: la columna de acciones no se puede fijar y sus controles se ven sin puntero, con area tactil de 44x44» y «R21, R24: orden, busqueda, filtro, paginacion y acciones se ven y se alcanzan en viewport angosto y en ancho» |
| R22 | RLP y SLP «R22: las dos opciones de tamano son el defecto y el tope, y coinciden con las del selector»; RP «R22: el selector de tamano ofrece 10 y 25, usa 10 por defecto y cambiarlo navega a la primera pagina»; SP «R15, R22: ...» |
| R23 | RP «R23: permite avanzar y retroceder e indica la pagina actual y el total»; SP «R23: permite avanzar y retroceder de pagina e indica la pagina actual y el total»; RP y SP «R23: en los extremos no ofrece avanzar ni retroceder mas alla» |
| R24 | RP «R24: el desbordamiento horizontal lo absorbe el envoltorio de la tabla y ningun ancestro» y «R24: en viewport angosto y ancho la lista, sus acciones, el orden, la busqueda y el filtro estan a la vista y son tactiles»; SP «R24: el desbordamiento horizontal lo absorbe el envoltorio de la tabla y ningun ancestro», «R21, R24: ...» y «R24: la columna fijada por defecto es el nombre» |
| R25 | **Sin test automatico.** `design.md > 8` lo deja en «revision de los propios tests». Los tests nuevos localizan por rol, `data-testid` o constantes exportadas. Los E2E declaran constantes locales con los mismos valores del parser, porque ningun E2E importa de `app/`. Lo verifica el reviewer. |
| R26 | E2E-R «busca las recetas propias por su nombre y las ordena por nombre descendente (R26)»: **verde en Chromium (35.9 s) y WebKit (11.7 s)**; E2E-P «busca los proveedores propios por su nombre y los ordena por nombre descendente (R26)» |
| R27 | `tests/guards/guard-dependencias-aprobadas.test.ts` (sin cambios; verde en el `--rapido` del leader); `git diff --name-only origin/dev...HEAD -- package.json pnpm-lock.yaml` sale vacio |
| R28 | DTA «R28: fuera de las dos rutas, tests, E2E, specs y progreso la rama solo toca el barrel de proveedores» (mordida hecha); RC «la feature no toca lib/modules/recetas ni db/»; `tests/unit/shared/listas-blancas-listados.test.ts` y `tests/guards/guard-arquitectura-modulos.test.ts` (sin cambios) |
| R29 | DTA «solo las siete pantallas autorizadas importan components/shared/data-table», «la pantalla de recetas SI consume la tabla compartida (R29)» y «la lista de specs E2E que referencian data-table es cerrada, y son estos once» |
| R30 | RC «R30: la lista no conserva tabla ni barra propias y si su vacio, su error y su esqueleto»; SC «R30: la lista no conserva tabla ni barra propias y si su vacio, su error y su esqueleto» (mordidas hechas) |
| R31 | SLP «R31: el contrato del modulo publica la misma lista blanca que declara su dominio» y «R11, R31: el parser toma la lista blanca del contrato del modulo, no por ruta profunda ni copiada» |
| R32 | RLP y SLP «R32: solo orden o tamano no cuentan como busqueda ni filtro», «R32: un termino de busqueda cuenta como activo» y «R32: un rango de fecha de creacion cuenta como activo»; RP «R32, R33: con busqueda y cero filas presenta sin resultados dentro de la tabla, sin crear, y limpiar conserva tamano y orden» y «R32: con busqueda, cero filas y pagina 3 ofrece volver a la primera conservando busqueda, filtro, tamano y orden»; SP «R32, R33: con busqueda o filtro y cero filas presenta «sin resultados» dentro de la tabla, sin crear, con la busqueda y el filtro a la vista» y «R32: con busqueda, cero filas y una pagina posterior ofrece volver a la primera conservando busqueda, filtros, tamano y orden» |
| R33 | RLP y SLP «R33: limpiar vacia busqueda y filtros, vuelve a la primera pagina y conserva orden y tamano»; RP «R14, R33: ...» y «R32, R33: ...» (pulsa limpiar y navega); SP «R33: al pasar de filas a «sin resultados» con el mismo arbol, la busqueda conserva el foco y lo escrito» y «R32, R33: ...» (limpiar se comprueba solo por `href`, ver T12) |

## Desviaciones consolidadas (para el reviewer)

1. **Import fuera de lo declarado en T15:** `e2e/recetas.spec.ts:62` importa `normalizeRecipeName` desde el barrel de recetas. **Aceptada por el leader.** Con el mismo criterio, `e2e/proveedores.spec.ts:67` importa `normalizeSupplierName` desde el barrel de proveedores, fuera de lo declarado en T17. **Tambien aceptada por el leader** (2026-09-15).
2. **R6 de recetas es un rojo heredado de QC-93** (ver «Tanda 5 (recetas)»). No se toca. Por la misma causa, **R52 de proveedores** (Operador fuera) tambien es rojo heredado de QC-93; y **R51 de proveedores** es rojo heredado de **QC-80** (unidad de presentacion obligatoria, `presentation-select.tsx:301-309`). Ninguno se arregla en esta rama (ver «Tanda 5 (proveedores) — T17»).
11. **Pendiente para la review, sin tocar (indicacion del leader):** los comentarios de los E2E y tests siguen citando `R<n>`, `design.md` y «decision cerrada».
3. **El clic en «limpiar» de proveedores solo se comprueba por `href`** en vitest, por un limite de `next/link` sin router en jsdom. Recetas usa `onClick` y proveedores `onNavigate`: dos implementaciones distintas de lo mismo.
4. **Los barrels exportan de mas** respecto a `design.md > 4.3` (detalle en «Tandas 2 y 3»).
5. **Fecha:** el parser comprueba que `YYYY-MM-DD` sea una fecha real. No usa `Date.parse`, que da por buena `2026-02-30`.
6. **R11 con los flags de columna escritos a mano.** Lo sostienen los casos «R7, R11», con mordida, como preve `design.md > 4.1`.
7. **T11:** el literal `'description'` aparece en el `Exclude` que lo prohibe, y el caso R10 permite por nombre `.toISOString().slice(`.
8. **DTA (R20, R28):** la precondicion de rama mira el contenido del diff (`formulas/page.tsx` + `specs/QC-56-.../`), no el nombre de la rama. R28 exige coincidencia exacta del diff fuera de las carpetas permitidas.
9. **Comentarios antiguos** que citan `R<n>`/`QC-*` en casos no tocados de `supplier-page.test.tsx`, `recipe-route-contract.test.ts` y `supplier-route-contract.test.ts`. No se han limpiado en un commit aparte.
10. **Sin tocar:** `components/shared/data-table/**` (DTA R20), el catalogo de proveedor, `formulas/nueva/**`, `formulas/[id]/**`, `proveedores/[id]/**`, `recipe-list-error.tsx`, `supplier-list-error.tsx` y `e2e/errores.spec.ts`.
