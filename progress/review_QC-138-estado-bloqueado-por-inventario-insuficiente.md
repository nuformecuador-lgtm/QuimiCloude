# Review — QC-138 estado-bloqueado-por-inventario-insuficiente

Revisado el 2026-10-02 sobre la rama `feature/QC-138-estado-bloqueado-por-inventario-insuficiente`,
HEAD `98c12926`, diff `origin/dev...HEAD` (102 archivos). La revisión se hizo con Grep/Read y
`git diff`; el grafo de código no se consultó.

Nota del árbol: `git status` marca 12 archivos como modificados (`M`), pero su contenido no cambia:
el blob del worktree es idéntico al de HEAD y solo difieren los metadatos de stat tras normalizar a
LF. No es un hallazgo.

## Checklist

| # | Punto | Resultado |
|---|---|---|
| 1 | Trazabilidad R1..R40 → test | **OK.** Los cuarenta requisitos tienen al menos un test que comprueba el comportamiento de verdad (mapa en la bitácora: tandas A/B/C y T15). Revisé por muestreo títulos y aserciones de `review-blocked-orders.int.test.ts`, `order-crud.int.test.ts`, `qc138-transversales.test.ts`, `order-status-blocked-*` y `e2e/pedido-bloqueado.spec.ts`. |
| 2 | Tasks `[x]` | **Parcial.** `tasks.md` no tiene casillas. El estado de T0..T15 está en la tabla de la bitácora, todo en `[x]`. Ver el menor 1. |
| 3 | CHECKPOINTS | Ver la sección siguiente. |
| 4 | `./init.sh` completo, corrido por mí | **Verde.** `== init OK ==`, `EXIT=0`. Archivos: `5 failed / 805 passed (810)`. Tests: `7 failed / 11176 passed / 128 skipped (11311)`. El gate dice «sin rojos nuevos (5 rojos, todos en el baseline de 5)»: `unidades-viewport`, `usuarios-viewport`, `product-page`, `recipe-page` y `account-status-scope`. Coincide con la corrida 3 del implementer. No volví a correr los E2E; para ellos me baso en la bitácora (50/50 en Chromium+WebKit). |
| 5 | Calidad y seguridad | **OK.** No hay tabla nueva, así que no aplica RLS. No hay webhooks ni secretos. Las capas están separadas: `inventario` declara el puerto `StockIncreaseListener`, `composition` lo conecta y no queda ningún ciclo. La revisión de bloqueados no se publica ni en la fachada ni en ninguna action. |
| 6 | Multiplataforma | **OK.** Las acciones del modal y el botón «Entrar» deshabilitado llevan `min-h-11 min-w-11`, y un E2E comprueba que miden ≥44 px. El motivo se muestra como texto visible, enlazado con `aria-describedby`. No hay `100vh`, ni `:hover` como única vía, ni inputs nuevos. `AlertDialog` es Radix y ya se usaba en la app. |
| 7 | Dependencias | **OK.** `package.json` no cambia, y lo vigila `qc138-transversales` (R39). |
| 8 | Aislamiento por empresa | **OK.** No hay modelo nuevo. `findBlockedOrderIds` y `setAliveOrderIngredientsCost` filtran con `orderCompanyScope`. La revisión recibe el `companyId` del movimiento, y el movimiento lo toma del actor. Hay test de acceso cruzado: R18/R38 en `review-blocked-orders.int.test.ts` y R38 en `company-isolation-service.test.ts`. |
| 9 | Comentarios | **OK.** Ninguna línea añadida o modificada en código de producción (`lib/`, `app/`, `components/`, `db/`) cita `QC-n`, `R<n>`, `design.md` ni «decisión cerrada». Comprobado con grep sobre `git diff -U0 --ignore-cr-at-eol`. |

### CHECKPOINTS.md, punto por punto

- **Especificación.**
  - requirements EARS R1..R40 ✔.
  - design con alternativas descartadas A..E y su porqué ✔.
  - tasks marcadas `[x]` ✗ (menor 1).
- **Trazabilidad.** Cada R tiene su test ✔, y el mapa está en `progress/impl_…` ✔.
- **Calidad de código.**
  - typecheck ✔, lint ✔ (0 errores) y tests ✔ (solo rojos del baseline).
  - El flujo crítico (inventario e importes) tiene E2E ✔ (`e2e/pedido-bloqueado.spec.ts`).
  - Multiplataforma ✔. Sin dependencias nuevas ✔.
- **Datos y seguridad.**
  - No hay tabla nueva.
  - Los permisos se validan en el service ✔: `pedidos.modificar` en alta y edición, `inventario.modificar` en el disparo y `asignaciones.consultar` para el Operador. Lo prueban `authorization.test.ts` y el test de R37.
  - El acceso a datos pasa solo por el repositorio Prisma ✔.
  - Las dos migraciones tienen `down.sql` ✔. El DOWN aborta si hay pedidos `BLOQUEADO` y, si no hay, recrea el tipo, los CHECK y los índices. Lo prueban `order-status-blocked-rollback.int.test.ts` y `order-status-blocked-migration.test.ts`.
  - Sin secretos ✔. Sin webhooks (no aplica).
