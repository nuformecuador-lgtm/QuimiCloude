# QC-180 — rojos-heredados-de-alta-de-grupos · bitácora de implementación

Fecha: 2026-10-09. Rama `feature/QC-180-rojos-heredados-de-alta-de-grupos`, ya con merge de
`origin/dev` (incluye QC-167). Spec aprobado por el humano el 2026-10-09 (opción A, D4; notas D5).

## Archivos tocados

| Archivo | Tarea | Quién |
|---|---|---|
| `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx` | T1 | frontend_dev |
| `tests/unit/recetas/scope.test.ts` | T2 | frontend_dev |
| `tests/unit/recetas/module-contract.test.ts` | T3 | frontend_dev |
| `tests/baseline-rojos.json` | T5 | implementer |
| `specs/QC-25-crud-de-recetas/requirements.md` | T6 | implementer |
| `specs/QC-24-modelo-recetas/requirements.md` | T6 | implementer |
| `specs/QC-35-pantalla-de-pedidos/requirements.md` | T6 | implementer |
| `specs/QC-180-rojos-heredados-de-alta-de-grupos/tasks.md` | marcas `[x]` | implementer |
| `progress/impl_QC-180-rojos-heredados-de-alta-de-grupos.md` | esta bitácora | implementer |

Nada bajo `app/` ni `lib/` (R11). `git diff --name-only origin/dev...HEAD`, antes del commit de T5 y
de esta bitácora:

```
progress/features/QC-180.md
specs/QC-180-rojos-heredados-de-alta-de-grupos/design.md
specs/QC-180-rojos-heredados-de-alta-de-grupos/requirements.md
specs/QC-180-rojos-heredados-de-alta-de-grupos/tasks.md
specs/QC-24-modelo-recetas/requirements.md
specs/QC-25-crud-de-recetas/requirements.md
specs/QC-35-pantalla-de-pedidos/requirements.md
tests/unit/navegacion/pantallas-exigen-permiso.test.tsx
tests/unit/recetas/module-contract.test.ts
tests/unit/recetas/scope.test.ts
```

## Mapa `R<n> -> test`

| R | Test / evidencia |
|---|---|
| R1 | `tests/unit/recetas/scope.test.ts`, caso «la pantalla de recetas vive solo donde la declara QC-26» (`PANTALLA_DE_EJECUCION`) |
| R2 | `tests/unit/recetas/module-contract.test.ts`, último caso (`PANTALLAS_AUTORIZADAS`) |
| R3 | `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`, `it.each(PAGINAS)` de `/pedidos`: «se sirve con el permiso» |
| R4 | `tests/baseline-rojos.json` sin las tres claves (diff de T5) + comparador del gate completo (`scripts/comparar-baseline-rojos.mjs`) |
| R5 | `pantallas-exigen-permiso.test.tsx`, `/pedidos` «responde 404 sin el permiso» / «con el conjunto de permisos vacío» (espías `listRecipesAction`, `getMassVolumeBridgeAction`) + mutación de T1 |
| R6 | `pantallas-exigen-permiso.test.tsx`, `/pedidos` «manda al login cuando no hay sesión» + mutación de T1 |
| R7 | `pantallas-exigen-permiso.test.tsx`, `/pedidos` «se sirve con el permiso» con las tres lecturas en error (degrada sin romper) |
| R8 | `scope.test.ts` y `module-contract.test.ts` + mutación 1 de T4 (los dos caen) |
| R9 | `module-contract.test.ts` (`consumesOnlyPublicContract` sobre pedidos) + mutación 2 de T4 |
| R10 | Las dos constantes con los mismos dos literales: `scope.test.ts:163` y `module-contract.test.ts:597` |
| R11 | Diff de la rama (arriba) sin `app/` ni `lib/`; `tests/unit/pedidos-ui/pedidos-viewport.test.tsx` y `order-sheet.test.tsx` verdes sin tocarse |

## Salidas

### Verde final de los tres archivos objetivo (con el baseline ya vacío, T5)

`pnpm exec vitest run tests/unit/recetas/scope.test.ts tests/unit/recetas/module-contract.test.ts tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`

