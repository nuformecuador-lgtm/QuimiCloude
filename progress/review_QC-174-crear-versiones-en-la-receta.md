# Review QC-174 — crear-versiones-en-la-receta

Reviewer · 2026-10-02 · rama `feature/QC-174-crear-versiones-en-la-receta`, HEAD `6f62128b`, comparada con `origin/dev`.
Grafo de codigo: no usado (revision por diff + Grep/Read; el diff es acotado a `formulas/` y un adaptador).

## Checklist

### Especificacion
- [x] `requirements.md` con R1-R39 en EARS; P1 resuelta en (a) y aprobada en F1.4.
- [x] `design.md` con alternativas (P1 (b) descartada con su porque).
- [x] `tasks.md`: 60 `[x]`, ningun `[ ]`.

### Trazabilidad
- [x] Mapa R1-R39 -> test en `progress/impl_...md > T12`. Muestreados y leidos: R5, R7 (`recipe-form.test.tsx`), R24-R31 y R37 (`recipe-form-propagation.test.tsx`), R29 servidor (`recipe-actions.test.ts`, `toStrictEqual` con `propagated`), R32-R35 (`delete-recipe-dialog.test.tsx`), R36 (contrato de ruta + guardia de pantallas), R38 (E2E con lecturas Prisma de las lineas y conteo de enlaces «por revisar»). Ninguno vacio.

### Verificacion ejecutable (corrida por el reviewer)
- [x] `./init.sh --rapido`: typecheck OK, lint OK, guardias OK. 4 archivos rojos (`unidades-viewport`, `usuarios-viewport`, `product-page`, `recipe-page` R21), **los cuatro en `tests/baseline-rojos.json`**: no son hallazgo.
- [x] `vitest run` de los 28 archivos de la ficha y los tocados por arrastre: 517/518; el unico rojo es `recipe-page.test.tsx` R21 (baseline).
- [x] E2E: logs `progress/e2e_QC-174_{chromium,webkit}.log` -> `1 passed` en ambos. No re-ejecutado (sin suite completa, por instruccion).
- [x] Gate completo del implementer: `init OK`, 5 rojos todos en baseline. No re-ejecutado por instruccion del leader; debe repetirse antes del PR (regla 5).

### Calidad y seguridad
- [x] Sin tablas ni migraciones nuevas; sin cambios en `db/schema.prisma` (punto 8 no aplica a esquema).
- [x] Permisos: las dos paginas nuevas llaman `requirePagePermission('recetas.consultar')` antes de `params` y de leer datos; escritura delegada al caso de uso (`recetas.modificar`, QC-172 R38). La pantalla no añade regla propia (R36).
- [x] Aislamiento por empresa: las lecturas pasan por `getRecipeAction`/`listRecipeVersionsAction` (QC-172, ya filtradas por empresa); la pagina de version comprueba ademas que `version.original.id === id` y que `[id]` sea original -> «no encontrada».
- [x] Unico toque de servidor: `updateRecipeAction` devuelve `propagated` (P1 (a)); dominio, puerto y base intactos. Test añadido.
- [x] Sin secretos ni hardcode de contexto; rutas derivadas de `recipeEditRoute` en `lib/shared/routes.ts`.
- [x] Capas: paginas leen por Server Actions y pasan props; componentes cliente solo invocan Server Actions.

### Multiplataforma
- [x] Sin `100vh` (el aviso usa `max-h-[85dvh]` con scroll interno); sin `:hover` como unica via.
- [x] Targets de 44 px (`min-h-11 min-w-11`) en enlaces, botones, casillas y filas nuevas; probado (R37).
- [x] Campo de texto nuevo (nombre de version) en `text-base` (16 px).
- [x] Sin librerias de UI nuevas.

### Dependencias
- [x] `package.json` / `pnpm-lock.yaml` sin cambios; `guard-dependencias-aprobadas` verde (R39).

### Comentarios (lineas añadidas en produccion)
- [x] Ninguna linea añadida en `app/` ni `lib/` cita `QC-<n>`, `R<n>`, `design.md` ni «decision cerrada» (grep sobre `git diff -U0`).

## Desviaciones declaradas: juicio
1. `recipe-route-contract.test.ts` ampliado: **aceptada**. Las listas siguen cerradas (diez operaciones exactas; subcarpetas exactas `versiones/{nueva,[versionId]}`); la excepcion de `step-document-view` descuenta solo ese import exacto en ese archivo y sigue prohibiendo `StepReader`. Endurece, no relaja.
2. Tests ajenos tocados por arrastre: **aceptada**. Altas en listas cerradas de E2E y mocks de la accion nueva; la guardia de pantallas pasa de 17 a 19 con las dos rutas nombradas, sin aflojar el criterio.
3. R5/R7 en `recipe-form.test.tsx`: **aceptada** (monta `EditarRecetaPage`; prueba redirect sin formulario y error de versiones sin formulario). La lectura de versiones en el `Promise.all` con id de version se descarta antes de usarse; coste de una peticion, documentado en un comentario.
4. R21 `inert` solo como atributo en jsdom: **aceptada como limite de entorno** (ver menor m2).
5. Textos no fijados por el spec: **aceptada** (ver menor m1).
6. E2E comprueba «por revisar» por la suma: **aceptada**; es literalmente lo que pide R38 («suma de lineas distinta de 100,00 %») y la base no guarda la marca.

## Hallazgos
- **m1 (menor)** — Al borrar una version el toast sigue diciendo «Receta borrada.» (`delete-recipe-dialog.tsx`, `DELETE_SUCCESS`) mientras el titulo dice «Borrar versión». No lo fija el spec; inconsistencia de texto.
- **m2 (menor)** — R21: que los pasos no se puedan cambiar se afirma por el atributo `inert`/`aria-readonly`; ni el unitario (jsdom) ni el E2E intentan pulsar una casilla de paso en navegador real. Cubierto por diseño, no por ejecucion.
- **m3 (menor)** — `delete-recipe-dialog.tsx` y `recipe-form.tsx`: se retiran bloques de comentario preexistentes (JSDoc de `DeleteRecipeDialog`, notas de `buildInitialState`) en el mismo commit que el cambio de codigo. Justificable porque el codigo que comentaban se reescribio/movio, pero es limpieza de comentarios mezclada con codigo.

## Veredicto
**OK** — 0 bloqueantes, 3 menores. Antes del PR, `./init.sh` completo (regla 5).
