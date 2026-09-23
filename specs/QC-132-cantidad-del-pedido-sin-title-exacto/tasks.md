# QC-132 — cantidad-del-pedido-sin-title-exacto · tasks.md

> Requisitos: `requirements.md` (R1–R11, más R12 en la nota del 2026-09-23). Diseño: `design.md`.
> **Spec aprobado en F1.4 (2026-09-23).**
> `[P]` = paralelizable con las demás `[P]` de la misma tanda (tocan archivos distintos).
> Cada task de la tanda A es **test primero**: el caso nuevo se escribe, se ve en rojo, y luego se
> cambia producción.

---

## Tanda A — los tres sitios

### [x] T1 `[P]` — Columna Cantidad de `/pedidos` (R1, R2, R7)
**Archivos:** `tests/unit/pedidos-ui/order-columns.test.tsx` (bloque «la cantidad se pinta
REDONDEADA…», ~línea 271); `app/(private)/pedidos/components/order-columns.tsx:195-204`.
**Depende de:** nada.

1. Añadir dos casos `QC-132 R1` y `QC-132 R2` según `design.md > 5`.
2. Ver el rojo de R1.
3. Cambiar la celda a `<span title={exactDecimalTitle(order.quantity)}>…</span>` (`design.md > 3.1`)
   y reescribir corto y sin citas el comentario pegado a esa celda.

**Hecho cuando:** los dos casos nuevos pasan, los cuatro casos existentes del bloque pasan **sin
haberlos tocado** y `pnpm vitest run tests/unit/pedidos-ui/order-columns.test.tsx` está en verde.

### [x] T2 `[P]` — Cantidad del pedido en ejecución (R3, R4, R7)
**Archivos:** `tests/unit/asignaciones-ui/order-execution-screen.test.tsx` (junto al bloque
«QC-147 R26», ~línea 114); `app/(private)/asignacion/[id]/components/order-execution-screen.tsx:67-69`.
**Depende de:** nada.

1. Añadir `QC-132 R3` (`'0.1255'`: texto `'Pedido 0.13'`, `title` `'0.1255'`) y `QC-132 R4`
   (`'200.0000'`: sin `title`).
2. Ver el rojo de R3.
3. Poner `title={exactDecimalTitle(execution.orderQuantity)}` en el `<p>` del testid
   (`design.md > 3.2`).

**Hecho cuando:** los dos casos nuevos y todo el archivo pasan, y los casos de QC-147 R26 siguen
intactos.

### [x] T3 `[P]` — Cantidad de la línea en su unidad propia (R5, R6, R7)
**Archivos:** `tests/unit/asignaciones-ui/order-execution-lines.test.tsx`;
`app/(private)/asignacion/[id]/components/order-execution-lines.tsx:77-82`.
**Depende de:** nada.

1. Añadir `QC-132 R5` (línea `'0.1255'` con `alternativeUnits: []`, y otra con `unit: null`: texto
   `'0.13'`, `title` `'0.1255'`) y `QC-132 R6` (línea `'20'`: sin `title`).
2. Ver el rojo de R5.
3. Poner `title={exactDecimalTitle(displayedQuantity)}` en el `span` del testid de la cantidad
   (`design.md > 3.3`; es la respuesta (a) del humano, 2026-09-23).

**Hecho cuando:** los casos nuevos y todo el archivo pasan.

### [x] T4 — Línea convertida a otra unidad (R12, R7)
**Archivos:** `tests/unit/asignaciones-ui/order-execution-lines.test.tsx`. Producción ya queda
cubierta por la expresión de T3; si no, se ajusta allí.
**Depende de:** T3. **Desbloqueada el 2026-09-23 (F1.4, respuesta (a)).**

Añadir dos casos `QC-132 R12` con el patrón de selector de los casos existentes (`setupUser` +
`esperarInteractiva`), según `design.md > 5`:
- **Valor exacto largo:** línea en `ml` con `L` como alternativa, `quantity: '1'`, elegir `L` ->
  `textContent` `'0'` y `title` `'0.001'`.
- **Ya sale exacta:** línea en `L` con `ml` como alternativa, `quantity: '0.1255'`, elegir `ml` ->
  `textContent` `'125.5'` y **sin** `title`.

**Hecho cuando:** los dos casos pasan, y quitar el `title` de producción pone en rojo el primero (se
anota en T5).

---

## Tanda B — demostrar que muerde

### [x] T5 — Quitar el `title`, ver el rojo, revertir (R1, R3, R5, R12, R9)
**Archivos:** temporalmente los tres de producción. **Revertidos al terminar.**
**Depende de:** T1, T2, T3, T4. **No paralelizable.**

Quitar el atributo `title` de cada sitio, uno a uno, correr solo su archivo de test y anotar el
mensaje de rojo.

**Hecho cuando:** `progress/impl_QC-132-cantidad-del-pedido-sin-title-exacto.md` tiene una fila por
sitio (mutación · rojo obtenido · revertida) y `git diff` de producción coincide con el de T1–T3.

---

## Tanda C — cierre

### [x] T6 `[P]` — Requisitos negativos por diff (R8, R9, R11)
**Depende de:** T5.

**Hecho cuando:** `git diff --stat` contra la base **no** toca `lib/shared/ui/decimal-display.ts`, su
test, `order-field.tsx`, `components/shared/data-table/**`, `e2e/`, `package.json` ni el lockfile; y
el diff de los tres archivos de test solo **añade** líneas de caso (ningún `-` sobre una afirmación
existente). Anotado en el informe.

### [x] T7 `[P]` — Repetir el censo (R10)
**Depende de:** T5.

Buscar `formatDecimalDisplay(` en `app/`. **Hecho cuando:** el informe lista cada aparición con su
`title` correspondiente, y la única sin él es `order-field.tsx`.

### [ ] T8 — Gate rápido
**Depende de:** T6, T7. **Hecho cuando:** `./init.sh --rapido` termina en verde.

### [ ] T9 — Gate completo
**Depende de:** T8. **Hecho cuando:** `./init.sh` completo termina en verde (regla 5 de `CLAUDE.md`;
sin esto no hay PR).

### [ ] T10 — Mapa de trazabilidad
**Depende de:** T9. **Hecho cuando:** el informe de implementación contiene el mapa `R1`–`R12` ->
test o comprobación concreta, según `design.md > 5`.