```
 Test Files  3 passed (3)
      Tests  56 passed (56)
   Duration  12.98s
```

### R11: tests de pedidos-ui sin tocar

`pnpm exec vitest run tests/unit/pedidos-ui/pedidos-viewport.test.tsx tests/unit/pedidos-ui/order-sheet.test.tsx`

```
 Test Files  2 passed (2)
      Tests  28 passed (28)
```

### T1: mutación (local, revertida)

En `app/(private)/pedidos/page.tsx`, `const catalogs = loadFormCatalogs();` antes de
`await requirePagePermission('pedidos.consultar');` (y `catalogs` en el `Promise.all`).
`pnpm exec vitest run tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`:

```
 FAIL  |ui| tests/unit/navegacion/pantallas-exigen-permiso.test.tsx > las ocho pantallas privadas exigen su permiso antes de leer o pintar (R6, R7) > '/pedidos' responde 404 sin el permiso, y no llega a leer nada
AssertionError: expected [ 'listUnitsAction()', …(2) ] to deeply equal []
+ [
+   "listUnitsAction()",
+   "listRecipesAction()",
+   "getMassVolumeBridgeAction()",
+ ]
 ❯ tests/unit/navegacion/pantallas-exigen-permiso.test.tsx:318:35

 FAIL  ... > '/pedidos' responde 404 con el conjunto de permisos vacío (R9)   (mismas tres lecturas)
 FAIL  ... > '/pedidos' manda al login cuando no hay sesión, no a un 404     (mismas tres lecturas)

 Test Files  1 failed (1)
      Tests  3 failed | 43 passed (46)
```

Revertida con `git checkout -- "app/(private)/pedidos/page.tsx"`.

### T4 mutación 1 (local, revertida): carpeta nueva `app/(private)/qc180-mutacion/page.tsx` que importa `listRecipesAction`

`pnpm exec vitest run tests/unit/recetas/scope.test.ts tests/unit/recetas/module-contract.test.ts`:

```
 FAIL  |node| tests/unit/recetas/module-contract.test.ts > ... (la pantalla es QC-26)
+   "app/(private)/qc180-mutacion/page.tsx: segunda pantalla de recetas fuera de su carpeta",
 FAIL  |node| tests/unit/recetas/scope.test.ts > ... > la pantalla de recetas vive solo donde la declara QC-26, y en ningun otro sitio
AssertionError: segunda pantalla de recetas fuera de app\(private)\produccion\formulas/: ...\app\(private)\qc180-mutacion\page.tsx
 Test Files  2 failed (2)
      Tests  2 failed | 8 passed (10)
```

Revertida con `rm -rf "app/(private)/qc180-mutacion"`.

### T4 mutación 2 (local, revertida): import de pedidos desde `@/lib/modules/recetas/domain/list-recipes`

`pnpm exec vitest run tests/unit/recetas/module-contract.test.ts`:

```
 FAIL  |node| tests/unit/recetas/module-contract.test.ts > ... (la pantalla es QC-26)
+   "app/(private)/pedidos/page.tsx: consume recetas por dentro, no por su contrato publico",
 Test Files  1 failed (1)
      Tests  1 failed | 4 passed (5)
```

Revertida con `git checkout -- "app/(private)/pedidos/page.tsx"`. Tras revertir las tres mutaciones,
`git status --short` no muestra nada bajo `app/` ni `lib/`.

### Typecheck y lint

- `pnpm run typecheck`: exit 0. El primer intento dio 932 errores ajenos (cliente de Prisma y tipos
  de Next sin generar en el worktree). Se corrió `pnpm exec prisma generate` y
  `pnpm exec next typegen`, lo mismo que hace `scripts/gate-proyecto.sh`. Solo se escriben archivos
  generados, nada versionado.
- `pnpm run lint`: exit 0, 0 errores, 7 avisos, ninguno en los archivos tocados.

## Pendiente para el leader

T7: `./init.sh` (gate local, rápido) lo corrió el leader el 2026-10-09 en el worktree: en verde (`== init OK ==`).
