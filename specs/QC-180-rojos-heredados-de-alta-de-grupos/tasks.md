# QC-180 — rojos-heredados-de-alta-de-grupos · tasks.md

> El humano lo decidió el 2026-10-08: opción A (D4) y notas en QC-25, QC-24 y QC-35 (D5).
>
> Verificación de cada tanda (`docs/perfil-agentes.md > Todos los agentes`):
> `pnpm run typecheck`, `pnpm run lint` y `pnpm exec vitest related --run <archivos>`. Para los tres
> archivos objetivo, `pnpm exec vitest run <archivo>`. Ningún subagente corre `pnpm test`.

## Grupo 0: mocks de `/pedidos`

- [x] **T1 [P]** Completar los mocks de `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`
  (`design.md > 3.1`).
  - Añadir `listRecipesAction` y `getMassVolumeBridgeAction` al objeto `actions` de `vi.hoisted`, y
    apuntar a ellos los `vi.mock` de `recipe-actions` y `unit-actions`.
  - Actualizar el JSDoc de cabecera: seis Server Actions espiadas, no cuatro.
  - No se añaden ni se quitan casos, y `PAGINAS` no cambia.
  - **Hecho:** `pnpm exec vitest run tests/unit/navegacion/pantallas-exigen-permiso.test.tsx` en verde.
    Además, con una mutación local sin commitear que mueva `loadFormCatalogs()` **antes** de
    `requirePagePermission` en `app/(private)/pedidos/page.tsx`, el caso «`/pedidos` responde 404 sin
    el permiso» cae citando `listRecipesAction()` o `getMassVolumeBridgeAction()`. Se revierte la
    mutación y la salida queda en `progress/impl_…`. Cubre R3, R5, R6 y R7.

## Grupo A: lista cerrada de los guardianes (D4)

- [x] **T2 [P]** `tests/unit/recetas/scope.test.ts` (`design.md > 4.1`).
  - `PANTALLA_DE_EJECUCION` pasa a ser un conjunto cerrado de dos rutas exactas:
    `app/(private)/asignacion/[id]/page.tsx` y `app/(private)/pedidos/page.tsx`.
  - El filtro `segundasPantallas` excluye las rutas del conjunto.
  - Comentario `AMPLIADA el 2026-10-08 (QC-180)` con el qué, el porqué (QC-35 R31 y
    `897a4f91`) y lo que sigue prohibido.
  - La lista E2E cerrada **no** se toca.
  - **Hecho:** `pnpm exec vitest run tests/unit/recetas/scope.test.ts` en verde. Cubre R1, R8 y R10.
- [x] **T3 [P]** `tests/unit/recetas/module-contract.test.ts` (`design.md > 4.1`).
  - `PANTALLAS_AUTORIZADAS` pasa de una ruta a las mismas dos de T2.
  - Comentario fechado equivalente.
  - `consumesOnlyPublicContract` se sigue aplicando a las dos.
  - **Hecho:** `pnpm exec vitest run tests/unit/recetas/module-contract.test.ts` en verde. Las dos
    listas (T2 y T3) tienen los mismos dos literales. Cubre R2, R9 y R10.
- [x] **T4** Falsabilidad de los guardianes (`design.md > 3.3`). Depende de T2 y T3.
  - Hacer las mutaciones 1 y 2 en local, sin commitear.
  - Comprobar que la 1 pone rojos los dos guardianes y la 2 pone rojo `module-contract`.
  - Revertir y comprobar que vuelven a verde.
  - **Hecho:** las tres salidas (dos rojos y el verde final) copiadas en `progress/impl_…`, y
    `git status` limpio de mutaciones. Cubre R8 y R9.

## Grupo 1: baseline y cierre

- [x] **T5** Borrar de `tests/baseline-rojos.json` las entradas de `tests/unit/recetas/scope.test.ts`,
  `tests/unit/recetas/module-contract.test.ts` y `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`.
  Depende de T1 a T4.
  - **Hecho:** el JSON parsea. Las demás entradas quedan byte a byte iguales (`git diff` solo muestra
    las tres claves borradas). `pnpm exec vitest run tests/unit/recetas/scope.test.ts
    tests/unit/recetas/module-contract.test.ts tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`
    sale en verde. Cubre R4.
- [x] **T6 [P]** Notas de enmienda fechadas en los specs dueños, según D5 (`design.md > 6`).
  - Al final de `specs/QC-25-crud-de-recetas/requirements.md`, `specs/QC-24-modelo-recetas/requirements.md`
    y `specs/QC-35-pantalla-de-pedidos/requirements.md`, sin reescribir nada de lo que ya está.
  - **Hecho:** tres notas fechadas el 2026-10-08 con referencia a QC-180.
- [x] **T7** Cierre. Depende de T1 a T6.
  - Comprobar con `git diff --name-only origin/dev...HEAD` que no hay nada bajo `app/` ni `lib/` (R11).
  - Correr `./init.sh` y dejarlo en verde.
  - Escribir en `progress/impl_QC-180-rojos-heredados-de-alta-de-grupos.md` el mapa `R<n> -> test`:
    - R1 → `scope.test.ts`;
    - R2 → `module-contract.test.ts`;
    - R3 y R5 a R7 → `pantallas-exigen-permiso.test.tsx` (casos `it.each(PAGINAS)` de `/pedidos`);
    - R4 → comparador del gate completo y diff de T5;
    - R8 y R9 → los dos guardianes más la evidencia de mutación de T4;
    - R10 → las dos constantes de T2 y T3;
    - R11 → el diff de la rama y los tests de `tests/unit/pedidos-ui/` sin cambios.
  - **Hecho:** `./init.sh` en verde y mapa completo, con todos los `R<n>` cubiertos.

## Archivos esperados

- `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`
- `tests/unit/recetas/scope.test.ts`
- `tests/unit/recetas/module-contract.test.ts`
- `tests/baseline-rojos.json`
- `specs/QC-25-crud-de-recetas/requirements.md`
- `specs/QC-24-modelo-recetas/requirements.md`
- `specs/QC-35-pantalla-de-pedidos/requirements.md`
- `specs/QC-180-rojos-heredados-de-alta-de-grupos/requirements.md`
- `specs/QC-180-rojos-heredados-de-alta-de-grupos/design.md`
- `specs/QC-180-rojos-heredados-de-alta-de-grupos/tasks.md`
- `progress/impl_QC-180-rojos-heredados-de-alta-de-grupos.md`
- `progress/features/QC-180.md`
