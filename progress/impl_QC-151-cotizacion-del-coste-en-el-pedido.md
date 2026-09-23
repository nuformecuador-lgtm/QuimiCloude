# QC-151 — cotizacion-del-coste-en-el-pedido · bitácora de implementación

Implementer, 2026-09-23. Worktree `.worktrees/QC-151-cotizacion-del-coste-en-el-pedido`, rama
`feature/QC-151-cotizacion-del-coste-en-el-pedido`. Sin migraciones ni cambios de esquema.
Entorno: `pnpm install --frozen-lockfile`, `prisma generate` y `next typegen` en el worktree.

## Tasks y commits

| Task | Commit | Subagente |
|---|---|---|
| T1 esquema + caso de uso | `6f17f349` | backend_dev |
| T2 composición + autorización | `42e4aa37` | backend_dev |
| T3 Server Action | `23f39e4a` | backend_dev |
| T4 formateador | `5f0f4632` | frontend_dev |
| T5 hook + bloque (y barrel de T4/T5) | `722f591d` | frontend_dev |
| T7 integración | `05d7640d` | backend_dev |
| T6 formulario | `a4a2db45` | frontend_dev |
| T8 E2E | `3f490470` | frontend_dev |

## Archivos

Producción:
- `lib/modules/pedidos/domain/order-input.ts` (`quoteOrderCostSchema`, `QuoteOrderCostInput`)
- `lib/modules/pedidos/domain/quote-order-cost.ts` (nuevo)
- `lib/modules/pedidos/index.ts` (+4 líneas, sin reordenar); solapa con QC-141
- `lib/composition/index.ts` (+6 líneas: un import y `quoteOrderCost` al final de `pedidos`); solapa con QC-141
- `lib/modules/pedidos/adapters/driving/order-actions.ts` (`quoteOrderCostAction`, `OrderCostQuoteResult`)
- `app/(private)/pedidos/components/order-amount.ts` (nuevo)
- `app/(private)/pedidos/components/use-order-cost-quote.ts` (nuevo)
- `app/(private)/pedidos/components/order-cost-quote.tsx` (nuevo)
- `app/(private)/pedidos/components/index.ts` (+13 líneas)
- `app/(private)/pedidos/components/order-form.tsx` (+14/-1, solo añadidos); solapa con QC-141

Tests:
- nuevos: `tests/unit/pedidos/quote-order-cost.test.ts`, `tests/unit/pedidos-ui/order-amount.test.ts`,
  `tests/unit/pedidos-ui/order-cost-quote.test.tsx`, `tests/unit/pedidos-ui/order-form-quote.test.tsx`,
  `tests/integration/pedidos/order-cost-quote.int.test.ts`, `e2e/pedidos-cotizacion.spec.ts`
- modificados: `tests/unit/pedidos/order-input.test.ts`, `tests/unit/pedidos/authorization.test.ts`,
  `tests/unit/pedidos/order-actions.test.ts`, `tests/unit/pedidos-ui/pedidos-convenciones.test.ts`
  (línea de `ACCIONES`), `tests/unit/pedidos-ui/{order-form,pedidos-viewport}.test.tsx` (doble de
  `quoteOrderCostAction`), `tests/unit/pedidos-ui/order-sheet.test.tsx` (doble + ajuste, ver abajo),
  `tests/integration/aislamiento.json` (alta del int test nuevo),
  `tests/guards/guard-identificador-de-request.test.ts` (alta de `pedidos-cotizacion.spec.ts` en
  `E2E_ESPERADOS`).

## Desvíos respecto a design.md > 10 (para el reviewer)

1. `order-actions.test.ts` y `authorization.test.ts`: además de las filas previstas se actualizaron
   los conteos que una séptima acción rompe (`catches.length` 6->7, «exporta exactamente las
   siete», «hay cinco escrituras»). Se añade, no se quita ninguna aserción.
2. `order-sheet.test.tsx`, caso «la zona privada sigue teniendo EXACTAMENTE una region de avisos»:
   el bloque de coste siempre está montado (R9) y trae su `role="status" aria-live`, así que tras
   abrir el panel hay dos `[aria-live]`. En vez de relajar el conteo a 2, la aserción pasa a ser
   exacta: `region` sigue en 1; fuera de `order-cost-quote` hay exactamente 1 `[aria-live]` y dentro,
   exactamente 1. El design no preveía este archivo.
