# QC-177 — diseño

## Lo que ya existe

Busqué con estos términos: `baseline-rojos`, `product-page`, `recipe-page`, `usuarios-viewport`,
`unidades-viewport`, `account-status-scope`, `hideText`, `defaultPinned`, `nombre · unidad`,
`listResponsibleCandidates` y `PeopleRefFilters`. Miré en `feature_list.json`, `specs/`, `progress/`
y en el código (Grep/Read; no hizo falta el grafo).

- **Board.** Ninguna otra ficha cubre estos cinco rojos. Aparecen QC-121 (origen de
  «nombre · unidad», `done`), QC-58 (timeouts de UI, no relacionada) y QC-180 (los otros tres rojos
  del baseline, fuera de alcance). No hay duplicado.
- **Specs dueños:**
  - QC-67 R21 y QC-39 R27 (scroll contenido en la tabla);
  - QC-55 (tabla compartida);
  - QC-121 R18 («nombre · unidad»);
  - QC-56 R21 (acciones no fijables);
  - QC-65 R19, con su lista retensada por varias fichas;
  - QC-145 `design.md > 3.6`, el selector de responsables.
- **Código que se reutiliza, no se vuelve a crear:**
  - `productDisplayName` (`lib/modules/inventario/domain/product-display-name.ts`), ya importado en
    `product-columns.tsx` y sin usar.
  - `productUnitLabel` (`product-columns.tsx`), que ya usa `product-batches-sheet.tsx`.
  - `PeopleRefFilters` (`lib/modules/identity/domain/people-directory.ts`).
  - `exactProductNameCellText` (`e2e/producto-terminado.spec.ts:192`): el patrón ya resuelto para
    localizar «nombre[ · unidad]» en E2E.
- **Historial que condiciona:** `progress/impl_QC-199-*.md:168` y
  `progress/archivo/history-hasta-2026-10-06.md:5053-5054`, donde el E2E R26 de inventario quedó
  adaptado al nombre solo como «deuda QC-177».

## 1. Modelo de datos, RLS, migraciones, rutas

Ninguno. La ficha no toca tablas, políticas RLS, migraciones, Server Actions ni rutas. Los cambios
son de presentación, de tests y un filtro con nombre en el contrato de `identity`. La firma de
ningún caso de uso cambia.

## 2. Diagnóstico y decisión de cada rojo

| Rojo | Qué falla | Qué cambió | Decisión (2026-10-08) |
|---|---|---|---|
| usuarios-viewport R21 ×2 | la celda `email` lleva `overflow-hidden` | `toColumnTextClass` devuelve `overflow-hidden text-ellipsis` cuando `hideText` está ausente | D4: se acepta; se adapta el test |
| unidades-viewport R27 ×2 | la celda `equivalence` lleva `overflow-hidden` | ídem | D4: se acepta; se adapta el test |
| product-page R18 | `name` pinta «Hipoclorito», no «Hipoclorito · kg» | `cell: (product) => product.name`; se borró `nameCell` | D5: se restaura el código |
| recipe-page R21 | existe `data-table-header-menu-actions` | `defaultPinned: 'right'` en acciones, y `defaultPinned` implica fijable | D6: se quita `defaultPinned` |
| account-status-scope R19 | `list-responsible-candidates.ts` nombra `accountStatus` | `0dbcd68f` añadió `{ accountStatus: ['active'] }` y su comentario, y también el paso 3 de QC-145 §3.6 | D7: filtro con nombre desde `identity` |

## 3. Cambios

### 3.1 Viewports de usuarios y unidades: aceptar el truncado (D4) — R1-R5

**Producción:** sin cambios. `toColumnTextClass` y `data-table-scroll.test.tsx` se quedan como
están (R1-R3 ya los cubre ese test).

**Tests.** En `usuarios-viewport.test.tsx` cambia el caso «la columna de correo va DENTRO del
desplazador… (R21)», y en `unidades-viewport.test.tsx` el caso «la columna de equivalencia va
DENTRO del desplazador… (R27)», en los dos viewports:
- **Se quita** la aserción `not.toBe('overflow-hidden')` sobre las clases de la celda.
- **Se mantiene**:
  - la celda dentro del contenedor (`contenedor.contains(celda)`);
  - visible;
  - sin la clase `hidden`;
  - sin scroll horizontal en `html` ni en `body`.
