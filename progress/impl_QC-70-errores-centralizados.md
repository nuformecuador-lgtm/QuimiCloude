# QC-70 — errores-centralizados · bitácora de implementación

> Fase F2.1. Spec aprobado por el humano el 2026-09-08. Rama
> `feature/QC-70-errores-centralizados`, worktree propio, base `QuimiCloude_QC70`.
> **Las 16 tasks están cerradas.** Esta bitácora no se autoaprueba: decide el reviewer.

## Commits

| Hash | Tanda |
|---|---|
| `d48cb07` | T1-T3 — el catálogo de 25 entradas, el traductor único y su guardia |
| `8df987b` | T4-T8 — los cinco módulos migrados |
| `aa40bd9` | T10-T14 — las once pantallas, más T9 y el barrido |
| `bd58a60` | T15 — el E2E del error que no es de dominio |

## Lo que se construyó, contado

- **Un** catálogo, `lib/modules/errores/`, con **25 entradas** (código -> clave -> texto, español
  como único idioma cargado). Módulo nuevo y no `lib/shared/**` porque `domain/**` no puede
  importar `lib/shared/**` y sí el barrel de otro módulo: es el único sitio desde el que las
  cinco familias pueden leer su mensaje **al construirse**, que es lo que R7 exige.
- **Una** implementación del traductor, `createErrorStateTranslator(base, log?)`, parametrizada
  por la clase base de cada módulo — patrón de QC-54. **Las siete copias de `toErrorState` han
  desaparecido**: no queda ninguna `function toErrorState` en `lib/**`.
- **Cinco** módulos migrados y **once** archivos de UI actualizados.
- **Una** guardia con nueve comprobaciones, cada una con caso que muerde y caso limpio.

## Mapa `R<n> -> test`

| Req | Test |
|---|---|
| R1 | `tests/unit/errores/catalogo.test.ts > R1 — un codigo, una clave, un texto` |
| R2 | `catalogo.test.ts > R2 — el catalogo es cerrado` (tres `@ts-expect-error`) |
| R3 | `catalogo.test.ts > R3 — palabra estable, nunca un numero` |
| R4 | `catalogo.test.ts > R4 — dos codigos no pueden compartir texto` + `guard-catalogo-de-errores.test.ts > caso 6` |
| R5 | `catalogo.test.ts > R5 — codigo -> clave -> texto, sin ninguna dependencia` |
| R6 | `guard-catalogo-de-errores.test.ts > caso 4 — familia por modulo` (+ caso real, T9) |
| R7 | `guard-catalogo-de-errores.test.ts > caso 3 — mensaje sobreescribible` (+ caso real) |
| R8 | `guard-catalogo-de-errores.test.ts > caso 1 — codigo fuera del catalogo` (+ caso real) |
| R9 | `guard-catalogo-de-errores.test.ts > caso 5 — entradas huerfanas` (+ caso real) |
| R10 | `guard-catalogo-de-errores.test.ts > caso 2 — traductor duplicado` (+ caso real) |
| R11 | `tests/unit/errores/to-error-state.test.ts > R11` |
| R12 | `to-error-state.test.ts > R12, R13` + los 15 casos reescritos de las suites de acciones |
| R13 | `to-error-state.test.ts > R12, R13` (el texto de Prisma no aparece en ningun campo) + `e2e/errores.spec.ts` |
| R14 | `to-error-state.test.ts > R14 — el error original va al registro del servidor, y solo ahi` |
| R15 | `to-error-state.test.ts > R15 — la referencia esta declarada, opcional, y QC-70 no la rellena` |
| R16 | `catalogo.test.ts > R16 — los genericos ya no existen` + `guard > caso 7` |
| R17 | `catalogo.test.ts > R17 — cada caso de «no existe» tiene su codigo` |
| R18 | `catalogo.test.ts > R18 — cada caso de «nombre repetido» tiene su codigo` |
| R19 | `catalogo.test.ts > R19 — los codigos inequivocos no se renombran` |
| R20 | `guard > caso 7` (barrido real de `app/**` y `components/**`) + las suites de UI: `proveedores-ui/supplier-page`, `supplier-detail-page`, `catalog-line-sheet`, `recetas-ui/recipe-form`, `configuracion-ui/presentation-sheet`, `delete-presentation-dialog`, `inventario/product-page` |
| R21 | `pedidos-ui/cancel-order-dialog.test.tsx`, `pedidos-ui/order-form.test.tsx`, `configuracion-ui/delete-presentation-dialog.test.tsx` |
| R22 | `guard > caso 1`, casos «muerde» y real |
| R23 | `guard > caso 2`, casos «muerde» y real |
| R24 | `guard > caso 3`, casos «muerde» y real |
| R25 | `catalogo.test.ts > R25 — identity se queda fuera`, mas el diff vacio de `db/` y `lib/modules/identity/` |
| R26 | `tests/guards/guard-autorizacion-por-permiso.test.ts` y las suites de `actor.ts` de los cinco modulos, verdes sin tocar |
| R27 | las 128 suites de los cinco modulos verdes (1.703 casos) mas las de UI |
| R28 | `to-error-state.test.ts > R28, R29`; `pedidos/order-transitions.test.ts`; `unidades/domain/convert-quantity.test.ts` |
| R29 | `to-error-state.test.ts > R28, R29` (`JSON.stringify(state)` sin el diagnostico; `Object.keys(state)` contenido en los cuatro campos) + `guard > caso 9` |
| R30 | `guard > caso 8` (lee la **declaracion** del tipo; el caso que muerde le anade `diagnostic: string`) y `guard > caso 9` |
| R31 | `proveedores-ui/supplier-page.test.tsx`, `recetas-ui/recipe-form.test.tsx`, `inventario/product-page.test.tsx` |
| R32 | los cuatro sitios corregidos, con test: `supplier-page`, `catalog-line-sheet`, `inventario/product-page`, `recetas-ui/recipe-form` |
| R33 | `e2e/errores.spec.ts` |

