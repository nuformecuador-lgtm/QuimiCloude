# QC-170 — pedido-en-varias-presentaciones · review

> Revisado: worktree `QC-170-pedido-en-varias-presentaciones`, HEAD `d3e6470d`, diff `0736e1ff..HEAD`
> (205 archivos). Fecha: 2026-10-01. Las decisiones humanas de la enmienda de 2026-10-01 en
> `design.md > 2.4` no se han reabierto.

## Veredicto: **RECHAZADO**

4 bloqueantes y 6 menores.

## Verificación ejecutada por el reviewer (salida real)

| Comando | Resultado |
|---|---|
| `pnpm run typecheck` | verde (`tsc --noEmit`, sin errores) |
| `pnpm run lint` | `0 errors, 7 warnings` (los mismos 7 avisos que ya había) |
| `vitest run tests/unit/{pedidos,pedidos-ui,asignaciones,asignaciones-ui,inventario,shared,errores} tests/guards` | 265/266 archivos, 3904 pasan, 12 se saltan, **1 rojo**: `pedidos-ui/pedidos-convenciones.test.ts > no cambia package.json` (ver m2: desfase con `dev`, no lo causa este diff) |
| `vitest run` de `qc170-backfill.int`, `qc170-distribution-concurrency.int`, `finish-with-finished-goods.int`, `order-packing.int` y `pedidos-constraints.int` | 5/5 archivos, **77/77** |
| `vitest run tests/unit/configuracion-ui/user-table.test.tsx` | 27/27 |
| `./init.sh` completo y Playwright | **no se corren**, por orden del leader (base y puerto compartidos) |

## Checklist

- [x] requirements / design / tasks existen; design trae alternativas descartadas (§0, §5.3, §10).
- [x] Todas las tasks T0-T25 están marcadas `[x]`.
- [~] Trazabilidad: todos los R<n> tienen test (mapa abajo), con tres matices: R18 solo se prueba
  con una unidad (B3), R32 se cumple sin hacer nada y R31 se cubre de forma indirecta (m5).
- [x] typecheck y lint verdes.
- [~] `pnpm test`: lo que acoté pasa, salvo el rojo de desfase con `dev` (m2). La suite entera no la corrí.
- [ ] **E2E de flujo crítico**: hay uno nuevo (R33), pero **cuatro E2E que ya existían quedan rotos** (B2).
- [x] Multiplataforma: los controles nuevos llevan `min-h-11 min-w-11` y `text-base`
  (`order-distribution-field.tsx:40-41`); no hay `100vh` ni `:hover` como única vía de activación.
- [x] Dependencias: el diff no toca `package.json`.
- [x] Tabla nueva `order_presentation_lines` con `company_id`, RLS `ENABLE`+`FORCE`
  (`20260927120000_*/migration.sql:53-54`), y las tres migraciones tienen su `down.sql`.
- [~] Aislamiento por empresa: todas las consultas nuevas filtran por `company_id`. Falta, para la
  escritura acotada, un test contra la base que pruebe que se rechaza el acceso desde otra empresa (B4).
- [x] Hexagonal: `pedidos` usa solo los barrels de `unidades`/`inventario`; `guard-arquitectura-modulos`
  y el resto de guardias están verdes.
- [ ] **Comentarios**: hay citas de R<n>/QC-<n>/`design.md` en líneas que añade el diff (B1).
- [ ] `./init.sh` completo antes del PR: pendiente (lo anota la propia bitácora).

## Hallazgos

### BLOQUEANTES

**B1 — Hay 141 líneas de comentario de producción que citan R<n>, QC-<n> o `design.md`, en 34 archivos.**
`docs/conventions.md > Comentarios` lo prohíbe sin excepciones, y aquí todas son líneas que añade o
cambia esta rama, no restos anteriores. Los archivos con más citas:
- `lib/modules/pedidos/domain/update-order-presentation-lines.ts` (14)
- `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts` (13; p. ej. `:417`, `:433`, `:860-868`, `:897`, `:917`)
- `lib/modules/pedidos/domain/order-packing.ts` (10; `:7`, `:10`, `:39`, `:43`, `:111-113`, `:128`)
- `order-distribution.ts` (8; `:1`, `:4`, `:10`, `:13`, `:69-72`), `order-view.ts` (8), `order-catalog.ts` (8)
- `lib/composition/index.ts` (8; `:1088`, `:1176`, `:1185`, `:1246-1253`)
- `db/schema.prisma:374,642,660` y `db/migrations/20260927120000_order_presentation_lines/migration.sql:1,26,47-48`.