3. `guard-identificador-de-request.test.ts`: su lista cerrada de E2E obliga a dar de alta cualquier
   spec nuevo; se añadió la entrada con su comentario.
4. `aislamiento.json`: alta del int test nuevo (lo exige `guard-aislamiento-integracion`).

## Mapa R<n> -> test

| Req | Test |
|---|---|
| R1 | `tests/unit/pedidos/quote-order-cost.test.ts` (paridad con `orders.create`/`orders.updateAlive`, con `'40.0000'` y `null`), `tests/integration/pedidos/order-cost-quote.int.test.ts` |
| R2 | `quote-order-cost.test.ts` (solo tres lecturas; `@ts-expect-error` sobre `orders`), `order-cost-quote.int.test.ts` (conteos y stock intactos) |
| R3 | `quote-order-cost.test.ts`, `tests/unit/pedidos/authorization.test.ts`, `tests/unit/pedidos/order-actions.test.ts` |
| R4 | `authorization.test.ts` («exactamente esos dos códigos», «ningún código distinto», sin tocar), `tests/guards/guard-permisos-sembrados.test.ts` |
| R5 | `quote-order-cost.test.ts`, `order-actions.test.ts`, `tests/unit/pedidos/order-input.test.ts` |
| R6 | `quote-order-cost.test.ts`, `order-cost-quote.int.test.ts` |
| R7 | `quote-order-cost.test.ts`, `order-actions.test.ts` |
| R8 | `tests/unit/pedidos-ui/order-form-quote.test.tsx`, `tests/unit/pedidos-ui/order-columns.test.tsx` (caso existente, sin tocar) |
| R9 | `tests/unit/pedidos-ui/order-cost-quote.test.tsx`, `order-form-quote.test.tsx` |
| R10 | `order-cost-quote.test.tsx` |
| R11 | `order-cost-quote.test.tsx`, `order-form-quote.test.tsx`, `e2e/pedidos-cotizacion.spec.ts` (d) |
| R12 | `order-form-quote.test.tsx` |
| R13 | `order-cost-quote.test.tsx`, `order-form-quote.test.tsx` |
| R14 | `order-cost-quote.test.tsx`, `order-form-quote.test.tsx` |
| R15 | `order-cost-quote.test.tsx` (respuesta superada; en vuelo superada por el guion) |
| R16 | `order-cost-quote.test.tsx` |
| R17 | `order-cost-quote.test.tsx` (sin cifra; tras error) |
| R18 | `tests/unit/pedidos-ui/order-amount.test.ts` (tabla + fuente sin Intl/toLocaleString/parseFloat/toFixed/Number), `e2e/pedidos-cotizacion.spec.ts` (a, b) |
| R19 | `order-amount.test.ts`, `order-cost-quote.test.tsx` |
| R20 | `order-form-quote.test.tsx` (claves del FormData; Guardar habilitado en vuelo y con guion) |
| R21 | `order-cost-quote.test.tsx` (mensaje, UnexpectedErrorNotice, se limpia al acertar), `order-form-quote.test.tsx` (no bloquea guardar) |
| R22 | `e2e/pedidos-cotizacion.spec.ts` (local, sin red externa) |

## Salida de la verificación (solo lo relacionado; la suite completa y el gate son del leader)

- `pnpm run typecheck`: `tsc --noEmit` sin errores.
- `pnpm run lint`: `eslint` sin problemas.
- backend_dev, `vitest related` de T1-T3/T7: `184 files, 2837 passed, 4 skipped, 0 failed`.
  Integración dedicada `order-cost-quote.int.test.ts`: `4 passed`.
- frontend_dev, `vitest related` de T4/T5: `30 files, 394 passed, 5 skipped`; los dos archivos nuevos, 18/18.
- T6, 9 archivos de pedidos-ui + `guard-pantalla-pedidos-se-amplia`: `9 files, 154 passed, 2 skipped`.
- Guardias `vitest run tests/guards`: `42 files, 536 passed, 5 skipped`.
- Implementer, `vitest related --run` sobre order-form.tsx, order-form-quote, order-sheet, order-form,
  pedidos-viewport y guard-identificador-de-request:
  - 1.ª corrida: `Test Files 1 failed | 29 passed (30) · Tests 393 passed | 7 skipped (400)`, con
    carga concurrente del E2E; el archivo no quedó identificado.
  - 2.ª corrida: `Test Files 30 passed (30) · Tests 400 passed (400)`.
  - Posible intermitencia bajo carga: que la mire el gate.
