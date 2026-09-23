# QC-145 — pedidos-terminados-en-asignacion · review (F2.2)

> Reviewer, 2026-09-23. Rama `feature/QC-145-pedidos-terminados-en-asignacion`, diff contra
> `origin/dev` (merge-base tras `c674f8a5`). No se corrió `./init.sh` ni la suite completa: el
> leader corre el gate completo en paralelo. Tampoco se re-ejecutó el E2E (8/8 en Chromium y
> WebKit según la bitácora); no hubo motivo para sospechar de él.

## Verificación ejecutada por el reviewer

- `pnpm exec vitest run` sobre 28 archivos: `qc145-estado-solo-planta`,
  `orders-finished-at-migration`, `assignment-views`, `responsible-eligibility`,
  `list-responsible-candidates`, `assign-responsibles`, `list-company-orders`,
  `list-finished-orders`, `asignaciones/authorization`, `pedidos/update-order`,
  `pedidos-ui/order-form`, `identity/roles/empacador-rol` y todo `tests/unit/asignaciones-ui/`.
  Resultado: **28 files / 360 tests passed**.
- La integración (`order-finished-at`, `finished-orders`, `company-orders`,
  `responsible-eligibility`, `order-catalog-company-summary`, `assignment-directory`) se revisó
  leyendo el código. No se corrió: la corre el gate del leader.

## Checklist

| # | Punto | Estado |
|---|---|---|
| 1 | Trazabilidad R1-R37 → test | OK. Los 37 están en el mapa de la bitácora. Todos los archivos existen y los casos llevan `R<n>` en el nombre. Se leyeron los de R3/R4/R5/R9 (int), R10/R16/R29 (fuente), R11-R15, R18/R23, R33-R37 (int y unidad), R7 (FormData sin `status`), R24/D16 (int) y R28 (E2E). Prueban lo que dicen. |
| 2 | Tasks `[x]` | **Pendiente.** T1-T16 `[x]`. T17 sigue `[ ]` porque su «hecho» es `./init.sh` completo, que está corriendo el leader. No es un hallazgo de código, pero la feature no puede cerrarse sin él. |
| 3 | CHECKPOINTS | Ver abajo. |
| 4 | Verificación ejecutable | Unidad en verde (arriba). `./init.sh` completo: lo corre el leader. |
| 5 | Calidad y seguridad | OK. Sin tabla nueva, así que no hay RLS que añadir: `orders` ya tiene `company_id` y RLS forzada. Sin webhooks, sin secretos y sin contexto hardcodeado. Capas separadas: la lógica vive en `domain/` y las acciones son «tontas». |
| 6 | Multiplataforma | OK. Pestañas `min-h-11 min-w-11 text-base`, enlace real y activo por `data-active`, sin `:hover` como única vía. Sin `100vh`. Sin inputs nuevos: el filtro es el de `DataTable`. Sin librería nueva. |
| 7 | Dependencias | OK. `package.json` no está en el diff. Lo fija `qc145-estado-solo-planta` R29. |
| 8 | Aislamiento por empresa | OK. No hay modelo nuevo, solo una columna. `listAliveSummariesInCompany` usa `orderCompanyScope`, `listAliveInCompany` filtra por `companyId` y `composeOrderRows` pasa `companyId` a todos los puertos. Rechazo cruzado probado en `company-orders.int` («actor de la empresa B no ve nada de A»), `finished-orders.int` R17 y `assignment-directory.int`. |
| 9 | Comentarios | **FALLA.** Ver M1. |

### Puntos de atención pedidos por el leader

- **Autorización por permiso, nunca por rol (D4, D13).** OK. `resolveAssignmentViews` y
  `canBeResponsible` resuelven con `assertPermission` en `try/catch`. Los casos de uso llaman a
  `requirePermission` en la primera línea: `terminados.consultar`, `pedidos.consultar` y
  `asignaciones.modificar`. Ninguna línea añadida en `app/` o `lib/` nombra `roleName` ni
  `ROLE_*`, y `PersonRef` expone permisos, no el nombre del rol.