Para obtener la lista entera, filtra con `git diff -U0 0736e1ff..HEAD -- lib app components db` las
líneas `+` de comentario que contienen `QC-\d+`, `\bR\d+\b`, `design.md` o «decisión cerrada».
Hay que quitar las citas y dejar solo el porqué. Si la limpieza abulta, va en un commit propio
`chore(QC-170): limpia comentarios de ...`.

**B2 — Cuatro E2E que ya existían se rompen con esta rama.** No los he corrido; el diagnóstico sale
de leer el código. Se rompen por tres causas, todas en el alta:
- (a) El selector de presentación no se pinta hasta que se elige la unidad (`order-distribution-field.tsx:121,231`).
- (b) La opción de una presentación sin contenido sale deshabilitada (`requireContent`, `presentation-select.tsx:500-506`).
- (c) Con `name={null}` no existe el campo oculto `presentation-value`, y el servidor rechaza un alta
  sin `unitId` con `invalid_input` (R41).

Guardar sigue habilitado aunque no haya unidad (`availabilityBlocksSave`), así que el formulario no se cierra.

| E2E | Qué se rompe | Por qué |
|---|---|---|
| `e2e/pedidos-cotizacion.spec.ts` | el primer test, recorrido (a)-(d), `:418-429`. El de R59 (`:458-478`) no guarda y sigue bien | (a) y (b): la presentación del fixture no tiene `content` (`:237-246`); (c); falta elegir la unidad |
| `e2e/reserva-de-material.spec.ts` | el único test: el helper de alta `:192-221` | (a) y (c); falta unidad y línea de reparto (la presentación sí tiene contenido, `:400`) |
| `e2e/recetas-porcentaje.spec.ts` | escenario 3, `:532-533` (no elige presentación pero guarda sin unidad). Los escenarios 1, 2 y 4 siguen bien | (c): sin unidad, `invalid_input`, el formulario no se cierra |
| `e2e/aislamiento-pedidos.spec.ts` | el test de alta en A, `:458-470` | (a), (b) (presentación sin `content`, `:278-286`) y (c) |

El gate no corre Playwright y `tests/baseline-rojos.json` está vacío. Aun así, son roturas de
cobertura de flujos críticos (reserva de inventario, coste, aislamiento) que provoca esta ficha, y
tasks.md («Cada una se arregla en la task que la rompe») los deja a su cargo. Al adaptarlos, hay que
borrar `order_presentation_lines` antes que `orders` en la limpieza: la FK es `RESTRICT`. Es el mismo
arreglo que ya lleva `e2e/pedidos.spec.ts`.

**B3 — R18 con unidades mezcladas: el coste unitario sale mal.** `order-packing.ts:114-132` suma
`packages x content` de cada línea en la unidad de su presentación, sin convertir, y divide el coste
del lote entre ese total. Lo que se suma no es una cantidad. Ejemplo con un pedido de 100 L y coste 1000:
- Líneas: 5 x 200 ml (contenido 200, en ml) y 60 x 1 L.
- Lo que hace hoy: total = 1000 + 60 = 1060, coste unitario = 0,9434. El lote en ml vale 943,40 y el de L, 56,60.
- Lo correcto: total = 61 L, 16,3934 por L. El lote de 1 L (en ml) vale 16,39 y el de 60 L, 983,61.

El total sigue sumando 1000, pero el reparto del valor del inventario sale casi invertido. Hay
mezcla de unidades siempre que la empresa tenga unidades con factor (QC-76: `units.factor` y
`unit_id` base). R6 y R7 la admiten, y el formulario la deja guardar.

