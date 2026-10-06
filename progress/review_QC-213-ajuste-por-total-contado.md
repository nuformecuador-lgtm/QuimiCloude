# QC-213 — ajuste-por-total-contado · review

> Reviewer, vuelta 1 (revisión completa). Rama `feature/QC-213-ajuste-por-total-contado`, tip
> `8d534c53`, diff `origin/dev...HEAD` (52 archivos). Base de los `.int`: efímera copiada del
> servidor de `QuimiCloude_QC213` (la crea `_global-setup.ts`); la compartida no se tocó.
> MCP del grafo no usado: la revisión se hizo con git/Grep/Read.

## Verificación ejecutada

| Qué | Resultado |
|---|---|
| `pnpm run typecheck` | limpio |
| `pnpm run lint` | 0 errores, 8 avisos ajenos |
| `vitest related --run` (archivos de `app/` y `lib/` del diff) | 616 archivos; 8 rojos, los 8 en `tests/baseline-rojos.json` |
| `vitest run tests/unit tests/guards` (todo) | 754 archivos; **11 rojos: 10 en el baseline + `tests/unit/inventario/movement-reason.test.ts` (ver B1)** |
| `.int` tocados por la rama (11 archivos, incl. `adjust-by-count.int.test.ts`) | 133/133 |
| `proveedores/company-scope.int.test.ts` (reaplica `down.sql`) + `product-batch-lot.int.test.ts` | 48/48 |
| `git diff origin/dev...HEAD -- package.json pnpm-lock.yaml` | vacío |
| E2E y `./init.sh` completo | no corridos (F2.4, leader) |

## Checklist

### Especificación y tasks
- [x] `requirements.md` con R1–R30 en EARS; `design.md` con alternativas descartadas (§6, §7).
- [x] Tasks T0, B1–B5, F1, F2 y TI marcadas `[x]`. TZ (sin casilla) sigue abierta: falta el
      `./init.sh` completo, que corre el leader.

### Trazabilidad (R → test)
- [x] R1–R29: cada uno tiene al menos un caso nuevo o migrado que lo nombra y comprueba lo que pide
      (lo comprobé sobre el diff, no solo en la bitácora). Revisados a fondo: R13 (unit del caso de
      uso, unit del adaptador, action, `.int` sin escritura), R14 (`Promise.all` real contra Postgres:
      un `adjusted`, un `stock_changed`, un solo asiento), R22 (`company-scope-queries.int` con lote
      ajeno → `batch_not_found` sin tocar lote ni asientos), R25 (cinco `INSERT` crudos y un control
      positivo), R10/R11 (una sola llamada a la action tras el rechazo; la segunda lleva
      `seenStock = currentStock`), R28 (tabla de casos y lectura de fuentes).
- [x] R30: sin cambios en `package.json`; `guard-dependencias-aprobadas` en verde.
- [x] Mapa R → test en `progress/impl_QC-213-ajuste-por-total-contado.md`.

### Calidad de código
- [x] typecheck y lint.
- [ ] `pnpm test`: **un rojo nuevo fuera del baseline** (B1).
- [x] E2E escrito para el movimiento de inventario (R29, y R21 del Operador); se corre en F2.4.
- [x] Multiplataforma: campo y selector con `text-base` (16 px); `min-h-11 min-w-11` en el
      disparador, los botones, el campo y el selector; sin `100vh` ni `:hover` como única vía; Base UI
      ya está en el stack.
- [x] Sin dependencias nuevas.

### Datos y seguridad
- [x] Sin tabla ni modelo nuevo: dos columnas anulables en `inventory_movements`. No aplica RLS
      nueva ni columna de empresa nueva.
- [x] Las consultas filtran por empresa (`b.company_id` en el bloqueo, `where: { id, companyId }` en
      el `update`); el rechazo cruzado está probado en `company-scope-queries.int.test.ts`.