- **La edición ya no mueve el estado y Cancelar sigue intacto.** OK. `updateOrderSchema =
  createOrderSchema` (descarta `status`), `OrderEdit = Omit<NewOrder,'status'>`,
  `updateAliveOrder` sin `status` en `data`, `assertTransition(row.status, row.status)` para R8 y
  `buildUpdateCandidate` sin `status`. `cancel-order`, `cancelAliveOrder` y `order-transitions.ts`
  no están en el diff.
- **`finished_at` en la misma operación, con CHECK y down.** OK. Va en el mismo `updateMany` de
  `transitionAliveOrder`, y solo cuando `to === 'ENTREGADO'`. El CHECK
  `orders_finished_at_requires_delivered` está probado por SQLSTATE 23514 en integración. El
  `down.sql` revierte en orden inverso (índice, CHECK, columna). La bitácora pega el ciclo
  migrate → rollback → migrate sobre `QuimiCloude_QC145`.
- **Nulos al final explícitos (D14, D16).** OK. `{ finishedAt: { sort: 'desc', nulls: 'last' } }`,
  después `orderYear desc` y `orderSequence desc`, con desempate por `id asc`. El índice parcial
  declara `DESC NULLS LAST`. `resolveOrdering` exige `length === 1 && [0] === 'ENTREGADO'` tras
  deduplicar. Probado en unidad (duplicados, mezcla) y en integración.
- **Selector y `user_cannot_be_responsible` (D13, D18); D17 sin migración de datos.** OK. El
  rechazo entero va después de `isActive`, en el orden no existe → inactiva → no elegible. En los
  grupos, los miembros no elegibles se omiten en silencio con una sola llamada a
  `findAliveRefsInCompany`. El código tiene entrada en el catálogo de errores (52). La migración
  no nombra `order_assignments` (test R37), y los tres casos de uso de ejecución y
  `app/(private)/asignacion/[id]/**` no están en el diff.
- **Enmiendas a tests de otras fichas y baseline.** OK. `empacador-rol` abre la puerta por dos
  rutas exactas. `guard-qc87` añade `ACCIONES` +3, `catalogo` sube a 52 y `pedidos-constraints`
  añade `finished_at`. `guard-identificador-de-request` añade la migración y el E2E con su motivo.
  `tests/baseline-rojos.json` **no** está en el diff.
- **Timestamp de la migración.** OK. `20260923120000_orders_finished_at` es posterior a
  `20260922160000_recipe_lines_percentage`, la última de `origin/dev`.

### CHECKPOINTS.md

- Especificación: requirements EARS R1-R37 ✔. design con 9 alternativas descartadas ✔. tasks:
  **T17 `[ ]`** (pendiente del gate).
- Trazabilidad: ✔ (mapa en `progress/impl_…md`).
- Calidad de código: typecheck y lint en verde según la bitácora. `pnpm test` e `init.sh`
  completo los corre el leader. Hay E2E porque toca permisos ✔. Multiplataforma ✔. Sin
  dependencias ✔.
- Datos y seguridad: sin tabla nueva ✔. Permisos en el service con test ✔ (R18, R23, R32
  `asignaciones.modificar`, R33). Solo Prisma ✔. Migración con `down.sql` y rollback probado ✔.
  Sin secretos ✔. Sin webhooks (n/a).
- Módulos hexagonales: `domain/` solo importa `zod` y contratos públicos (`@/lib/modules/<x>`) ✔.
  Las acciones no se reexportan del barrel ✔. `asignaciones` no toca el puerto interno de
  `pedidos`: usa `OrderCatalog` ✔. La lógica está en `domain/` ✔.
- Permisos: `page.tsx` valida `asignaciones.consultar` en servidor y reparte vistas por permiso
  ✔. Las mutaciones son Server Actions ✔.
