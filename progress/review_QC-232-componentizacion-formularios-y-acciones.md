# QC-232 — componentizacion-formularios-y-acciones · review

Reviewer, 2026-10-09. Rama `feature/QC-232-componentizacion-formularios-y-acciones` en `1afef73e`,
merge-base con `dev` `8f5dc87e`. Leído: requirements (con la enmienda R33), design, tasks, la bitácora del
implementer, `progress/features/QC-232.md`, `CHECKPOINTS.md`, `docs/checkpoints-proyecto.md` y
`docs/perfil-agentes.md`. No usé el grafo: el diff de la rama no está indexado, así que trabajé con
`git diff`, Grep y Read.

## Verificación ejecutada (por mí)

| Comando | Resultado |
|---|---|
| `prisma generate` + `next typegen` + `pnpm run typecheck` | exit 0 |
| `pnpm run lint` | 0 errores, 7 avisos (los mismos que antes, en archivos ajenos a esta rama) |
| `pnpm exec vitest run guard` | 63 archivos; 858 tests pasan y 15 se saltan |
| `guard-formularios-y-acciones` + `guard-piezas-base` (verbose) | 47 pasan y 1 se salta (el caso R33 de QC-231, que solo corre en la rama de QC-231). Los casos por diff R4, R30 y R31 **sí corren** en esta rama |
| `vitest related --run` sobre los 98 archivos de producción, en 4 tandas por el límite de la línea de comandos | 64/963, 66/1244, 232/3684 y 182/3025: todo verde. Solo saltan tests con `skipIf` |
| `vitest run tests/unit/shared-ui tests/unit/paridad` | 41 archivos; 650 tests pasan y 2 se saltan |
| `node scripts/archivos-en-vuelo.mjs --candidata QC-232` | «sin conflicto de archivos con 7 feature(s) en vuelo» |
| Snapshots de T0 (`acciones-por-fila`, `asignacion-listas-paridad`, `campos-`, `confirmaciones-` y `formularios-paridad`) | Un único commit (`cbccd827`) y nunca se regeneran. Los `.test.tsx` solo cambian de import, a los barrels (R4 a) |
| Diff de las 7 paridades de QC-231 regeneradas | Solo cambian la celda de acciones y el nombre calculado del `tr`/`td`, que deriva de esa celda (R4 c) |

No he corrido E2E. Los specs editados solo ganan el paso de abrir el menú. Los rojos locales se
deben a que la base no tiene las migraciones de QC-219, y `grupos-de-trabajo:495` ya fallaba en
`dev`. Ninguno de los dos es de esta feature. Quedan para CI.

## Checklist

### CHECKPOINTS.md
- [x] `requirements.md` EARS con R1–R33.
- [x] `design.md`: tiene alternativas descartadas (A1–A5).
- [ ] **`tasks.md` todo `[x]`: faltan T0c y T5e** (capturas, R3). Ver H1.
- [x] `design.md` abre con `## Lo que ya existe`, y el diff no re-crea nada de esa lista:
  - `RowActionsMenu` y `SharedSelect` se amplían de forma aditiva;
  - `ConfirmActionDialog` se absorbe y se borra;
  - se reutilizan los helpers de E2E;
  - el helper unit nuevo lo permite R25.
- [x] Assignee y rama publicada (`progress/features/QC-232.md`).
- [x] Hay mapa R→test en la bitácora. Lo contrasté abajo.
- [x] typecheck y lint.
- [ ] `gate-completo` en CI: no hay PR todavía. Es del leader.
- [x] Flujo crítico: no se toca ninguna lógica de permisos, inventario ni importes, solo la UI. Los E2E de inventario se editan solo por R25.
- [x] Sin dependencias nuevas: R31 por guardia y `package.json` sin tocar.
- [x] Sin secretos ni webhooks. Sin hardcode de configuración.
- [ ] `./init.sh` verde: lo afirma la bitácora (T5d) y lo que yo corrí cuadra. Falta `gate-completo`.
- [ ] Review OK: no, ver el veredicto.
- [ ] `progress/features/QC-232.md > Cierre`: pendiente (leader).