- [x] Permiso `inventario.modificar` en el caso de uso, como primera sentencia y antes de zod
      (`authorization.test.ts`, `product-route-contract.test.ts`).
- [x] Migración versionada con `down.sql`; la reaplicación de downs pasa (`company-scope.int`).
- [x] Sin secretos ni contexto hardcodeado; sin webhooks.

### Módulos hexagonales
- [x] `domain/stock-adjustment.ts` es puro (solo `decimal-quantity` y `movement-reason`); el puerto
      importa tipos del dominio; la action pide el caso de uso a `composition`; la lógica (sentido,
      motivos, cero) vive en `domain/`, no en la action.
- [x] Barrel: export propio sin `...Deps`; ningún `use server` reexportado.

### Comentarios (líneas añadidas en producción)
- [x] Ninguno cita `QC-`, `R<n>`, `D<n>`, `design.md` ni «decisión cerrada» (grep sobre el diff de
      `app/`, `lib/`, `db/`).

### Enmiendas aprobadas: aplicadas y documentadas
- [x] Sin prevalidación del total en la action: aplicada (`batch-actions.ts`) y documentada en el texto
      de `design.md > 1.3`, pero la tabla de ese apartado la contradice (m1).
- [x] `stock_before` / `stockBefore`, con DTO `previousStock`: aplicada y documentada en `design.md > 2`.
- [x] Cast `"kind"::text` en el CHECK: aplicado y documentado en `design.md > 2`.
- [x] Línea en `MIGRACIONES_ESPERADAS`: aplicada, sin cambio de lógica; **no** está en `design.md` (m2).
- [x] Migración `20261006140000`: aplicada; `design.md > 2` y `tasks.md > B1` ya usan el nombre nuevo.
- [x] Tres añadidos de UI del diálogo: aplicados (`adjust-batch-counted-error`, el `return` cuando
      Base UI vacía el valor con `details.reason` igual a `none`, y `dismissedState`) y con test;
      **no** están en `design.md > 4` (m2).

## Hallazgos

### B1 — BLOQUEANTE · `tests/unit/inventario/movement-reason.test.ts` en rojo, fuera del baseline
Falla `tests/unit/inventario/movement-reason.test.ts > R9 — ninguna fuente bajo app/ ni lib/ enumera
los motivos a mano`, con este hallazgo:

    lib/modules/inventario/domain/stock-adjustment.ts: enumera los motivos a mano (conteo_fisico, error_de_carga)

La causa es la lista literal de `REASONS_BY_DIRECTION.increase` (`conteo_fisico` y `error_de_carga`),
en `lib/modules/inventario/domain/stock-adjustment.ts:10`, un archivo nuevo de esta rama. El test (de
QC-92) recorre `app/` y `lib/` leyendo el disco y no importa el archivo, así que ni `vitest related`
ni `./init.sh --rapido` lo seleccionan: por eso la bitácora lo da por verde. `./init.sh` completo sí
lo corre, y fallará en F2.4. El archivo no está en `tests/baseline-rojos.json`.

Qué falta: que ese test vuelva a verde sin perder lo que detecta. Hay dos caminos:
- Sacar los dos literales de `stock-adjustment.ts`: por ejemplo, declarar el subconjunto de aumento
  junto a `MOVEMENT_REASONS` en `movement-reason.ts` (el `OWN_FILE` exento) e importarlo desde
  `stock-adjustment.ts`.
- Cambiar la guardia de QC-92 para que admita el archivo. Eso necesita aprobación, porque es la
  guardia de otra ficha.

Decide el implementer o el leader; el reviewer no elige.

### m1 — menor · `design.md > 1.3`: la tabla contradice la enmienda
La fila de `countedStock` dice «prechequeo numérico, luego zod», mientras que el párrafo de justo
debajo (y el código) dice que la action no prevalida. Corregir la celda a
«`readOptionalFormString`, luego zod».