**Diagnóstico: el hueco es real y está en el spec, no en el código frente a R18.** R18 dice
literalmente «la suma de `envases x contenido` de todas las líneas», y el código lo cumple. Pero esa
lectura contradice D6 («el coste se reparte por la cantidad de cada lote: mismo coste por unidad») y
la conversión de R6. Por eso es bloqueante para el merge y necesita **decisión humana**: enmendar
R18 para que la suma se haga convertida a `orders.unit_id`, y que el coste unitario de cada lote sea
el coste por unidad del pedido convertido a la unidad de su presentación. Después, arreglar el
código y añadir un caso L/ml en `order-packing.test.ts` y `finish-with-finished-goods.int`. Hoy
R18 solo se prueba con una unidad (`order-packing.test.ts:244`) y el E2E usa dos presentaciones en litros.

**B4 — Aislamiento: la escritura acotada no tiene test contra la base de que otra empresa no puede
tocar el pedido.** `docs/architecture.md > Dominio` n.º 1 lo exige. Lo que hay:
- `updatePresentationLinesAliveOrder` y `replacePresentationLines` (`order-prisma.ts:417-450,516-533`)
  sí filtran por empresa.
- Pero el único caso que lo comprueba es unitario con un doble que devuelve `null`
  (`update-order-presentation-lines.test.ts:169`), así que no prueba ese filtro.
- `company-scope-queries.int` cubre `updateAlive`/`cancelAlive`, pero no el camino nuevo.

Falta un caso de integración: `updateOrderPresentationLines` (o `updatePresentationLinesAlive`) sobre
un pedido de B pedido desde A: `not_found`, y el `unit_id` y las líneas de B quedan igual (con un
control positivo desde B). Comenzar y Terminar ya lo tienen (`order-packing.int.test.ts:391,471`).

### Menores

**m1 — «Reparto y unidad» muestra datos viejos si se reabre justo después de guardar** (punto abierto 3).
- `order-distribution-dialog.tsx:92-94` toma el estado inicial del prop `order` al montarse.
- `order-sheet.tsx:253-259` lo desmonta al cerrar.
- `:122-124` cierra y lanza `router.refresh()` sin esperarlo.

Si se reabre antes de que llegue el refresco, se ven los valores anteriores. Quien edite desde ahí
y guarde sobrescribe en silencio su propio cambio, porque el guardado reemplaza el conjunto entero.
El servidor sigue validando, así que no se rompe ninguna invariante. Arreglo sugerido: no dejar
reabrir la acción hasta que termine el refresco (`useTransition` alrededor de `router.refresh()`) o
guardar en local el último valor guardado.

**m2 — `pedidos-convenciones.test.ts > no cambia package.json` sale rojo.** `dev` ya trae `pino` y
la rama no se ha sincronizado. El diff no toca `package.json`. Se resuelve al sincronizar con
`dev` antes del `./init.sh` completo.

**m3 — `tests/unit/configuracion-ui/user-table.test.tsx` falla a veces** (punto abierto 4). No tiene
que ver con esta ficha: ningún archivo de `configuracion` está en el diff, y en esta revisión pasó
27/27. No cuenta como hallazgo de QC-170. Si vuelve a salir rojo en el gate completo, conviene abrir
una ficha propia, o meterlo en el baseline con `motivo` y `desde`.

**m4 — El rechazo de R42 (`order_without_unit`) no tiene ninguna entrada real.** Los tres esquemas
exigen `unitId`, así que solo se prueba en dominio puro (`order-distribution.test.ts`) y en la
traducción de la action. Ya está anotado en `design.md > 4.2` y en la bitácora. Lo dejo por escrito.

**m5 — R32 y R31 sin test propio.**
- R32: no hay log de ejecución en `db/schema.prisma` (QC-82 no ha entrado), así que se cumple sin hacer nada.
- R31: solo lo cubren los casos de QC-168 que siguen verdes en `order-packing.test.ts`/`.int`.

Lo acepto así, pero habría que anotarlo en el mapa de la bitácora.

**m6 — `progress/impl_*` no tiene un mapa R<n> -> test consolidado**: está repartido en cinco tablas
parciales, una por tanda. Este informe trae el mapa entero.

## Mapa de trazabilidad R<n> -> test