## Lo que corri, con su salida

```
$ pnpm run typecheck          ->  tsc --noEmit, sin salida (verde)
$ pnpm run lint               ->  eslint, sin salida (verde)

$ pnpm exec vitest run tests/guards/guard-catalogo-de-errores.test.ts
   Test Files  1 passed (1)
        Tests  31 passed (31)          <- cero skips: T9 desmarco el bloque real

$ pnpm exec vitest run tests/unit/{inventario,pedidos,proveedores,recetas,unidades,errores}
   Test Files  128 passed (128)
        Tests  1703 passed | 9 skipped (1712)

$ pnpm exec playwright test e2e/errores.spec.ts
   OK [chromium] la pantalla sigue en pie, muestra el mensaje neutro de `unexpected`
      y no filtra ni un detalle interno (R33, R13)   (26.5s)
   OK [webkit]   idem                                 (27.5s)
   2 passed (1.3m)

$ ./init.sh --rapido
   Test Files  1 failed | 122 passed (123)
        Tests  2 failed | 1599 passed (1601)

$ git diff --stat origin/dev...HEAD -- db/ lib/modules/identity/ package.json
   (vacio)
```

### El unico rojo, y por que no es de esta ficha

`tests/unit/navegacion/private-layout-menu.test.tsx` falla en dos casos. **Es rojo de
`origin/dev`, no de QC-70**, y no se dio por intermitente sin comprobarlo:

- Falla tambien **aislado y en 6,5 s**, con la maquina descargada: no es un timeout bajo carga.
- Su grafo de imports (`app/(private)/layout`, `lib/modules/identity`,
  `lib/shared/navigation/private-nav`, los dos helpers) **no contiene un solo archivo que QC-70
  toque**.
- Prueba directa: con el arbol en `--detach origin/dev` (`d26d09e`), el mismo test da los
  **mismos 2 fallidos / 6 pasados**.

## Lo que decidi sin respaldo del spec

1. **El E2E: el camino resulto alcanzable, y se confirmo ANTES de escribir el caso**, como
   `design.md > 6 ter` exigia. `EditarRecetaPage` pasa el `id` de la URL intacto a
   `getRecipeAction` -> `findAliveRecipeById` -> `prisma.recipe.findFirst({ where: { id } })`, y
   `Recipe.id` es `@db.Uuid`. Medido contra `QuimiCloude_QC70`: `PrismaClientKnownRequestError`
   `P2023`, «Inconsistent column data: Error creating UUID». **No se anadio ningun `throw` en
   produccion.**