- Verificación final: `init.sh` (leader), este review, `history.md` y el desmontaje del worktree
  quedan para el cierre.

## Hallazgos

### MAYOR (bloqueante)

**M1. Comentarios de producción, en líneas que añade o modifica el diff, citan requisitos o
decisiones cerradas** (`docs/conventions.md > Comentarios`; checklist del reviewer n.º 9).

| Archivo:línea | Texto | Estado en `origin/dev` |
|---|---|---|
| `app/(private)/pedidos/components/order-form.tsx:103` | `**R28 — la edicion precarga y es REEMPLAZO COMPLETO**` | La línea era `**R28, R29 — …**`. La rama la **reescribe**. |
| `app/(private)/pedidos/components/order-form.tsx:441` | `(reemplazo completo, R28); se` | La rama la **reescribe** (antes decía «MAS el estado»). |
| `app/(private)/pedidos/components/order-list-section.tsx:176` | `filtra sobre lo que ya llego (R27).` | La rama la **reescribe** (antes era «El tamano es…»). |
| `lib/modules/asignaciones/domain/list-company-orders.ts:34` | `ordena como «Terminados» (D16)` | Archivo **nuevo**. `D16` es una decisión cerrada citada por su número. |

La bitácora (desviación 6) dice que las citas `R27`/`R28` que quedan son preexistentes y que la
rama no toca esas líneas. **No es así**: las tres aparecen como `+` en `git diff origin/dev...HEAD`
porque el implementer reescribió el comentario y conservó la cita. La regla pide limpiar el
comentario de toda línea que la rama toca.

**Qué falta:** quitar `R28`, `R27` y `(D16)` de esas cuatro líneas, sin cambiar código, en un
commit `chore(QC-145): limpia comentarios …`. Conviene arreglar en el mismo commit m1 y m2.

### menor

- **m1.** `app/(private)/asignacion/components/company-orders-table.tsx:91` cita
  `(T12 lo deja fuera del esquema compartido …)`. Es una task del spec. No está en la lista
  literal (`QC-<n>`/`R<n>`/`design.md`/«decisión cerrada»), pero es la misma historia de ficha
  en producción.
- **m2.** Referencias a la historia de la ficha en líneas tocadas:
  `lib/modules/pedidos/domain/order-input.ts:103-104` conserva «Es la pregunta abierta 5 del
  spec» en una línea que la rama re-envuelve, y
  `lib/modules/asignaciones/domain/list-responsible-candidates.ts:25` dice «antes de esta
  ficha».
- **m3. Motivo inexacto en comentarios nuevos.** `assign-responsibles.ts:102`,
  `responsible-eligibility.ts:3-4`, `errors.ts:334-335` y `error-codes.ts:864-865` justifican la
  regla con «tiene permiso para consultar **sus propios** pedidos». `pedidos.consultar` es
  «Consultar pedidos y su contenido», es decir, todos los de la empresa
  (`identity/domain/permissions.ts:99-102`). La razón escrita no es la de D13. Un comentario con
  la razón equivocada es peor que ninguno: hay que corregirlo o quitarlo.
- **m4. Constantes muertas en `order-form.tsx`.** `ORDER_STATUS_FIELD`,
  `ORDER_STATUS_SELECT_TESTID` y `ORDER_STATUS_OPTION_TESTID` ya no marcan ningún nodo. La
  bitácora lo declara: las retiene `guard-pantalla-pedidos-se-amplia`. Consecuencia: el paso R7
  del E2E (`toHaveCount(0)` de `ORDER_STATUS_SELECT_TESTID`) nunca puede fallar. R7 sí queda
  cubierto de verdad por `order-form.test.tsx` («la edición no … lo envía»: `FormData` sin
  `status`). Se recomienda una ficha para enmendar la guardia y retirar las constantes.