### m2 — menor · Decisiones posteriores que no constan en `design.md`
Solo están en la bitácora:
- los tres añadidos de UI del diálogo: un total parcial bloquea el envío con
  `adjust-batch-counted-error`, se ignora el reset que hace Base UI, y al reabrir se oculta el
  resultado anterior;
- la línea añadida a `MIGRACIONES_ESPERADAS` de `guard-identificador-de-request.test.ts`.

Añadirlos como enmienda en `design.md > 4` y `> 8`, respectivamente.

### m3 — menor · `design.md > 1.8` describe un puente distinto del que se hizo
El §1.8 dice que el puente devolvía `invalid_input` ante una lectura no válida; la bitácora (decisión
2) aprueba que pasara el candidato sin `delta`. El puente ya no existe y no afecta al código; solo
deja el spec desalineado con lo que pasó.

## Veredicto

**RECHAZADO**: 1 bloqueante (B1) y 3 menores.

Vuelve al implementer por B1: `movement-reason.test.ts` R9 en rojo por los literales de
`REASONS_BY_DIRECTION` en `stock-adjustment.ts`. Los menores pueden ir en la misma vuelta. La vuelta 2
puede acotarse al diff de la corrección, y debe volver a correr
`tests/unit/inventario/movement-reason.test.ts` y `tests/unit/inventario/stock-adjustment.test.ts`
(su caso R28 lee las mismas fuentes).

## Vuelta 2 (acotada a afec8f42..ff67376c)

Diff: `movement-reason.ts` (+6), `stock-adjustment.ts` (+2 -2), `design.md` (+30 -3) y la
bitácora. No toca `tests/`, esquema, migraciones ni componentes compartidos.

### Checklist
- [x] B1 cerrado: `STOCK_INCREASE_REASONS` vive en `movement-reason.ts` (el `OWN_FILE` exento),
      tipado `as const satisfies readonly MovementReason[]`; `stock-adjustment.ts` lo importa y ya
      no repite literales. `REASONS_BY_DIRECTION`, `reasonsFor` e `isReasonAllowed` no cambian de
      forma. La guardia de QC-92 no se tocó (sin diff en `tests/`). La constante no se publica en
      el barrel (solo la usan esos dos archivos).
- [x] `tests/unit/inventario/movement-reason.test.ts` y `stock-adjustment.test.ts` (su R28 lee
      las mismas fuentes): 2 archivos, 40 tests, verdes.
- [x] m1 cerrado: la fila de `countedStock` en `design.md > 1.3` dice «`readOptionalFormString`,
      luego zod».
- [x] m2 cerrado: enmienda de UI en `design.md > 4` (total parcial bloquea con
      `adjust-batch-counted-error`, reset de Base UI ignorado, resultado anterior oculto al
      reabrir) y fila de `guard-identificador-de-request.test.ts:447` en `design.md > 8`.
- [x] m3 cerrado: enmienda en `design.md > 1.8` que describe el puente que se hizo.
- [x] Typecheck (`tsc --noEmit`): limpio.
- [x] Lint de los dos archivos tocados: limpio.
- [x] Guardias (`vitest run tests/guards`): 44 archivos verdes.
- [x] `vitest related` de los dos archivos de dominio: 398 archivos, 6 rojos, **todos en
      `tests/baseline-rojos.json`** (`recetas/module-contract`, `configuracion-ui/unidades-viewport`,
      `configuracion-ui/usuarios-viewport`, `inventario/product-page`,
      `navegacion/pantallas-exigen-permiso`, `recetas-ui/recipe-page`). Ninguno nuevo.
- [x] Comentarios: el único añadido en producción (JSDoc de `STOCK_INCREASE_REASONS`) explica el
      porqué y no cita `QC-<n>`, `R<n>` ni `design.md`.
- [x] Mapa R<n> -> test: sin cambios respecto a la vuelta 1.
- No corridos (los corre el leader en F2.4): `.int`, E2E y `./init.sh` completo.

### Hallazgos
Ninguno abierto. Sin regresiones en el rango.

### Veredicto
**OK**.