2. **R32 alcanzaba a cuatro sitios, no a los dos que contaba `design.md > 6 bis`.** Ademas de
   `supplier-form.tsx:211` y `presentation-select.tsx:259`, sustituian el mensaje del back
   `catalog-line-form.tsx` (`DUPLICATE_CATALOG_LINE_MESSAGE`) y `formulas/[id]/page.tsx`
   (`NOT_FOUND_MESSAGE`). R32 es normativo y general («ninguna pantalla»), asi que se corrigieron
   los cuatro. **El censo del design estaba incompleto; la decision no.**
3. **`presentation-select.tsx` pierde la comparacion en vez de migrarla.** El componente tiene un
   solo hueco de error, asi que en cuanto el texto es siempre `result.message` el `if` no decide
   nada y seria rama muerta. Se cumplio R32 (normativo) sobre la fila 7 de `design.md > 4.3`
   (descriptiva). El efecto observable —que el error del nombre repetido siga junto al campo— lo
   fija un caso nuevo en `inventario/product-page.test.tsx`.
4. **`recipe-prisma.ts` y el contrato de ruta de recetas.**
   `tests/unit/recetas-ui/recipe-route-contract.test.ts` congela `lib/modules/recetas/`. QC-70 lo
   rompia por **un** archivo, y ese archivo **no cambia una linea de codigo**: solo dos
   comentarios que nombraban `DuplicateNameError`, clase que ya no existe. Se aplico el retensado
   que el propio archivo prescribe (precedentes QC-34, QC-47, QC-74): se nombra el archivo uno a
   uno con el motivo escrito. La alternativa era dejar en el repositorio el nombre de una clase
   muerta.
5. **Los tests del relanzado se reescribieron sin relajar nada.** Eran 15 casos en seis suites.
   Cada uno pasa de `rejects.toBe(ajeno)` / `rejects.toThrow(...)` a afirmar el estado
   `unexpected` **mas** que el texto interno no aparece en ningun campo del estado **mas** que el
   error original si llega al log (R14). Lo que fijaban antes queda fijado mas fuerte.
6. **`ErrorState` entero en los siete adaptadores** en vez de una forma a medida por modulo:
   `design.md > 4.2` dice que devuelven `ErrorState`. Efecto: los estados ganan el `reference?`
   de QC-71 en el tipo, nunca relleno (R15).
7. **`CODE_TO_FIELD` se tipa `Partial<Record<ErrorCode, ...>>`**, no `Record` completo: el mapa es
   deliberadamente incompleto y un `Record` exigiria las 25 entradas.
8. **`'not_found'` sigue vivo en `lib/**`, y debe seguir.** Los `Promise<'ok' | 'not_found'>` de
   los puertos de repositorio son **discriminantes de resultado**, no codigos de error; el
   dominio los traduce a la clase que toca. El caso 7 de la guardia acota su barrido a `app/**` y
   `components/**` justamente por eso.
9. **`presentation-form.tsx` ya venia con CRLF desde `dev`** (385 lineas). Se conservo:
   normalizarlo convertia un diff de 17/10 en uno de 392/385. Todo lo demas va en LF.
10. **El E2E prohibe `recipe_lines` pero no `recipes` a secas.** `recipes` aparece legitimamente
    en rutas y `data-testid` de la propia pantalla; se prohibio el nombre de tabla que no puede
    aparecer por otra via. Si el reviewer quiere el criterio estricto, habria que renombrar
    testids.

## Para el leader: el choque con QC-39

QC-70 renombra **dos** literales de `unidades` que la pantalla de QC-39 consume:

| Valor viejo | Valor nuevo |
|---|---|
| `duplicate_name` | `unit_duplicate_name` |
| `not_found` | `unit_not_found` |

Los siete codigos restantes de `unidades` conservan su valor. Los archivos de QC-39
(`app/(private)/configuracion/unidades/**`, `tests/unit/configuracion-ui/**`) **siguen sin existir
en `dev` a dia de hoy**, asi que el merge saldra limpio y el fallo aparecera **en pantalla, no en
el gate**. El diff de `lib/modules/unidades/index.ts` se dejo en **dos lineas** para que el merge
sea trivial.

