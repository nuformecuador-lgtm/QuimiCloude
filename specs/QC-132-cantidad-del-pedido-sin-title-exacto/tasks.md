# QC-132 — cantidad-del-pedido-sin-title-exacto · tasks.md

> Requisitos: `requirements.md` (R1–R11). Diseño: `design.md`.
> `[P]` = paralelizable con las demás `[P]` de la misma tanda (tocan archivos distintos).
> Cada task de la tanda A es **test primero**: el caso nuevo se escribe, se ve en rojo, y luego se
> cambia producción.

---

## Tanda A — los tres sitios

### [ ] T1 `[P]` — Columna Cantidad de `/pedidos` (R1, R2, R7)
**Archivos:** `tests/unit/pedidos-ui/order-columns.test.tsx` (bloque «la cantidad se pinta
REDONDEADA…», ~línea 271); `app/(private)/pedidos/components/order-columns.tsx:195-204`.
**Depende de:** nada.

1. Añadir dos casos `QC-132 R1` y `QC-132 R2` según `design.md > 5`.
2. Ver el rojo de R1.
3. Cambiar la celda a `<span title={exactDecimalTitle(order.quantity)}>…</span>` (`design.md > 3.1`)
   y reescribir corto y sin citas el comentario pegado a esa celda.

**Hecho cuando:** los dos casos nuevos pasan, los cuatro casos existentes del bloque pasan **sin
haberlos tocado** y `pnpm vitest run tests/unit/pedidos-ui/order-columns.test.tsx` está en verde.

### [ ] T2 `[P]` — Cantidad del pedido en ejecución (R3, R4, R7)
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

### [ ] T3 `[P]` — Cantidad de la línea en su unidad propia (R5, R6, R7)
**Archivos:** `tests/unit/asignaciones-ui/order-execution-lines.test.tsx`;
`app/(private)/asignacion/[id]/components/order-execution-lines.tsx:77-82`.
**Depende de:** nada. **Ver T4 antes de escribir la expresión del `title`.**

1. Añadir `QC-132 R5` (línea `'0.1255'` con `alternativeUnits: []`, y otra con `unit: null`: texto
   `'0.13'`, `title` `'0.1255'`) y `QC-132 R6` (línea `'20'`: sin `title`).
2. Ver el rojo de R5.
3. Poner el `title` en el `span` del testid de la cantidad. **Si la pregunta abierta 1 sigue sin
   respuesta, no se elige expresión por cuenta propia** (`design.md > 4`): se para y se avisa al
   leader.

**Hecho cuando:** los casos nuevos y todo el archivo pasan, y la expresión usada corresponde a una
respuesta escrita del humano a la pregunta abierta 1.

### [ ] T4 — Línea convertida a otra unidad (pregunta abierta 1) — **BLOQUEADA**
**Archivos:** los de T3; `requirements.md` (nota fechada al final).
**Depende de:** respuesta del humano a la pregunta abierta 1 y de T3.

- Respuesta (a) o (c): añadir `R12` en una nota fechada al final de `requirements.md` sin renumerar
  ni reescribir nada, y un caso `QC-132 R12` que elija `ml` en el selector (patrón de los casos
  existentes con `setupUser` y `esperarInteractiva`) y afirme el `title` resultante.
- Respuesta (b): **no se implementa aquí**; vuelve a `spec_author` porque cambia el diseño
  (`design.md > 4`).

**Hecho cuando:** hay `R12` con su test en verde, o consta por escrito que el humano sacó ese caso de
la ficha.

---

## Tanda B — demostrar que muerde

### [ ] T5 — Quitar el `title`, ver el rojo, revertir (R1, R3, R5, R9)
**Archivos:** temporalmente los tres de producción. **Revertidos al terminar.**
**Depende de:** T1, T2, T3. **No paralelizable.**

Quitar el atributo `title` de cada sitio, uno a uno, correr solo su archivo de test y anotar el
mensaje de rojo.

**Hecho cuando:** `progress/impl_QC-132-cantidad-del-pedido-sin-title-exacto.md` tiene una fila por
sitio (mutación · rojo obtenido · revertida) y `git diff` de producción coincide con el de T1–T3.

---

## Tanda C — cierre

### [ ] T6 `[P]` — Requisitos negativos por diff (R8, R9, R11)
**Depende de:** T5.

**Hecho cuando:** `git diff --stat` contra la base **no** toca `lib/shared/ui/decimal-display.ts`, su
test, `order-field.tsx`, `components/shared/data-table/**`, `e2e/`, `package.json` ni el lockfile; y
el diff de los tres archivos de test solo **añade** líneas de caso (ningún `-` sobre una afirmación
existente). Anotado en el informe.

### [ ] T7 `[P]` — Repetir el censo (R10)
**Depende de:** T5.

Buscar `formatDecimalDisplay(` en `app/`. **Hecho cuando:** el informe lista cada aparición con su
`title` correspondiente, y la única sin él es `order-field.tsx`.

### [ ] T8 — Gate rápido
**Depende de:** T6, T7. **Hecho cuando:** `./init.sh --rapido` termina en verde.

### [ ] T9 — Gate completo
**Depende de:** T8. **Hecho cuando:** `./init.sh` completo termina en verde (regla 5 de `CLAUDE.md`;
sin esto no hay PR).

### [ ] T10 — Mapa de trazabilidad
**Depende de:** T9. **Hecho cuando:** el informe de implementación contiene el mapa `R1`–`R11` (y
`R12` si T4 lo añadió) -> test o comprobación concreta, según `design.md > 5`.
