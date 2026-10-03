# QC-194 — herramientas-de-la-receta · review

## Vuelta 1 (diff `origin/dev...fca2206a`)

Grafo de código: no usado; exploración con Grep/Read/git diff sobre el worktree.

### Verificación ejecutada por el reviewer

- `pnpm run typecheck`: limpio.
- `eslint` sobre los `.ts/.tsx` añadidos o modificados del diff: 0 errores.
- `vitest run` de `tests/guards`, `tests/unit/recetas/{recipe-tools,recipe-version,recipe-input,recipe-catalog}.test.ts`,
  `tests/unit/recetas/schema`, `tests/unit/recetas-ui`, `tests/unit/asignaciones/get-assigned-order-execution.test.ts` y
  `tests/unit/asignaciones-ui/order-execution-tools.test.tsx`: 81 archivos, 1325 verdes, 1 rojo
  (`recetas-ui/recipe-page.test.tsx > R21`, listado en `tests/baseline-rojos.json`, deuda ajena).
- Integración contra Postgres efímero: `recetas/recipe-tools`, `pedidos/order-reservation-tools`,
  `documentos/formula-import`, `recetas/recipe-versions-repository`, `recetas/recipe-lines`:
  5 archivos, 46 casos verdes.
- `package.json` y lockfile fuera del diff (R34).

### Checklist

| # | Punto | Estado |
|---|---|---|
| 1 | Trazabilidad R1–R34 → test | OK. Todos tienen un test real (tabla abajo). R34 lo cubren `guard-dependencias-aprobadas.test.ts` y el `package.json` sin cambios (`design.md > 10`), pero no está en el mapa de la bitácora (m1). |
| 2 | Tasks `[x]` | T0–T12 `[x]`. **T13 sin marcar** (m1): incluye el `./init.sh` completo, que corre el leader. |
| 3 | CHECKPOINTS | Ver abajo. |
| 4 | Verificación ejecutable | OK (arriba). |
| 5 | Calidad / seguridad | `recipe_tools` con RLS `ENABLE` + `FORCE`; la FK de producto RESTRICT y el CHECK `quantity > 0` van a mano; hay `down.sql`; sin secretos ni hardcode de entorno; sin webhooks. |
| 6 | Multiplataforma | OK. El campo de cantidad lleva `min-h-11 min-w-11`, `text-base` e `inputMode="numeric"`. El bloque del operador no tiene controles y va en `text-base`. Sin `100vh` ni `:hover` nuevos. |
| 7 | Dependencias | OK. No se añade ninguna. |
| 8 | Aislamiento por empresa | OK. `recipe_tools` es exenta por decisión humana de F1.4 y figura en `EXENTAS` (nueve) y en `docs/architecture.md > Dominio`. Las escrituras van tras el `updateMany` acotado por empresa y su salida temprana, que vigila la guardia ampliada. Las lecturas cuelgan de la lectura acotada de la receta. Falta un caso cruzado específico de herramientas (m3). |
| 9 | Comentarios | OK. Ninguna línea añadida en `app/`, `lib/` o `db/` cita `QC-`, `R<n>`, `design.md` ni «decisión cerrada». |

#### CHECKPOINTS.md

- Especificación: requirements (EARS, R1–R34), design (alternativa descartada en §11) y tasks. OK salvo T13 (m1).
- Trazabilidad: OK (m1 por el mapa sin R34 y repartido en tres tandas).
- typecheck y lint: OK. `pnpm test` lo corre el leader con `./init.sh`; lo ejecutado aquí sale verde salvo el baseline.
- E2E: no aplica por decisión humana (P2). R8–R10 se prueban por integración contra Postgres real, verificado.
- Multiplataforma: OK. Dependencias: ninguna.
- Datos y seguridad: tabla exenta aprobada. Los permisos se validan en el service con test (R32: 8 casos de escritura más el operador). RLS + FORCE. Acceso solo por Prisma. La migración tiene `down.sql` (el implementer midió el rollback). Sin secretos ni webhooks.
- Hexagonal: `domain/recipe-tools.ts` importa solo `@/lib/modules/inventario` (el contrato). `asignaciones` lee `RecipeExecutionContent` del barrel de `recetas`. `RecipeTool` lleva `/// @module recetas`. Guardias en verde.
- Permisos: ninguna página añade un permiso nuevo; las mutaciones van por las Server Actions que ya existían.
- Verificación final: el `./init.sh` completo, `history.md` y el desmontaje del worktree son del leader.