| R | Test(s) | Estado |
|---|---|---|
| R1 | `tests/unit/pedidos/order-input.test.ts`, `create-order.test.ts`, `tests/unit/pedidos/schema/order-presentation-lines-migration.test.ts`, `order-actions.test.ts` (FormData) | OK |
| R2 | `order-input.test.ts:124`, `create-order.test.ts:298`, `order-presentation-lines-migration.test.ts` (único) | OK |
| R3 | `tests/integration/pedidos/order-content-copy.int.test.ts`, `resolve-distribution.test.ts` | OK |
| R4 | `order-input.test.ts:139`, `tests/unit/pedidos/schema/pedidos-schema.test.ts`, `qc170-backfill.int.test.ts` | OK |
| R5 | `order-distribution.test.ts` (Decimal), test de la migración (Decimal(14,4)) | OK |
| R6 | `order-distribution.test.ts`, `order-presentation-availability.test.ts`, `pedidos-ui/order-distribution-field.test.tsx`, `order-form.test.tsx` | OK |
| R7 | `order-distribution.test.ts`, `order-presentation-availability.test.ts`, `order-actions-distribution.test.ts`, `order-distribution-field.test.tsx` | OK |
| R8 | `order-distribution.test.ts`, `update-order-presentation-lines.test.ts`, `order-presentation-availability.test.ts` | OK |
| R9 | `order-input.test.ts`, `order-actions-distribution.test.ts` (reparto vacío) | OK |
| R10 | `order-packing.test.ts`, `order-packing.int.test.ts`, `asignaciones/start-packing.test.ts`, E2E nuevo | OK |
| R11 | `update-order-presentation-lines.test.ts`, `order-distribution-dialog.test.tsx` | OK |
| R12 | `order-actions-distribution.test.ts`, `asignaciones/order-distribution-view.test.ts`, `order-catalog.test.ts` (contrato) | OK |
| R13 | `update-order-presentation-lines.test.ts` (`it.each` por estado), `order-actions-distribution.test.ts`, E2E nuevo | OK |
| R14 | `update-order-presentation-lines.test.ts` (EN_EMPAQUE), `qc170-distribution-concurrency.int` («R48»), E2E nuevo | OK |
| R15, R16 | `transition-order.test.ts`, `order-reservation.int.test.ts` | OK |
| R17 | `order-packing.test.ts`, `finish-with-finished-goods.int.test.ts`, `inventario/finished-goods.int.test.ts`, `finished-goods-prisma.test.ts` | OK |
| R18 | `order-packing.test.ts:244`, `finish-with-finished-goods.int` («R18») | **solo con una unidad (B3)** |
| R19 | `order-packing.test.ts`, `finish-with-finished-goods.int` («R19», fila escrita a mano) | OK |
| R20 | `create-order.test.ts`, `finish-with-finished-goods.int` («R20») | OK |
| R21 | `finish-with-finished-goods.int` («R21», también simultáneos), `inventario/finished-goods.int` | OK |
| R22, R23, R24 | `qc170-backfill.int.test.ts` (incluido «solo vivos») | OK |
| R25 | `qc170-backfill.int.test.ts` (la segunda aplicación falla con 42703) | OK |
| R26, R27 | `tests/unit/shared/order-distribution-label.test.tsx`, `pedidos-ui/order-columns.test.tsx`, `asignaciones-ui/*-columns.test.tsx`, `asignaciones/list-*.test.ts`, `order-repository.int` | OK |
| R28 | `tests/unit/errores/catalogo.test.ts`, `guard-catalogo-de-errores` | OK |
| R29 | `create-order.test.ts:382`, `company-isolation-service.test.ts:541,559`, `update-order-presentation-lines.test.ts:203`, `order-presentation-availability.test.ts:202` | OK |
| R30 | `transition-order.test.ts` («R30»), `update-order-presentation-lines.test.ts`, `qc170-distribution-concurrency.int` («R30, R46», censo) | OK |
| R31 | indirecto: casos QC-168 de `order-packing.test.ts`/`.int` | menor (m5) |
| R32 | — (no hay log de QC-82; se cumple sin hacer nada) | menor (m5) |
| R33 | `e2e/pedido-en-varias-presentaciones.spec.ts` («R33, R36, R39...») | OK (no corrido por mí; bitácora: Chromium verde) |
| R34 | `pedidos-ui/order-distribution-field.test.tsx` | OK |
| R35 | `create-order.test.ts`, `update-order.test.ts`, `update-order-presentation-lines.test.ts`, `order-content-copy.int` | OK |
| R36 | ídem R35 + `order-actions-distribution.test.ts` + E2E nuevo | OK |
| R37 | `qc170-distribution-concurrency.int` («R37», dos conexiones) | OK |
| R38 | `update-order.test.ts`, `update-order-presentation-lines.test.ts`, `qc170-distribution-concurrency.int` («R38») | OK |
| R39 | `order-distribution-field.test.tsx`, `order-form.test.tsx`, `order-distribution-dialog.test.tsx`, `order-presentation-availability.test.ts`, E2E nuevo | OK |
| R40 | `order-presentation-lines-migration.test.ts`, `pedidos-constraints.int.test.ts` | OK |
| R41 | `order-input.test.ts`, `create-order.test.ts`, `update-order.test.ts`, `order-form.test.tsx`, `order-actions.test.ts` | OK |
| R42 | `order-distribution.test.ts`, `order-actions-distribution.test.ts`, `qc170-distribution-concurrency.int` («R42, R46»), `order-distribution-field.test.tsx`, `order-service.test.ts`, `list-orders.test.ts` | OK (m4) |
| R43 | `qc170-backfill.int.test.ts`, `pedidos-constraints.int.test.ts` | OK |
| R44 | **retirado**; guarda de no regresión en `transition-order.test.ts` («R44 retirado») | n/a |
| R45 | `qc170-backfill.int.test.ts` (aborta; un pedido borrado no aborta) | OK |
| R46 | `order-actions-distribution.test.ts` (`.strict()`), `order-distribution-dialog.test.tsx`, `qc170-distribution-concurrency.int`, E2E nuevo | OK |
| R47 | `asignaciones-ui/packing-order-screen.test.tsx`, `asignaciones/get-packing-order.test.ts`, E2E nuevo | OK |
| R48 | `qc170-distribution-concurrency.int` («R48», los dos órdenes) | OK |
| R49 | `qc170-backfill.int.test.ts` (aborta en EN_EMPAQUE; en POR_EMPACAR no) | OK |