- E2E `pnpm exec playwright test e2e/pedidos-cotizacion.spec.ts`: `2 passed (chromium + webkit), 45.1s`;
  sin filas `qc151_e2e_` después de la limpieza.
  - Nota: `pnpm run e2e -- e2e/pedidos-cotizacion.spec.ts` NO filtra en Git Bash/Windows (reenvía un
    `--` literal) y corrió la suite E2E entera por error: `93 passed, 31 failed` en specs ajenos
    (FK en limpiezas de huérfanos, probablemente por corridas concurrentes). No es de esta ficha, pero
    el comando documentado en tasks.md y docs/verification.md merece revisión.

## Ronda 2 — respuesta al review (`progress/review_QC-151-cotizacion-del-coste-en-el-pedido.md`)

Commits: `fa7f187c` (bloqueante + menores 1, 2, 3, 5) y `395ff106` (menor 4 + arreglo de
`recipe-picker.tsx`, aislado para poder revertirlo solo).

- Bloqueante: se quitan `QC-151:`, `(R1-R7)` y `(QC-151)` de los comentarios de `order-actions.ts` y
  `order-input.ts`. Contra el merge-base de la rama (`df8af4ec`) no queda ninguna cita `QC-\d+`/`R\d+`
  añadida en `lib/`, `app/` ni `components/`. `origin/dev...HEAD` saca ruido de otras fichas ya
  mergeadas en `dev`.
- Menor 1: `use-order-cost-quote.ts` gana un `.catch`. Si la acción se rechaza en el transporte y la
  petición sigue vigente, pasa a `error` `unexpected` (`errorMessage(UNEXPECTED_ERROR_CODE)` +
  `newRequestId()`) con `quoting: false`. Tiene un caso nuevo en `order-cost-quote.test.tsx`.
  `loadIngredients` de `order-form.tsx` no se toca.
- Menor 2: se quitan las citas de ficha y task en las cabeceras y comentarios de `order-input.test.ts`,
  `quote-order-cost.test.ts`, `order-cost-quote.int.test.ts`, `order-form-quote.test.tsx` y del alta en
  `guard-identificador-de-request.test.ts`. Las demás entradas de esa lista (QC-92, QC-147…) son
  preexistentes y no se tocan.
- Menor 3: en `authorization.test.ts`, `SEIS`/`SEIS_ARCHIVOS` pasan a `SIETE`/`SIETE_ARCHIVOS` y los
  textos a «siete». En `order-actions.test.ts`, «los siete `catch`». En ese archivo quedan otras
  menciones a «seis» que el review no listó (`const SEIS` local, «las seis actions»); se dejan.
  `design.md > 10` y `progress/impl_QC-74-*.md` siguen nombrando `SEIS` en prosa.
- Menor 4: la rama «elegir otra receta» de R12 en `order-form-quote.test.tsx` afirma ahora que el bloque
  pasa a `$ 30.00`. **Al escribirla apareció un defecto real, anterior a esta ficha**, en
  `recipe-picker.tsx`:
  - Pasa al elegir una receta DISTINTA a la ya elegida, es decir, en la edición.
  - El autocomplete dispara `onValueChange` con el nombre nuevo, pero `handleValueChange` compara
    contra `selectedName` del render anterior, así que retira la elección (`onSelect(null)`) y la
    cotización vuelve al guion.
  - Arreglo mínimo: un `selectedNameRef` síncrono. Es cambio de comportamiento fuera de los archivos
    del design; necesita visto bueno. Si no se acepta, se revierte `395ff106` entero.
- Menor 5: se reescriben los dos comentarios que repetían el código (`order-form.tsx`, solo esa línea;
  `use-order-cost-quote.ts`).

Verificación de la ronda:
- `pnpm run typecheck`: 0 errores.
- `pnpm run lint`: limpio.
- `pnpm exec vitest related --run <13 archivos tocados>`: `Test Files 185 passed (185) · Tests 2852
  passed | 1 skipped (2853)`, integración incluida (base efímera `qct_qc151_*` creada y borrada).
- En la corrida paralela de backend_dev salió rojo `tests/unit/shared-ui/responsible-avatars.test.tsx`,
  que no está en `tests/baseline-rojos.json` ni lo toca esta rama. En esta corrida pasa: parece
  intermitente bajo carga.

## Pendiente

- `./init.sh` completo (gate de T8/cierre): lo corre el leader.
- Decidir si se acepta el arreglo de `recipe-picker.tsx` (`395ff106`).