### docs/checkpoints-proyecto.md
- [x] typecheck y lint.
- [x] Multiplataforma:
  - el disparador mide 44×44 y está siempre en el DOM;
  - los items llevan `min-h-11` y el menú mide 200 px o más;
  - no depende de `:hover`;
  - los 16 px y el `min-h-11` de los inputs los congela `campos-paridad` sin regenerar.

  Lo declara `design.md > 11`.
- [x] Datos y seguridad, módulos hexagonales y permisos: no aplican, porque el diff no toca `lib/`, `db/` ni las Server Actions.

### Reglas del reviewer (`docs/perfil-agentes.md`)
- [x] 5. Calidad y seguridad: las capas siguen separadas y el estado de cada action sigue en su diálogo o formulario.
- [x] 6. Multiplataforma: ver arriba.
- [x] 7. Dependencias: ninguna.
- [x] 8. Aislamiento por empresa: no aplica.
- [ ] **9. Comentarios: hay líneas de producción modificadas que siguen citando `R<n>` y «decisión cerrada».** Ver H2.

## Trazabilidad R → test (comprobada)

| R | Test | ¿Verifica? |
|---|---|---|
| R1 | Las 5 paridades de T0, sin regenerar, y las de QC-231 regeneradas solo en la celda | sí |
| R2 | Tests de panel y diálogo sin editar en la tanda 2 (`vitest related` en verde) y E2E en CI | sí |
| R3 | **Capturas antes y después: no existen** (`_trabajo/marca/capturas-formularios-*`) | **no** (H1) |
| R4 | `guard-formularios-y-acciones > R4` (por diff, corre en esta rama) y revisión de los snapshots | sí; ediciones fuera de (b), ver decisión 1 |
| R5 | typecheck, guardias `*-convenciones` y route-contracts | sí; ver decisión 3 |
| R6–R10 | `form-sheet.test.tsx`: un caso por R, con aserciones reales | sí |
| R11 | `use-entity-sheet.test.tsx`: el orden cerrar, toast y refresh | sí |
| R12–R15 | `confirm-dialog.test.tsx` y `confirmaciones-paridad` | sí |
| R16–R19 | `campos.test.tsx` y `campos-paridad` (con los atributos de envío) | sí |
| R20, R22, R23 | `acciones-por-fila` sin regenerar. El nombre del disparador lo cubren las paridades de QC-231 regeneradas, `work-group-columns`, `delete-catalog-line-dialog` y `product-batches-sheet` | sí |
| R21 | `row-actions-menu-href.test.tsx`, el `href` de `acciones-por-fila` y el E2E `versiones-en-la-receta` | sí |
| R24 | `actions-column.test.tsx` y la paridad de la celda | sí |
| R25 | Unit y E2E con `tests/helpers/row-actions-menu.ts` y `e2e/helpers/row-actions-menu.ts` | sí (E2E en CI) |
| R26 | `guard-piezas-base > QC-232 (R26, R28)`. En `app/`, `components/` y `hooks/` no queda ningún `EMPTY_CELL`; `step-document-view` queda como deuda (P5) | sí |
| R27 | `asignacion-paridad` y `asignacion-listas-paridad`, sin regenerar ni editar | sí |
| R28 | `guard-formularios-y-acciones`: 4 reglas con su muestra que muerde y excepciones cerradas que muerden | sí |
| R29 | `progress/deudas.md` D37–D50 | sí; ver m4 |
| R30, R31 | Casos por diff de la guardia (corren en esta rama) y `guard-dependencias-aprobadas` | sí |
| R32 | `archivos-en-vuelo`: sin conflicto (lo repetí yo) | sí |
| R33 | `confirm-dialog-montado.test.tsx`: tras cerrar sigue en el DOM con `data-closed` mientras sale (pieza, usuarios, grupos, pedidos, las 6 bajas de fila y el panel de lotes) | sí; ver decisión 2 |