## Qué falta para OK

1. B1: quitar las citas de los comentarios de producción del diff.
2. B2: adaptar los cuatro E2E (unidad, línea de reparto, contenido en la presentación del fixture, y
   limpieza de `order_presentation_lines` antes que `orders`) y correrlos.
3. B3: que el humano decida la enmienda de R18 (conversión a la unidad del pedido); después, arreglar
   `order-packing.ts` y añadir un caso L/ml en unidad e integración.
4. B4: añadir un test de integración del rechazo entre empresas en la edición acotada del reparto.
5. Sincronizar con `dev` (m2) y correr `./init.sh` completo antes del PR.

## Vuelta 2 (acotada a d3e6470d..f6f1b05e)

Fecha: 2026-10-02. Alcance: solo los arreglos del review 1, por orden del humano. HEAD = `f6f1b05e`.
El mapa R->test de la vuelta 1 se da por válido.

### Veredicto: **OK**

Los cuatro bloqueantes están cerrados y no hay hallazgos nuevos bloqueantes. Quedan pendientes, a
cargo del leader: sincronizar con `dev`, correr `./init.sh` completo, E2E (WebKit incluido) antes
del PR, y la pregunta del redondeo para el humano (ver abajo).

### B1-B4 / m1-m6

| # | Estado | Evidencia |
|---|---|---|
| B1 | **Cerrado** | `git diff -U0 0736e1ff..HEAD -- lib app components db`, líneas `+` con `QC-<n>`, `R<n>`, `design.md`, `T<n>` o «decisión cerrada»: **0** (en cualquier línea añadida, no solo en comentarios). Incluye las migraciones, que `aad15786` también limpió. |
| B2 | **Cerrado (por lectura)** | Los cuatro spec cambian: `pedidos-cotizacion` +38, `reserva-de-material` +35, `recetas-porcentaje` +19 y `aislamiento-pedidos` (normalizado a LF). Todos borran `orderPresentationLine` antes de los pedidos (p. ej. `aislamiento-pedidos.spec.ts:229,238,321`, `reserva-de-material.spec.ts:320,329,491`). Playwright no lo he corrido (fuera del alcance de esta vuelta). La bitácora dice 8/8 en Chromium, y WebKit sigue sin correrse. |
| B3 | **Cerrado conforme a la enmienda** | R18 está enmendado (`requirements.md`) y T26 tiene su «Hecho cuando» enmendado en `aa445889`. El total se suma convertido a `orders.unit_id` con `sumInOrderUnit` (`order-distribution.ts`), la misma función que usa `validateDistribution`. El coste por unidad va expresado en la unidad de cada lote (`unitCostByPresentationUnit`, `order-packing.ts`). `incompatible_units` y `order_without_unit` se lanzan dentro de la transacción. Tests: `order-packing.test.ts:272` (L/ml: 16.3934 y 0.0164), `:306` (misma unidad), `:330` (incompatible, ningún lote), `:347` (sin unidad); `finish-with-finished-goods.int.test.ts:887` (Postgres: stock y `unit_cost` de los dos lotes, suma aprox. 1000) y `:925` (incompatible, pedido `EN_EMPAQUE`, ningún producto). La traducción en `asignaciones` está en `finish-packing.test.ts`. |
| B4 | **Cerrado** | `tests/integration/pedidos/qc170-distribution-company-scope.int.test.ts`, 8 casos. Cubre el caso de uso y el adaptador (`updatePresentationLinesAlive` y `updateAlive`) con el ámbito de la otra empresa: `not_found` / `OrderNotFoundError`, con foto del pedido y sus líneas igual antes y después (`:292-305`, `:344-359`, `:391-400`, `:420-441`). Hay controles positivos (`:310`, `:364`, `:405`) y un caso de presentación ajena (`:329`). Está dado de alta en `tests/integration/aislamiento.json:323`. |
| m1 | **Cerrado** | `order-sheet.tsx` guarda `{ order, draft }` y se lo pasa al diálogo mientras `order` sea el mismo objeto. Tests en `order-distribution-dialog.test.tsx` (3 casos «reabrir antes de que llegue el refresco»), en verde. |
| m2 | Abierto, no es de la rama | Se resuelve al sincronizar con `dev`. |
| m3 | Abierto, no es de la rama | `user-table` no entró en esta corrida. |
| m4 | Anotado | En la bitácora. Además, `order_without_unit` tiene ahora un uso defensivo en Terminar con su test (`order-packing.test.ts:347`). |
| m5 | Anotado | Mapa consolidado de la bitácora, filas R31/R32. |
| m6 | Cerrado | `impl_*.md` > «Mapa R<n> -> test consolidado», como delta sobre el mapa de este informe. |