### Mapa R → test (comprobado)

| R | Test |
|---|---|
| R1 | `recipe-tools.int` «R1: el alta guarda…», «R1: replaceAlive con herramientas…»; `recipe-input` R1; `recipe-tools-migration` R1 |
| R2 | `recipe-tools.int` R2; `recipe-tools.test` R2; `recipe-input` R2 |
| R3 | `recipe-tools.test` (4 casos R3); `recipe-tools.int` R3 |
| R4 | `recipe-input` R4 (2); `recipe-tools-migration` R4 (único compuesto) |
| R5 | `recipe-tools.test` R5 (3); `recipe-tools.int` R5 (FK → ValidationError) |
| R6 | `recipe-input` R6 (5 valores); `recipe-tools-migration` R6 (CHECK) |
| R7 | `recipe-input` R7; `recipe-version.test` «R7, R16» |
| R8, R9 | `order-reservation-tools.int` «R8, R9» (crear, revisar bloqueados, pasar a curso, Finalizar); `recipe-catalog.test` R8 |
| R10 | `order-reservation-tools.int` R10 |
| R11 | `recipe-tools.test` R11 (2); `recipe-tools.int` R11; `recipe-input` R11 |
| R12 | `recipe-tools.test` R12 |
| R13 | `recipe-tools.int` R13; `recipe-tools.test` «R13, R19» |
| R14 | `recipe-version.test` (8 casos de `propagateTools`); `recipe-tools.int` «R14, R15»; `recipe-tools.test` R14 |
| R15 | `recipe-tools.int` R15 (versionId inválido; fallo forzado por trigger) |
| R16 | `recipe-version.test` «R7, R16» |
| R17 | `recipe-tools.int` R17 (2); `recipe-tools.test` R17 (3); `recipe-input` R17 (2) |
| R18 | `formula-import.int` R18 (2) |
| R19, R21 | `recipe-tools.int` «R19, R21»; `recipe-tools.test` R19 (2) |
| R20 | `recipe-tools.test` R20; `recipe-lines-field-tools` R20 |
| R22 | `recipe-form-state`, `recipe-lines-field-tools`, `recipe-form`, `recipe-version-pages`, `recipe-tools.test` |
| R23 | `recipe-form-state`, `recipe-version-pages`, `recipe-version-form` |
| R24 | `recipe-lines-field-tools` R24 (3) |
| R25 | `recipe-form-state` (3), `recipe-lines-field-tools` (3), `recipe-form` (2), `recipe-version-form` (1) |
| R26 | `recipe-form-state` (3), `recipe-lines-field-tools` (suma), `recipe-form` (2), `recipe-version-form` (2) |
| R27 | `recipe-form` R27; `recipe-version-form` R27 |
| R28 | `order-execution-tools` (3); `get-assigned-order-execution` (3); `recipe-catalog.test` R28 |
| R29 | `order-execution-tools` R29; `get-assigned-order-execution` R29 |
| R30 | `order-execution-tools` R30; `get-assigned-order-execution` R30 |
| R31 | `order-execution-tools` R31 (2); `get-assigned-order-execution` R31 |
| R32 | `recipe-tools.test` R32 (8); `get-assigned-order-execution` R32 |
| R33 | `recipe-lines-field-tools` R33; `order-execution-tools` R33 |
| R34 | `tests/guards/guard-dependencias-aprobadas.test.ts`; `package.json` fuera del diff |

### Los cinco puntos que pidió el leader

1. **Sin `replaceToolsOn`; guardia ampliada.** La ampliación no debilita la guardia: la endurece.
   - `violacionesDeTransaccion` prohíbe ahora también `prisma.recipeTool.`.
   - El nuevo `violacionesDeHerramientas` se aplica a `replaceAliveRecipe` y a `replaceAliveRecipeWithPropagation`. Exige que cada `tx.recipeTool.*` vaya tras el `updateMany` acotado (con `...recipeCompanyScope(scope)`) y su salida (return not_found / throw), que filtre por `recipeId: id|versionId` y que no mencione `companyId`.
   - Las cuatro mutaciones anti-placebo están en verde.
   - El barrido del parámetro `scope` no gana excepciones. Escribir en línea evitó justo la exención que habría pedido un helper sin `scope`.
   - `createRecipe` y `createRecipeVersion` usan un `create` anidado bajo la receta, que no necesita esa regla.
   - Coste: el par `deleteMany`+`upsert` queda escrito tres veces (m4).