## Decisiones sobre los puntos que el implementer dejó al reviewer

1. **Ediciones «+ P2» y «+ táctil»: ACEPTADAS.**
   - **P2.** Su texto ya avisaba de que el verbo corto «amplía la excepción R4 (b)», y el humano eligió esa
     opción (`progress/features/QC-232.md > Decisiones`). Que la etiqueta con el nombre pase al
     disparador es la consecuencia directa.
   - **Táctil.** Mover el 44×44 al disparador es lo que fijan R20 y `design.md > 11`. Los items del
     menú no son botones de icono y siguen con `min-h-11`.
   - **Lo que sí ha cambiado en cada edición** es el objetivo dentro de la celda de acciones, que es
     la única excepción a R1. Fuera de ella no se ha debilitado ninguna aserción:
     - `aislamiento-inventario` y `versiones-en-la-receta` siguen exigiendo el item y su `href`, a
       través del helper;
     - las paridades de las celdas son correctas.
   - Queda como menor que R4 no se enmendó por escrito (m1).
2. **R33 (montado tras la primera apertura y `skipIf`): ACEPTADO.**
   - **El estado `null` antes de la primera apertura.** Cumple el objetivo de la enmienda: la salida
     anima, y el test comprueba `data-closed` en el DOM tras cerrar. Además no toca el árbol inicial,
     que es lo que R1 protege y lo único que R33 excepciona.
   - **El `skipIf` de inventario y catálogo.** Comprobé en `8f5dc87e` que `DeleteProductDialog` ya
     estaba siempre montado con `useActionState`, así que en `dev` el error anterior ya reaparecía.
     Conservarlo es lo que piden R1 y R2.
   - Menor: el caso saltado podría afirmar el comportamiento real en vez de saltarse (m2).
3. **R5 (etiquetas sin nombre y cuatro sin uso, D48): ACEPTADO.**
   - Las etiquetas conservan el export y su contenido cambia por P2, que es el cambio visible
     declarado.
   - Borrar las 4 que quedan sin uso violaría R5. Dejarlas como deuda es correcto.
4. **`step-document-view` como deuda (D44): ACEPTADO.** Es exactamente la regla que el humano fijó en P5.
5. **Archivos añadidos a «Archivos esperados»: ACEPTADO.**
   - Los barrels, `user-table`, `work-group-table` y `data-table.test.tsx` entraron en `tasks.md`
     **antes o en el mismo commit** que el cambio:
     - `add11cda` va antes de `d6397a17`;
     - `dbc131f9` va antes de `6328954c`;
     - `5c2dc172` va antes de `5d1bb66f`.
   - Ninguno está en «Lo que NO entra» y `archivos-en-vuelo` sigue sin conflicto.
6. **Commit `546c9863` con el borrado de `confirm-action-dialog.tsx`: ACEPTADO como menor (m3).**
   - El estado final es correcto.
   - Pero `546c9863`, `fd7264c0`, `c3492939` y `5c2dc172` no compilan: los 3 consumidores de
     asignación aún la importaban hasta `dd58ddc9`. Eso rompe `git bisect` en ese tramo.
   - No pido reescribir una rama publicada. Si el merge es squash, no tiene efecto.

## Hallazgos

### H1 — BLOQUEANTE: R3 sin evidencia; T0c y T5e abiertas
- No hay capturas antes ni después (`_trabajo/marca/capturas-formularios-antes|despues/` no existen).
- R3 pide que el reviewer deje constancia de que las parejas solo difieren en la celda de acciones.
- `CHECKPOINTS.md` exige todas las tasks en `[x]`.