- **Hexagonal.**
  - `domain/` y `ports/` no importan framework ✔.
  - Entre módulos se importa solo el contrato ✔.
  - Ningún adaptador driving instancia su driven ✔ (guardias en verde).
  - La lógica vive en `domain/` (`review-blocked-orders.ts`, `create-order.ts`, `update-order.ts`); la action solo lee `confirmBlocked` ✔.
- **Permisos y configuración.** Sin cambios relevantes ✔.
- **Verificación final.**
  - `./init.sh` en verde ✔ y este review ✔.
  - Quedan para el leader al cerrar: la entrada en `progress/history.md`, desmontar el worktree y borrar la base `QuimiCloude_QC138`.

## Puntos que el leader pidió validar

- **Tests de QC-141 adaptados: siguen vigilando lo mismo, y en algún caso más.**
  - `order-reservation-concurrency` R16: sigue afirmando una sola reserva de 1.500 sobre 2.000. Ahora afirma además que el perdedor no deja ni pedido ni asiento, algo que antes no se comprobaba.
  - Merma simultánea: sigue comprobando que el stock queda en cero gane quien gane, y el asiento del ganador.
  - `order-reservation` R13 y R52: conservan los asientos `reserve`/`release`, que no aparezca ningún `consume` y que el `status` de entrada no mueva el pedido. Solo cambia el estado esperado, que ahora es `BLOQUEADO` (R11).
  - E2E R48: conserva el inventario, la cobertura `none` de B y lo de A intacto. Añade dos comprobaciones: B queda `BLOQUEADO` sin movimientos y pasa a `PENDIENTE` al reeditarlo.
- **`openEdit` con `toPass`: aceptable, no tapa un bug de la feature.** El reintento solo envuelve la apertura del formulario de edición; las aserciones de negocio quedan fuera. La causa (clic antes de hidratar en WebKit) no está confirmada. Ver el menor 4.
- **Guardias ampliadas: correcto.**
  - `E2E_ESPERADOS` y la lista cerrada de `data-table-alcance` (de 24 a 25) se amplían por su punto de extensión documentado, con un comentario del motivo y sin relajar el ancla.
  - `MIGRACIONES_ESPERADAS` gana las dos migraciones.
  - `aislamiento.json` gana dos entradas, cada una con su motivo.
- **Paso de CRLF a LF: correcto.** Con `--ignore-cr-at-eol`, `components/index.ts` solo añade 9 líneas reales y `order-columns.test.tsx`, 13. `git ls-files --eol` da `i/lf w/lf`.
- **Derogación de QC-123: hace falta una nota y no está.** Ver el menor 2.

## Hallazgos

No hay bloqueantes.

1. **menor — `tasks.md` sin casillas `[x]`.**
   - `CHECKPOINTS.md` pide «todas las tasks marcadas `[x]`».
   - La bitácora lo justifica con «igual que el de QC-168», y eso es falso: `specs/QC-168-estado-por-empacar/tasks.md` sí las usa (`### T1 [x] — …`).
   - El trabajo está hecho, según la tabla de la bitácora y el gate.
   - Arreglo: marcar `[x]` en T0..T15 de `tasks.md` y corregir esa frase de la bitácora.
2. **menor — Falta la nota de derogación en el spec de QC-123.**
   - QC-138 D3 deroga la decisión D8 de QC-123: «Entre ediciones queda congelado: comprar un lote caro mañana no toca ningún pedido ya creado». Está en `specs/QC-123-…/requirements.md`, fila del 2026-09-18.
   - Ahora el desbloqueo automático recalcula el importe (R15).
   - QC-141 dejó su nota fechada en la cabecera de ese archivo; QC-138 no.
   - Arreglo: añadir una nota análoga, fechada, que apunte a `specs/QC-138-…/requirements.md` D3/R15. Es tarea de spec para el leader o el humano, no de código.
3. **menor — `design.md` desfasado frente a lo implementado.**
   - §4 titula y dibuja la matriz como 5×5, con 25 pares. La real es 7×7, con 49 pares, desde QC-168.
   - `tasks.md > T1 > Hecho` también dice «25 casos».
   - La bitácora lo recoge como desviación, pero el spec sigue diciendo lo viejo.
4. **menor — `openEdit` reintenta sin causa confirmada.**
   - El `toPass` de `e2e/reserva-de-material.spec.ts` es razonable.
   - Si la causa es un clic antes de hidratar, es un defecto de UX real: en un dispositivo lento el clic se pierde. Es anterior a la ficha.
   - Conviene abrir una ficha que lo investigue en lugar de dejarlo solo en el comentario del test.
5. **menor — Título del modal elegido por el implementer.**
   - El spec fija los dos botones (R7), pero no el título. El implementer puso «Material insuficiente» (tanda C, desviación 1).
   - Hay que confirmarlo con el humano o anotarlo como decisión.

## Veredicto

**OK.** No hay bloqueantes. Los cinco menores son de estado en disco y de spec. El 1 y el 2 conviene cerrarlos antes del PR.