2. **Repetida con path [tools].** Cumple R25 y R27.
   - R25 trata la fila sin herramienta o con cantidad inválida. Esos issues sí llevan path [tools, i, campo] y se pintan en la fila (tests R25).
   - La repetida es R4, del servidor. En el formulario no puede darse porque el selector excluye las ya elegidas (R24). Si llegara, se pinta como error general del tab (`recipe-machines-error`, con role alert).
   - Un rechazo del servidor sale en la región de error (R27, con test).
   - La discrepancia con `design.md > 7` consta en `contrato-back.md` pero no en `design.md` (m5).
3. **`23503` → `invalid_input`.** Justificado y dentro del diseño.
   - `design.md > 4` ya pedía traducir la FK de producto a `ValidationError` «como ya pasa con las líneas». La premisa era falsa: con las líneas no pasaba.
   - El cambio en las líneas no tiene test propio.
   - El comentario de `isProductForeignKeyViolation` afirma que «solo puede ser un producto», y eso no se puede verificar para `createdBy`/`updatedBy` ni para `parentRecipeId` en `createRecipeVersion` (m2).
4. **Payload de versión `{name, lines}` → `{name, lines, tools}`.** Correcto. R26 exige que el envío lleve exactamente las herramientas del tab, y `design.md > 7` que el formulario mande siempre la clave.
5. **D1 por construcción.** Confirmado.
   - `lib/modules/pedidos` y `lib/modules/inventario` quedan fuera del diff.
   - `RecipeExecutionContent.lines` no cambia; las herramientas van en el campo aparte `tools`, y `toRecipeExecutionContent` solo las mapea a ese campo.
   - `get-assigned-order-execution` deja de pedir unidades de productos que no son líneas. Es un efecto colateral correcto.
   - La integración prueba 0 asientos sobre el lote de la herramienta, el stock intacto, ningún bloqueo por la máquina sin stock y el mismo costo.

### Hallazgos

- **m1 — menor.** `tasks.md > T13` sin `[x]`, y la bitácora no tiene el mapa consolidado R1–R34: está repartido en tres tandas y R34 no figura. El `./init.sh` completo de T13 es del leader; el mapa es del implementer. La ficha no puede pasar a `done` hasta que T13 esté marcada.
- **m2 — menor.** `translateWriteError` convierte todo `23503`/`P2003` en `ValidationError`, también en las líneas, sin un test que fije el caso de línea. El comentario de `isProductForeignKeyViolation` (`recipe-prisma.ts`) da un motivo no verificable: «la receta, la empresa y el autor ya están probados, así que solo puede ser un producto». Un fallo de la FK de autor o de `parent_recipe_id` también saldría como `invalid_input`.
- **m3 — menor.** Falta un caso cruzado específico de herramientas: `replaceAlive` o `replaceAliveWithPropagation` desde otra empresa sobre una receta con herramientas, afirmando que quedan intactas. El acceso cruzado está cubierto en general (`company-scope-queries.int`, que ahora pasa `tools: []`) y la guardia estructural garantiza el orden. Se pide para que el test pruebe algo más que `[]`.
- **m4 — menor.** El par `deleteMany`+`upsert` de `recipeTool` aparece tres veces en `recipe-prisma.ts`. En `replaceAliveRecipeWithPropagation` (original), el `create` va en una sola línea larga, con un formato distinto al de los otros dos.
- **m5 — menor.** Las desviaciones de `design.md > 4` (sin `replaceToolsOn`) y `> 7` (repetida con path [tools]) solo constan en la bitácora y en `contrato-back.md`. `design.md` sigue describiendo lo que no se hizo.
- **m6 — menor.** R8 dice «se crea, se edita o se revisa». La integración cubre crear y revisar bloqueados, pero no editar el pedido (`update-order`). Hoy queda cubierto por construcción (`update-order` solo lee `content.lines` y no está en el diff), pero ningún test lo afirma.
- **m7 — menor.** En `order-execution-tools.tsx`, el JSDoc del componente está encima de las constantes y no de `OrderExecutionTools`.

Nota: `git status` marca `lib/modules/recetas/adapters/driven/persistence/recipe-prisma.ts` como modificado sin diff de contenido (fin de línea o modo). Queda fuera de la revisión y no se commitea.

### Veredicto

**OK** — sin bloqueantes. Hay 7 menores. m1 debe cerrarse (T13 `[x]` + mapa consolidado) tras el `./init.sh` completo del leader y antes de `done`.