- **m5. Citas en comentarios de tests** (`docs/conventions.md`: en tests rige la misma regla para
  comentarios, y `R<n>` solo va en el nombre del caso). Unas 49 líneas añadidas en `tests/` y
  `e2e/` citan `QC-145`, `T<n>`, `D17` o `design.md`. Ejemplos: `guard-qc87-no-reimplementado.test.ts`
  («QC-145 T11 … `design.md > 4`»), `errores/catalogo.test.ts` («QC-145 R33»),
  `empacador-rol.test.ts` («QC-145 T7»), `pedidos-constraints.int.test.ts` («(QC-145)») y
  `responsible-eligibility.int.test.ts` («(D17)»).
- **m6. Bloques largos o que repiten el código.** Cabecera de 10 líneas en
  `migration.sql`. Cinco bloques de `asignaciones/index.ts` que repiten «Bloque NUEVO al final:
  no reordena ni reformatea nada de lo de arriba». En `assigned-orders-list-params.ts:71-76`, el
  porqué de un parámetro opcional son «las pruebas existentes».
- **m7.** `responsible-eligibility.int.test.ts` R35 dice «no se escribe nada», pero solo
  comprueba que `status` sigue `PENDIENTE`. Falta afirmar `finished_at`/`updated_at` sin cambio y
  que no aparece ninguna fila en `order_assignments`.

### Observación (no es hallazgo)

- `listResponsibleCandidates` aplica el tope de 25 **antes** de filtrar a los no elegibles. Con
  más de 25 personas vivas, los que tienen `pedidos.consultar` ocupan hueco y el selector puede
  ofrecer menos de 25. Es lo que dice `design.md > 3.6` (paso 3 y luego 4), así que no se marca.

## Veredicto

**RECHAZADO**: 1 mayor (M1) y 7 menores.

Para pasar a OK hace falta:
1. Corregir M1, un commit de solo comentarios.
2. `./init.sh` completo en verde (lo está corriendo el leader) y marcar T17 `[x]`.

Todo lo demás (autorización por permiso, edición sin estado, `finished_at` atómico con CHECK y
down, nulos al final explícitos, D13/D17/D18, enmiendas y baseline, timestamp de la migración)
está correcto y probado.

---

## Revisión 2 (2026-09-23, solo el delta)

> Se revisaron `c16d8172`, `3897a675`, `6e669c5b`, `e033caf2`, `4688bded`, `918ca399`,
> `5ed60802` y `5eaa3d2d`, más la sección «Vuelta 2» de `progress/impl_…md`. No se corrió la
> suite ni el E2E: el leader está corriendo `./init.sh` completo.

### Cómo se verificó

- Se buscaron citas en todas las líneas que añade la rama (`git diff origin/dev...HEAD -U0` sobre
  `app lib db components tests e2e`), con el patrón
  `QC-n | R<n> | D<n> | T<n> | design.md | decisión cerrada | pregunta abierta | esta ficha`
  y quitando los nombres de caso (`it`/`test`/`describe`).
  - **Comentarios de producción:** 0.
  - **Comentarios de tests y E2E:** 0.
  - Solo quedan citas en **cadenas**, no en comentarios: mensajes de aserción (`'… (R32)'`,
    `'… (R29)'`, `'… (R36)'`), textos de `throw new Error('QC-145: …')` en dobles y el campo
    `"motivo"` de `tests/integration/aislamiento.json`, que en `origin/dev` ya usa ese formato en
    6 entradas. Ninguna es un comentario, así que no entra en la regla.
- `c16d8172` y `6e669c5b`: fuera de las líneas de comentario, sus diffs sobre `app lib db` no
  tienen ninguna línea `+`/`-`. Solo tocan comentarios, como pide la convención.

### Estado de los hallazgos de la revisión 1