- **Se tensa** con dos aserciones nuevas, para que el caso no quede más flojo que antes:
  - el texto de la celda es el valor completo: el correo de la fila, o la frase de equivalencia
    compuesta (por ejemplo, contiene el símbolo de la base y el factor). Así el truncado es solo
    visual y el dato entero está en el DOM;
  - la celda lleva exactamente la clase de truncado del contrato (`text-ellipsis`). Si mañana
    cambia el contrato, el test lo dice.
- El comentario del caso se reescribe sin citar fichas (`docs/conventions.md > Comentarios`). El
  nombre del caso conserva `(R21)` / `(R27)`.

**Enmiendas con fecha 2026-10-08:**
- `specs/QC-67-pantalla-de-usuarios/design.md` y `specs/QC-39-pantalla-de-unidades/design.md`: una
  nota en la sección de la columna (correo; equivalencia). La celda puede recortarse con puntos
  suspensivos según el contrato por defecto de la tabla compartida, el valor completo sigue en la
  celda y R21/R27 (scroll contenido) no cambian. Decisión humana en QC-177 D4.
- `specs/QC-55-tabla-de-datos-compartida/design.md`: nota de que el contrato de columna incorpora
  `width`, `hideText` (ausente o `true` = truncado; `false` = salto de línea) y `defaultPinned`,
  que entraron sin spec en `a543c84d` y `3018853a`, y que el truncado por defecto queda aceptado
  (QC-177 D4).

### 3.2 Inventario: «nombre · unidad» (D5) — R6, R7, R8

`app/(private)/inventario/components/product-columns.tsx`, columna `name`:

```ts
cell: (product) => productDisplayName(product.name, productUnitLabel(product, units)),
```

- Sin unidad o sin catálogo, `productUnitLabel` devuelve `null`, y el resultado es el nombre solo
  (R7).
- Si la unidad no está en el catálogo, la regla es la que tenía `nameCell` antes de `a543c84d`. El
  implementer la comprueba con `git show a543c84d^:app/(private)/inventario/components/product-columns.tsx`
  y no inventa otra.
- `width: 500` y `hideText: false` se quedan.
- Se limpian los comentarios de las líneas tocadas.
- **E2E.** Los recorridos que localizan la fila por el nombre exacto en `data-table-cell-name`
  pasan a usar el nombre exacto con sufijo de unidad opcional (patrón `exactProductNameCellText`) o
  `productDisplayName(nombre, símbolo)` cuando la unidad se conoce:
  - `e2e/inventario.spec.ts:275`, `:325` y `:898` (R26 vuelve a distinguir las filas por «X · kg» /
    «X · L»);
  - `e2e/insumo-por-unidad.spec.ts:91`;
  - `e2e/inventario-importar.spec.ts:487`, a través de `inventoryRow`.

  El implementer barre `e2e/` buscando `data-table-cell-name` sobre `/inventario` por si hay más.
  `aislamiento-inventario.spec.ts` y `producto-terminado.spec.ts` ya esperan el sufijo.

### 3.3 Recetas: acciones no fijables (D6) — R9, R10

`app/(private)/produccion/formulas/components/recipe-columns.tsx`: se quita `defaultPinned: 'right'`
de `actions` y se mantiene `pinnable: false`. La columna no tiene orden, filtro ni fijado, así que
`DataTableHeaderMenu` devuelve `null`. `recipe-page.test.tsx` no se toca.

### 3.4 Estado de cuenta: filtro con nombre desde `identity` (D7) — R11, R12, R13

- `lib/modules/identity/domain/people-directory.ts`, que ya está en `SITIOS_PERMITIDOS`, exporta:
  ```ts
  export const ACTIVE_ACCOUNTS_ONLY: PeopleRefFilters = { accountStatus: ['active'] };
  ```
  El nombre definitivo lo puede ajustar el implementer, siempre que no contenga
  `account[_ ]?status`.
- `lib/modules/identity/index.ts`, también en la lista, lo reexporta.
- `lib/modules/asignaciones/domain/list-responsible-candidates.ts`:
  - pasa `ACTIVE_ACCOUNTS_ONLY` como 4.º argumento de `listAliveInCompany`;
  - el comentario del archivo deja de nombrar el estado (`accountStatus`,
    `effectiveAccountStatus`). Basta con decir que solo entran cuentas activas.

  El archivo deja de casar con `MENCION_DEL_ESTADO`.
- `tests/unit/asignaciones/list-responsible-candidates.test.ts`: el filtro que llega al puerto
  sigue siendo `{ accountStatus: ['active'] }` (R11). Si la aserción ya existe, no cambia.