## Deuda anotada, sin ficha

- `product-prisma.ts` traduce la violacion de FK del **autor** (`created_by`/`updated_by`) a
  `ProductNotFoundError`, siguiendo la tabla de `design.md > 4.1`. El mensaje que ve el usuario
  («El producto solicitado no existe.») no es exacto para ese caso. Ninguna pantalla distingue
  hoy los dos, y abrir un codigo para algo que nadie muestra habria sido inventar. Queda dicho.
- `tests/unit/navegacion/private-layout-menu.test.tsx` esta rojo en `dev`.

## Deuda de arnés que esta ficha destapó (y que no le tocaba)

El **gate completo** salió rojo con dos archivos que `--rapido` no selecciona, y **ninguno es un
fallo de QC-70**: son centinelas de alcance de otras fichas que miden
`git diff origin/dev...HEAD` sin comprobar que están en **su** rama, así que declaran intocable lo
que otras fichas sí tocan con permiso del humano. Como el gate completo es obligatorio antes de
cada PR (regla 5 de `CLAUDE.md`), un centinela sin dueño bloquea el cierre de todo el repo.

Arreglados en el commit `d88c60b`, **aparte** de los de QC-70, aplicando el precedente exacto de
`7cd478b` («el centinela de QC-75 solo muerde en su rama»):

| Guardia | Ficha | Qué le mordía a QC-70 |
|---|---|---|
| `tests/unit/identity/account-status-scope.test.ts` | QC-65 | R20 exige que el diff no toque `app/`. QC-70 toca once archivos de `app/` por decisión cerrada: 18 rutas «prohibidas» que no lo eran. |
| `tests/unit/unidades/unidades-convenciones.test.ts` | QC-38 | R34 exige que `e2e/` no gane ningún `.spec.ts`. QC-70 añade `e2e/errores.spec.ts` porque su R33 lo pide. |

Además, **el centinela de QC-38 se retensó**: un archivo solo no identificaba su rama, porque
QC-70 sustituye la copia de `toErrorState` de **los siete** adaptadores driving del repo,
`unit-actions.ts` incluido. La guardia se creía en la rama de QC-38 estando en la de QC-70. Ahora
exige también `ports/unit-write-repository.ts`.

En su propia rama ninguna de las dos cambia de comportamiento, y no se afirma: se prueba con casos
sintéticos sobre funciones puras (`infraccionesDeAlcance`, `nuevosSpecsE2e`, `esRamaDeQC38`,
`esLaRamaDeQC65`), en los dos sentidos.

**No se tocó `tests/baseline-rojos.json`**: listar un archivo ahí lo apaga **entero** para el
comparador y en todas las ramas, incluidas sus comprobaciones legítimas. El propio baseline
documenta ese coste desde el 2026-09-04.

### El tamaño real del patrón: cinco guardias, quedan dos

| # | Guardia | Ficha | Estado |
|---|---|---|---|
| 1 | `tests/unit/navegacion/qc75-convenciones.test.ts` | QC-75 | arreglada en `7cd478b` |
| 2 | `tests/unit/identity/account-status-scope.test.ts` | QC-65 | arreglada en `d88c60b` |
| 3 | `tests/unit/unidades/unidades-convenciones.test.ts` | QC-38 | arreglada en `d88c60b` (R32 ya lo estaba; R34 no, y el centinela se retensó) |
| 4 | `tests/unit/recetas-ui/recipe-route-contract.test.ts` | QC-26 | **sin arreglar** — apagada entera en el baseline desde el 2026-09-04 |
| 5 | `tests/unit/recetas/module-contract.test.ts` | QC-26 | **sin arreglar** — apagada entera en el baseline desde el 2026-09-04 |

Las dos que quedan son de QC-26, ya pagan el coste de estar apagadas enteras, y **el propio
baseline nombra la salida limpia como pendiente**: que el caso del diff distinga «no hay rango» de
«el rango trae cosas de otra ficha», y borrar la entrada. **No se arreglaron aquí**: son deuda de
otra ficha y la decisión es del leader. Un síntoma más de lo mismo: QC-70 tuvo que retensar la
número 4 con una lista nombrada (`RENOMBRADO_DE_COMENTARIOS_QC70`) por dos comentarios.