### Regresiones dentro del diff

Ninguna bloqueante. Lo que he revisado:
- `resolveLines` (`order-packing.ts`) ahora llama a `presentations.findRefs` para todas las líneas, no
  solo para las que no tienen contenido copiado. Si falta una ref, lanza un `Error` genérico. Es
  aceptable: `presentations` no tiene borrado lógico y la FK impide que falte.
- `validateDistribution` se refactorizó sobre `sumInOrderUnit`. Con unidades iguales, la línea no
  se convierte y `withoutTrailingZeros` iguala la escala. Los tests de `order-distribution` y los de
  guardar siguen verdes en `related`.
- El código que el diff cambia fuera de comentarios es solo B3, m1 y la traducción de errores
  (`git diff -w`, filtrando líneas de comentario). Las limpiezas de B1 van en commits propios
  (`668aeb77`, `aad15786`, `21f7eaaf`).

### Hallazgos nuevos

- **menor n1:** quedan 11 líneas de producción, añadidas por la rama, que citan identificadores del
  spec que la regla no nombra literalmente: `[Q4]` x9 y `[D2]` prima x1, más «Decimoquinta enmienda» en
  `lib/modules/errores/domain/error-codes.ts`. Están en `order-view.ts` (3), `composition/index.ts` (2),
  `order-input.ts`, `order-catalog.ts`, `list-orders.ts`, `get-order.ts` y `order-prisma.ts`. No
  entran en la lista cerrada de `docs/conventions.md > Comentarios` (QC-, R, design.md, «decisión
  cerrada»), pero tienen el mismo problema: quien lee el código no tiene el spec delante. Se
  recomienda quitarlas en un `chore` propio. No es bloqueante.

### Efecto de `aad15786` (comentarios en dos `migration.sql`)