| Hallazgo | Estado |
|---|---|
| **M1** | **Cerrado.** `order-form.tsx:103` («La edicion precarga…»), `:441` («(reemplazo completo)»), `order-list-section.tsx:176` («filtra sobre lo que ya llego.») y `list-company-orders.ts:34`, sin `R`/`D`. |
| m1 | Cerrado. No queda `T12` en `company-orders-table.tsx`. |
| m2 | Cerrado. En los archivos del diff no quedan «pregunta abierta» ni «esta ficha». Las dos «pregunta abierta» que siguen en `asignaciones/domain/` están en `remove-work-group-from-order.ts` y `unassign-responsible.ts`, que la rama no toca. Son preexistentes y no son hallazgo. |
| m3 | Cerrado. El motivo ahora es «supervisa los pedidos de toda la empresa», que sí concuerda con `pedidos.consultar` («Consultar pedidos y su contenido») y con D13. |
| m4 | **Cerrado en parte, justificado.** El E2E añade `getByRole('combobox', { name: /estado/i })` con `toHaveCount(0)`, que sí puede fallar si vuelve el selector. R7 sigue cubierto además por la unidad (`FormData` sin `status`). Las tres constantes muertas se quedan porque las exige `guard-pantalla-pedidos-se-amplia`, que es de otra ficha. Queda como **menor abierto**, con la ficha propuesta para retirarlas. |
| m5 | Cerrado (ver el barrido de arriba). |
| m6 | Cerrado. La cabecera de `migration.sql` pasa a 5 líneas y dice el porqué. `asignaciones/index.ts` ya no repite «Bloque NUEVO al final…». `assigned-orders-list-params.ts` ya no justifica nada con «las pruebas existentes». |
| m7 | Cerrado. R35 captura `status`, `finishedAt` y `updatedAt` antes y después, y afirma `order_assignments` vacío para el pedido. |

### Enmiendas a tests ajenos

- **`tests/unit/pedidos/scope.test.ts` (QC-34 R57).** La lista cerrada de E2E de pedidos pasa de
  3 a 4 con `e2e/pedidos-terminados.spec.ts`. Lleva fecha y motivo. La lista **se tensa**: el
  ancla sintética `orders-extra.spec.ts` sigue probando que un quinto spec pone el test en rojo.
  No esconde nada.
- **`tests/unit/shared/data-table-alcance.test.ts` (QC-55 R36).** La lista pasa de 17 a 18, con
  motivo, y sigue cerrada. Detalle sin peso: el motivo nombra «asignados y terminados», pero la
  vista «Todos» también monta la tabla compartida. No se marca.
- **`tests/unit/recetas/schema/recipe-lines-percentage-migration.test.ts` (QC-147).** El test
  exigía que esa migración fuera posterior a **todas** las del repo, un invariante que se rompe
  con cualquier migración legítima que llegue después. Ahora compara con la que era la última
  cuando nació (`20260922150000_product_type_enum`) y deja el porqué escrito. Sigue protegiendo lo
  que importa (el orden respecto a su predecesora), así que no esconde ninguna regresión. La
  migración propia (`orders-finished-at-migration.test.ts`) ya comparaba con un nombre fijo.
- `tests/baseline-rojos.json` no está en el diff.
- El rojo de `configuracion-ui/user-table.test.tsx` R26 que la bitácora da por flake de jsdom no
  se toca y no va al baseline. La rama no toca nada de esa pantalla. Queda para que el gate del
  leader lo confirme; no es un hallazgo de esta ficha.

### Observaciones (no son hallazgo)

- `c16d8172` no tiene la línea `Co-Authored-By`. Afecta a la historia, no al contenido. Lo decide
  el leader.
- T17 sigue `[ ]` a la espera del `./init.sh` completo del leader. Es condición de cierre, no un
  defecto.

### Veredicto de la revisión 2

**OK**: 0 mayores y 1 menor abierto (m4, con justificación: las constantes muertas las exige una
guardia de otra ficha y hay ficha propuesta). La aprobación queda condicionada a lo mismo que
cualquier cierre: `./init.sh` completo en verde y T17 marcada `[x]`.