- `tests/unit/identity/account-status-scope.test.ts` y su `SITIOS_PERMITIDOS` **no se tocan**.
- Hay que comprobar que `tests/guards/guard-qc87-no-reimplementado.test.ts` sigue en verde con el
  import nuevo.
- **Enmienda con fecha 2026-10-08** en `specs/QC-145-pedidos-terminados-en-asignacion/design.md >
  3.6`: el paso 3 lo añadió `0dbcd68f` fuera del flujo, y la llamada usa el filtro con nombre
  exportado por `identity` (QC-177 D7).

### 3.5 Baseline — R14, R15

Se borran las cinco entradas de `tests/baseline-rojos.json` y no se añade ninguna.

## 4. Contratos que cambian

| Contrato | Antes (`dev`) | Después | Consumidores |
|---|---|---|---|
| Celda `name` de inventario | `product.name` | `productDisplayName(name, unitLabel)` | E2E de §3.2 |
| `actions` de recetas | fijada a la derecha y soltable | columna normal no fijable | ninguno |
| Barrel de `identity` | — | + `ACTIVE_ACCOUNTS_ONLY` | `asignaciones` |
| `DataTableColumn.hideText` | sin cambio (ausente = truncado) | — | — |

## 5. Dependencias

Ninguna nueva (R17).

## 6. Alternativas descartadas

- **P1: devolver la ausencia de `hideText` a «sin clases».** Era mi recomendación inicial. El
  humano la descartó el 2026-10-08 (D4): se acepta el truncado por defecto y se adaptan los tests.
- **P1: poner `hideText: false` solo en correo y equivalencia.** Descartada: cambia el aspecto de
  dos pantallas (el texto se parte en varias líneas) y nadie lo pidió.
- **P4: añadir `list-responsible-candidates.ts` a `SITIOS_PERMITIDOS`.** Descartada (D7): la nota
  de QC-145 que lo justificaba la añadió el mismo commit fuera del flujo. Ensanchar la lista daría
  por bueno un goteo del estado hacia otro módulo.
- **P3: columna «fijada y bloqueada» en la tabla compartida.** Descartada (D6): es una capacidad
  nueva que ningún spec pide.
- **Dejar los rojos en el baseline.** Descartada: contradice D1.

## 7. Trazabilidad R → test

| R | Test |
|---|---|
| R1 | `tests/unit/shared/data-table-scroll.test.tsx` › «ausente o true = truncado con ellipsis» (sin cambio) |
| R2 | ídem |
| R3 | `tests/unit/shared/data-table-scroll.test.tsx` › «false = el texto salta de linea…» (sin cambio) |
| R4 | `tests/unit/configuracion-ui/usuarios-viewport.test.tsx` › «la columna de correo va DENTRO del desplazador… (R21)» ×2 viewports, adaptado; y «el desbordamiento se resuelve DENTRO de la tabla… (R21)» |
| R5 | `tests/unit/configuracion-ui/unidades-viewport.test.tsx` › «la columna de equivalencia va DENTRO del desplazador… (R27)» ×2 viewports, adaptado; y «el desbordamiento se resuelve DENTRO de la tabla… (R27)» |
| R6 | `tests/unit/inventario/product-page.test.tsx` › «R18 — el nombre del producto se pinta junto a la unidad guardada» |
| R7 | `tests/unit/inventario/product-page.test.tsx` › «R18 — sin unidad guardada o sin catalogo…»; `tests/unit/inventario/product-display-name.test.ts` |
| R8 | `e2e/inventario.spec.ts` › «el mismo nombre en dos unidades son dos filas… (R26)» |
| R9 | `tests/unit/recetas-ui/recipe-page.test.tsx` › «R21: las acciones van en una columna que no se puede fijar…» |
| R10 | ídem (controles visibles y `min-h-11`/`min-w-11`) |
| R11 | `tests/unit/asignaciones/list-responsible-candidates.test.ts` |
| R12 | `tests/unit/identity/account-status-scope.test.ts` › «R19 — … EXACTAMENTE los de la lista cerrada» (lista sin cambios) |
| R13 | ídem (igualdad), y anclas positivas «el esquema y la migracion… si lo nombran» |
| R14 | `gate-completo` en CI sin las cinco entradas en `tests/baseline-rojos.json` |
| R15 | el reviewer comprueba en el diff que solo cambian los casos R21/R27 descritos en §3.1 |
| R16 | el reviewer comprueba las enmiendas fechadas en QC-67, QC-39 y QC-145 (y la nota de QC-55) |
| R17 | `tests/guards/guard-identificador-de-request.test.ts`; diff sin `package.json` |