**Qué falta (leader):**
- Hacer las «antes» sobre `8f5dc87e` (o `dev`), que tienen la producción sin tocar. Ya no pueden
  hacerse «antes de tocar código», pero el estado de la UI es el mismo.
- Hacer las «después» sobre esta rama, con el menú abierto en cada tabla.
- Anotar el índice en `progress/features/QC-232.md` y marcar T0c y T5e.
- Una vuelta de review acotada a la tabla de parejas.

### H2 — BLOQUEANTE (regla 9): comentarios de producción modificados que siguen citando R y «decisión cerrada»
El diff reescribe estas líneas de comentario y conserva la cita:
- `app/(private)/configuracion/unidades/components/unit-row-actions.tsx`:
  - el bloque JSDoc: «… la celda queda VACIA** (R29): sin disparador, …» y «… (decision cerrada del
    2026-09-08, alternativa E …»;
  - el comentario de línea: «// R29: la celda de una unidad de sistema no emite NADA. Los hooks de estado van arriba porque …».
- `app/(private)/proveedores/[id]/components/catalog-columns.tsx`: «Marca de «no resuelto» de
  presentacion y unidad (R22). Es **distinta** de `EMPTY_MARK` …». Solo cambió `EMPTY_CELL` por
  `EMPTY_MARK`, pero la línea está modificada.

**Qué falta:** quitar de esas líneas las citas `R29`, `R22` y «decision cerrada …» y conservar el
porqué. `tasks.md` ya lo pedía («al tocar una línea se limpian sus comentarios»).

Lo demás que detecta el script son líneas movidas sin cambiar el texto: 26 en `order-sheet.tsx`, 6 en
`order-form.tsx`, 6 en `user-form.tsx` y 1 en `work-group-form.tsx`, con citas a QC-102, R25, etc. Las
cuento como menor (m5).

### Menores
- **m1.** R4 enumera (a)–(c), y las ediciones «+ P2» y «+ táctil» van más allá de (b). Las acepto
  (decisión 1), pero conviene una línea en `requirements.md` (o en las Decisiones de la feature)
  que diga que P2 y `design.md > 11` amplían R4 (b). Algunos títulos de test han quedado viejos: por
  ejemplo, `presentation-columns` dice «los dos botones…» y «los dos objetivos tactiles» cuando ya
  son items y un solo disparador.
- **m2.** `confirm-dialog-montado`: en inventario y catálogo, en vez de `it.skipIf`, el caso podría
  afirmar el comportamiento heredado (que el error reaparece), para que un cambio no pase en silencio.
- **m3.** Los commits `546c9863`..`5c2dc172` no compilan, por el borrado adelantado de
  `confirm-action-dialog.tsx`.
- **m4.** D39 asigna a QC-223 el `TOUCH_TARGET` local de `order-sheet.tsx`, pero P1 constató que
  QC-223 no toca ese archivo y esta rama sí lo tocó. El dueño de la deuda no cuadra: o se resuelve
  aquí, o el dueño es otro. No es un requisito, porque no está en `design.md > 6`.
- **m5.** En `order-sheet`, `order-form`, `user-form` y `work-group-form` hay comentarios
  preexistentes con citas `QC-`/`R<n>` que el diff mueve o reindenta sin limpiar.
- **m6.** El primer comentario de `e2e/helpers/confirm-dialog.ts` cita el archivo borrado (D50, ya anotado).

## Veredicto

**RECHAZADO.**
- **H2 (implementer):** limpiar las 4 líneas de comentario en `unit-row-actions.tsx` y
  `catalog-columns.tsx`.
- **H1 (leader):** hacer las capturas de R3 y marcar T0c y T5e.

El resto está verificado y en verde:
- paridades sin regenerar;
- guardias, incluidos los casos por diff;
- `vitest related` sobre todo el diff de producción;
- typecheck y lint;
- `archivos-en-vuelo`.

La vuelta 2 puede acotarse al diff de H2 y a la tabla de parejas de H1.