`aad15786` cambia 4 líneas de comentario en `20260927120000_order_presentation_lines` y 1 en
`20260927120100_inventory_movements_production_per_line`. Prisma guarda en `_prisma_migrations` el
sha256 del archivo, así que cualquier base que las aplicara antes de ese commit tiene un checksum
distinto. Con checksum distinto, `migrate deploy` (`build` y `db:migrate`) sigue sin quejarse, pero
`migrate dev` (`db:migrate:create`) lo detecta como «modified after it was applied» y pide reset.

Comprobado solo con lectura, comparando el sha256 de cada archivo con `_prisma_migrations.checksum`:
- `QuimiCloude_QC170` (la base del worktree, `.env`): las dos migraciones, **IGUAL**, `finished_at` puesto. No hay drift.
- `QuimiCloude` (la base local principal): **no aplicadas**. No hay drift.
- Bases de test `qct_*`: la plantilla se nombra por el hash de las migraciones
  (`tests/helpers/test-database.ts:176-186,243`), así que el cambio genera una plantilla nueva y no hay drift.
- `dev`, `master` y Supabase: las dos migraciones solo existen en esta rama (`git log`: `609a7e49`,
  `aad15786`), así que no pueden estar aplicadas desde `dev`.
- **Sin verificar:** otras bases locales, como las de otros worktrees que hubieran aplicado esta
  rama. El escaneo de todas las bases del servidor lo denegó el clasificador de permisos y no lo he
  repetido. Si alguna tiene la versión anterior, solo afecta a `migrate dev` en esa base.

### Pregunta abierta del implementer: redondeo a `decimal(14,4)`

**Clasificación: pregunta para el humano, no bloqueante.**
- El caso de 0.0000 no es nuevo. Antes de T26, `deriveUnitCost` ya devolvía `null` cuando el
  coste redondeaba a cero (`unit-cost.ts:86`), y el código antiguo lo convertía en 0.0000.
  Ahora `divideCost` devuelve 0.0000 directamente: el comportamiento es el mismo.
- Lo que cambia es la probabilidad. Al expresar el coste por unidad de la presentación (p. ej. ml),
  el coste por unidad es 1000 veces menor. Pasa a 0 con más facilidad, y el error de redondeo
  (hasta 0.00005 por unidad) se multiplica por un stock 1000 veces mayor. En el test:
  16.40 frente a 16.39.
- Ni R18 enmendado ni D6 fijan precisión ni tolerancia. Es una decisión de producto: subir la
  escala de `unit_cost`, guardar el coste en la unidad del pedido, o aceptar el error. Si el humano
  no la toma, se anota como deuda, y bloquearía solo si fija una tolerancia que hoy se incumple.

### Salida real (esta vuelta)

- `pnpm typecheck` -> exit 0.
- `pnpm lint` -> exit 0, `7 problems (0 errors, 7 warnings)` (avisos previos).
- `vitest related --run` sobre los `.ts/.tsx` del diff -> `Test Files 4 failed | 363 passed (367)`,
  `Tests 4 failed | 5252 passed | 16 skipped (5272)`, `Duration 1495.92s`. Los 4 rojos son
  timeouts bajo carga, en archivos fuera del diff: `product-page` (2), `recipe-lines-tabs`,
  `recipe-route-contract` y `session-once-per-request-render`, con tests de 20 a 340 s.
- Repetidos aislados, junto con los dos de integración pedidos y los unitarios de B3/m1
  (`qc170-distribution-company-scope.int`, `finish-with-finished-goods.int`, `order-packing`,
  `order-distribution-dialog`, `asignaciones/finish-packing`) -> `Test Files 9 passed (9)`,
  `Tests 196 passed (196)`.
- `vitest run tests/guards` -> `Test Files 44 passed (44)`, `Tests 584 passed | 5 skipped (589)`.
- No he corrido `./init.sh`, Playwright ni merge con `dev` (por orden).

### Lo que falta (leader)

1. Sincronizar con `dev` (m2), correr `./init.sh` completo y los E2E (Chromium y WebKit) antes del PR.
2. Llevar al humano la pregunta del redondeo y, opcionalmente, la confirmación de la lectura
   «coste en la unidad de cada lote», que la enmienda de T26 ya fija.
3. Opcional: limpiar n1 (`[Q4]`, `[D2]` prima, «enmienda») en un `chore` propio.
