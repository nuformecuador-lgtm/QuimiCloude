# impl QC-218 — acondicionar-con-equipo

Implementer, 2026-10-08/09. Worktree `.worktrees/QC-218-acondicionar-con-equipo`, rama
`feature/QC-218-acondicionar-con-equipo`. T1–T17 en `[x]`. Para T18, `./init.sh` NO se corrió
porque da OOM en local; por decisión humana, el gate lo corre CI en el PR. En su lugar se
corrieron las verificaciones de abajo.

## Commits (todos con push)

| Commit | Contenido | ¿Compila aislado? |
|---|---|---|
| `39301f95` | Tanda 1 (T1–T5) + T12 | No: le faltan `schema.prisma` y el catálogo de errores (`a20b35d8`) |
| `f15aed9b` | Tanda 2 (T6–T11) | No: le faltan además `composition/index.ts` y `routes.ts` (`a20b35d8`, `11dde9a7`) |
| `55737b84` | Tanda 3 (T13–T15) | No, por lo mismo |
| `d86d5618` | Tanda 4 (T16, T17), E2E | No, por lo mismo |
| `a20b35d8` | Archivos compartidos con QC-223 | Sí, desde aquí compila |
| `11dde9a7` | `lib/shared/routes.ts`, compartido con QC-222 | Sí |

- Los archivos que comparte con QC-223 son `db/schema.prisma`, `error-codes.ts`,
  `error-catalog.ts`, `lib/composition/index.ts` y `tests/guards/guard-identificador-de-request.test.ts`.
- **Solo añaden líneas** (58 inserciones, 0 borrados), sin reordenar ni reformatear. Por
  decisión humana van al final y aparte, para que el merge sea una unión simple.

## Archivos

Todos los de `tasks.md > Archivos esperados`, más estos, **fuera de la lista**:

| Archivo | Motivo |
|---|---|
| `tests/unit/asignaciones/assign-responsibles.test.ts` | El doble de `WorkGroupDirectory` gana `listSnapshotsAliveInCompany`; sin eso el typecheck falla |
| `tests/unit/errores/catalogo.test.ts` | Test del catálogo cerrado: el total pasa de 74 a 76, con casos R16/R17 |
| `tests/integration/aislamiento.json` | Censo de aislamiento: alta de los 3 int tests nuevos. Sin ella, `guard-aislamiento-integracion` falla |
| `tests/integration/pedidos/company-scope.int.test.ts` | La FK nueva cuelga de `orders_id_company_id_key`. Se añade a `drop/restoreForeignKeysDependingOnOrdersCompanyKey`, igual que hizo QC-82; si no, sale 2BP01. Puede chocar con otra feature que añada FKs a `orders` |
| `tests/helpers/execution-transaction-on-client.ts` | `ExecutionWriters` exige `conditioning` y `team` |
| `tests/unit/asignaciones/execution-log-repository.test.ts` | Afirma por igualdad exacta las claves de `ExecutionWriters`; ahora son 5 |
| `tests/integration/asignaciones/finished-orders.int.test.ts` | La entrada de comenzar pasa a `{ orderId, userIds, workGroupIds }` y se cablean los puertos nuevos. Ninguna aserción cambia |
| `tests/unit/recetas-ui/recipe-route-contract.test.ts` | Lista cerrada de exports de `routes.ts`: se suma `CONDITIONED_ORDER_PARAM` |
| `tests/unit/identity/session-once-per-request-actions.test.ts` | Censo de los `driving/` que leen la sesión: se suma `startConditioningAction` |

`package.json` y `pnpm-lock.yaml` no cambian: no hay dependencias nuevas.

## Desviaciones y decisiones a revisar

1. **`order-prisma.ts` (T4).**
   - Lo que hice:
     - `startConditioningAliveOrder` y `finishConditioningAliveOrder` conservan su nombre, porque
       `tests/unit/pedidos/qc145-estado-solo-planta.test.ts` los fija;
     - ganan un último parámetro opcional `db`;
     - `createOrderConditioningRepository(db)` los llama con ese `db`.
   - El design decía lo contrario: que las funciones exportadas delegan en la fábrica.
   - El efecto es el mismo: hay una sola implementación y las dos rutas funcionan sobre `tx`.
2. **`start-conditioning`.**
   - Valida las personas sueltas, con `assertLooseTeamMembers`, antes de mirar los grupos. El
     orden de rechazo queda personas → grupos, igual que en `assignResponsibles`.
   - Con `userIds` vacío no lee personas.
3. **Candidatos.**
   - `MAX_CANDIDATES` es también el tope de grupos, como dice design § 3.3; D13 solo habla de
     personas.
   - `excludedAdministrators` cuenta solo a los miembros activos.
4. **Detalle.**
   - Los nombres del equipo salen de la misma lectura que resuelve a quien acondiciona
     (`composeConditioningOrderDetail`).
   - Si un nombre no se encuentra, se muestra el `userId`, igual que ya se hace con quien
     acondiciona.
5. **Wording viejo en `e2e/acondicionamiento.spec.ts` (T17).** T17 pide no cambiar ninguna otra
   línea, así que quedan sin tocar:
   - el comentario de la línea ~420, «ningún botón»;
   - el título del test R22, «sin botones».

   Ahora contradicen la aserción nueva. Lo decide el reviewer.
6. **R4.** No hay un test nuevo. Lo cubren los tests de columnas existentes, como pedía T15:
   - `conditioning-orders-columns.test.tsx`: «R8: Nº de pedido, Receta, Envases, Estado y Quién
     acondiciona, en ese orden» fija el conjunto de columnas, y el único enlace es el número (R14);
   - `finished-orders-columns.test.tsx`: «R26 - ninguna columna es «Entrar» ni una accion».

## Mapa R<n> → test

Abreviaturas de la tabla:
- `u/` = `tests/unit/asignaciones/`
- `ui/` = `tests/unit/asignaciones-ui/`
- `i/` = `tests/integration/asignaciones/`

| R | Test |
|---|---|
| R1 | `ui/conditioning-order-screen.test.tsx` «R1: en POR_ACONDICIONAR ofrece solo «Acondicionar»»; `ui/conditioning-order-page.test.tsx` «R1: en POR_ACONDICIONAR pide los candidatos…» |
| R2 | screen «R2: en EN_ACONDICIONAMIENTO de quien lo acondiciona ofrece solo «Terminar»»; page «R2: … ofrece «Terminar» sin pedir candidatos» |
| R3 | screen «R3: … con otra persona no ofrece ninguna acción…» y «R3: en TERMINADO no ofrece ninguna acción»; page, sus dos casos R3 |
| R4 | `ui/conditioning-orders-columns.test.tsx` «R8: Nº de pedido, …, en ese orden» y los R14 del enlace; `ui/finished-orders-columns.test.tsx` «R26 - ninguna columna es … una accion» (ver la desviación 6) |
| R5 | `ui/start-conditioning-dialog.test.tsx` «R5: abre con el selector de personas, el de grupos, «Comenzar» y «Cancelar»», «R5: envía orderId, userIds y workGroupIds…» |
| R6 | dialog «R6: ofrece las personas que llegan como candidatas…»; `u/list-conditioning-team-candidates.test.ts` «R6: ofrece solo personas elegibles…», «R6, D13: … el tope heredado» |
| R7 | dialog «R7: cada grupo dice «<nombre> · <n> personas»…» y «R7: un grupo que no aporta personas tiene la casilla deshabilitada»; candidates «R7: cada grupo con contributes y excludedAdministrators…»; `tests/integration/identity/assignment-directory.int.test.ts` (5 casos R7 de `listSnapshotsAliveInCompany`) |
| R8 | dialog «R8: pasada la espera sigue deshabilitado sin nada marcado y se habilita al marcar» |
| R9 | `ui/countdown-gated-button.test.tsx` (deshabilitado con «00:05», se habilita a los 5 s, `key` reinicia); dialog «R9: al abrir está deshabilitado con la cuenta en «00:05»», «R9: al cerrar y volver a abrir…» |
| R10 | countdown-gated-button; `ui/finish-conditioning-dialog.test.tsx` «R10: el confirmar empieza deshabilitado con «00:05»…», «R10: al reabrir la cuenta empieza otra vez» |
| R11 | countdown-gated-button «es un botón de envío corriente, sin nada que mande la espera al servidor»; `u/start-conditioning.test.ts` (ningún campo de tiempo en el esquema estricto, R18) |
| R12 | `u/start-conditioning.test.ts` «R12, R13: lee el pedido, despues el equipo, y escribe…», «R12: si insertar el equipo falla…»; `i/start-conditioning-team.int.test.ts` «R12: si insertar el equipo falla dentro de la transaccion, el pedido sigue POR_ACONDICIONAR y sin equipo» |
| R13 | `u/conditioning-team.test.ts` (3 casos R13); `i/conditioning-team-repository.int.test.ts` «R13: insertAll escribe una fila por persona…»; int «R13, R14: el grupo se resuelve al comenzar…» |
| R14 | `i/conditioning-team-repository.int.test.ts` «R14: renombrar el grupo, darlo de baja, sacar o meter miembros y dar de baja a una persona no cambia ninguna fila» |
| R15 | `u/conditioning-team.test.ts` «R15: los Administradores y los inactivos del grupo se omiten…»; int «R12, R13, R15: escribe el pedido y el equipo juntos…» |
| R16 | `u/conditioning-team.test.ts` (tres errores en orden); `u/start-conditioning.test.ts` «R16: suelta con %s…», «R16: grupo inexistente…»; `tests/unit/errores/catalogo.test.ts` «R16: …» |
| R17 | `u/conditioning-team.test.ts` (3 casos R17); start-conditioning «R17: un grupo que solo aporta Administradores e inactivos…»; catalogo «R17: …» |
| R18 | `u/conditioning-team.test.ts` «R18: rechaza %s» / «R18: acepta %s»; start-conditioning «R18: entrada %s rechaza con invalid_input sin tocar ningun puerto»; `u/order-conditioning-actions.test.ts` «R18: sin ninguna casilla marcada…» |
| R19 | start-conditioning «R19: actor %s rechaza con unauthorized sin tocar ningun puerto», «R19: … autorizar va antes de validar»; `tests/unit/composition/asignaciones-facade.test.ts` «R19: …» |
| R20 | start-conditioning «R20: pedido inexistente…», «R20: estado %s -> order_not_conditionable…», «R20: EN_ACONDICIONAMIENTO de otra persona -> order_conditioning_taken…» |
| R21 | start-conditioning «R21: already_mine termina con exito sin resolver el equipo ni escribirlo» |
| R22 | start-conditioning «R22: si … el UPDATE responde %s, no se inserta equipo»; int «R22: queda un solo quien acondiciona con su equipo…» (5 corridas seguidas en verde) |
| R23 | `u/schema/conditioning-team-migration.test.ts` (casos R23); `i/conditioning-team-constraints.int.test.ts` (empresa cruzada 23503, grupo/nombre 23514, persona repetida 23505, posición negativa/repetida) |
| R24 | int «R24, R29: el miembro no ve el pedido ni puede actuar, los responsables no cambian y solo quien acondiciona termina» |
| R25 | `u/get-conditioning-order.test.ts` (3 casos R25); screen «R25: en %s pinta «Equipo»…», «R25: pinta el nombre … dada de baja», «R25: sin equipo no pinta la sección» |
| R26 | finish dialog «R26: abre una confirmación con título, descripción, «Terminar» y «Cancelar»», «R26: «Cancelar» cierra sin enviar» |
| R27 | actions «R27: exito -> revalida el detalle…», «R27, D11: … redirige a /asignacion?vista=por_acondicionar&acondicionado=<numero>»; `ui/conditioned-order-notice.test.tsx` «R27: dice «Pedido <n> acondicionado»…»; finish dialog «R27: confirmar envía solo el id del pedido» |
| R28 | actions «R28: %s se traduce a ErrorState…»; start dialog «R28: si la acción falla, el modal sigue abierto…»; finish dialog «R28: …» |
| R29 | int «R24, R29: …»; actions «R28, R29: %s se traduce a ErrorState y NO redirige» |
| R30 | candidates «R30: actor %s -> unauthorized antes de zod y sin tocar ningun puerto»; facade «R30: `listConditioningTeamCandidates` rechaza sin `acondicionamiento.modificar`» |
| R31 | `tests/unit/identity/roles/acondicionamiento-rol.test.ts` «R21, R31: son nueve rutas exactas…» y las aserciones del barrido; facade «R31: expone … los candidatos del equipo, y ninguna mas» |
| R32 | migration test «R32: ENABLE y FORCE ROW LEVEL SECURITY…», «R32: DROP TABLE sin CASCADE…»; constraints int «R32: la RLS esta activada y forzada», «R32: el DOWN, leido del archivo, borra la tabla … y deja la base como antes del UP»; además, la aplicación real UP → DOWN (`db:rollback`) → UP sobre `QuimiCloude` |
| R33 | `e2e/acondicionar-con-equipo.spec.ts` «R33 y R34 - el acondicionador 1 comienza con una persona y un grupo tras la espera…» |
| R34 | mismo spec, `test.step` «R34 - el acondicionador 2 no ve «Terminar» ni «Acondicionar»…» |
| R35 | `e2e/acondicionamiento.spec.ts`, R22: «el único botón es Acondicionar» (líneas ~432–433) |
| R36 | Esta tabla y la verificación de abajo |

## Salida de la verificación

Todo con el árbol completo (HEAD `11dde9a7`), salvo lo que se indica.

- **`pnpm run typecheck`:** `tsc --noEmit` sale con 0, sin errores.
- **`pnpm run lint`:** `✖ 7 problems (0 errors, 7 warnings)`. Los 7 avisos son de archivos ajenos
  (`confirm-catalog-import.test.ts`, `order-service.test.ts`).
- **Guardias y listas cerradas:** se corrió

  ```
  pnpm exec vitest run tests/guards tests/unit/shared/data-table-alcance.test.ts
    tests/unit/recetas-ui/recipe-route-contract.test.ts
    tests/unit/identity/session-once-per-request-actions.test.ts
    tests/unit/identity/session-once-per-request-render.test.tsx
    tests/unit/errores/catalogo.test.ts tests/unit/composition
    tests/unit/asignaciones tests/unit/asignaciones-ui tests/unit/identity/roles
  ```

  Resultado: `Test Files 150 passed (150) · Tests 2644 passed | 11 skipped`.
- **`tests/unit/navegacion` + `data-table-alcance`, en la tanda 3:** `1 failed | 7 passed`. El
  rojo es `pantallas-exigen-permiso > '/pedidos'`, que está en `tests/baseline-rojos.json`.
- **Integración**, la corrieron los subagentes por ruta en las tandas 1 y 2:
  - `tests/integration/asignaciones/**`, `pedidos/order-conditioning`,
    `finish-with-finished-goods` y `review-blocked-orders`: `26 passed · 206 tests`;
  - tanda 1 (constraints, repository, assignment-directory, order-conditioning,
    finished-orders): `6 files · 67 passed`;
  - `company-scope`, `qc145` y `order-conditioning`, en verde tras el ajuste de la FK.
- **Migración sobre `QuimiCloude`:**
  - `prisma migrate deploy` la aplica;
  - `pnpm run db:rollback` imprime «20261008150000_order_conditioning_team revertida»;
  - `migrate deploy` la vuelve a aplicar;
  - `migrate status` termina en «Database schema is up to date!».
- **`vitest related`:** no se completó. Sobre `lib/shared/routes.ts` arrastra casi toda la suite
  y pasa de 15 minutos en esta máquina. Por indicación del coordinador se sustituyó por las
  corridas por carpeta de arriba.
- **Rojos fuera de este cambio:**
  - `tests/unit/recetas/scope.test.ts` y `module-contract.test.ts`: en el baseline.
  - `tests/integration/proveedores/catalog-line.int.test.ts > R32`: **no está en el baseline**.
    Depende del locale de Postgres: en esta máquina, con locale en castellano,
    `meta.constraint` no es una cadena. Solo toca `supplier_catalog_lines`, ajeno a esta feature.
    En CI, con en_US, debería pasar (commit `f2be3eb8`).

## E2E, contra la base local, un spec por corrida

- **`pnpm exec playwright test e2e/acondicionar-con-equipo.spec.ts`:** `2 passed (1.0m)`.
  Chromium tardó 37.8 s y webkit 42.2 s. Pasó al primer intento, sin timeout de login.
- **`pnpm exec playwright test e2e/acondicionamiento.spec.ts`:** `8 passed (45.8s)`, 4 en
  chromium y 4 en webkit. Una segunda corrida dio `8 passed (47.1s)`.
- **Listas cerradas:** `acondicionar-con-equipo.spec.ts` se dio de alta en `E2E_ESPERADOS`, en
  `tests/guards/guard-identificador-de-request.test.ts` (commit `a20b35d8`). El spec no menciona
  `data-table`, así que no entra en `data-table-alcance`.

## Integración con `dev` (F2.3, 2026-10-09)

- **Merge** `origin/dev` (trae QC-222 y QC-233; sin migraciones nuevas, `package.json` solo suma
  el script `db:seed:demo`): commit `0d31b71b`.
  - Conflicto único, `tests/integration/aislamiento.json`: se conservan las dos entradas
    (`asignaciones/start-conditioning-team.int.test.ts` y `scripts/seed-demo.int.test.ts`).
  - Uniones automáticas revisadas: `lib/shared/routes.ts` (QC-218 suma `CONDITIONED_ORDER_PARAM`;
    QC-222 mete las tres rutas de integraciones en `PRIVATE_ROUTE_PREFIXES`), la lista cerrada de
    `recipe-route-contract` (`CONDITIONED_ORDER_PARAM`, dev no suma exports), `E2E_ESPERADOS`
    (`acondicionar-con-equipo.spec.ts` + `brand-assets.spec.ts` + `integraciones.spec.ts`) y
    `MIGRACIONES_ESPERADAS`: llevan los dos lados. `guard-pantallas-exigen-permiso` y
    `data-table-alcance` no los toca QC-218.
- **Rojo semántico de la integración:** `tests/guards/guard-piezas-base.test.ts` (QC-231, llega con
  dev) marcó R7 (constante local `TOUCH_TARGET` en 5 componentes del acondicionamiento) y R12
  (comparación con `UNEXPECTED_ERROR_CODE` en los diálogos de comenzar y terminar). Arreglo
  mecánico con el mismo DOM: `touchTarget` compartido y `ErrorAlert ... withDataCode`. Commit
  `3caf9a9e`.
- **m1 del review:** título y comentarios de `e2e/acondicionamiento.spec.ts` describen el botón
  «Acondicionar» del detalle; las aserciones no cambian. Commit `e3c24ffc`.
- **Verificación tras el merge, con todo el árbol:**
  - `pnpm typecheck`: exit 0.
  - `pnpm lint`: exit 0 (0 errores, 7 avisos previos ajenos).
  - `vitest run tests/guards tests/unit/shared tests/unit/recetas-ui tests/unit/asignaciones
    tests/unit/asignaciones-ui tests/unit/identity tests/unit/composition tests/unit/errores
    tests/integration/pedidos/company-scope.int.test.ts`: `Test Files 310 passed (310)`,
    `Tests 5396 passed | 42 skipped (5438)`. Antes del arreglo: 1 archivo rojo (guard-piezas-base,
    2 tests).
  - `prisma migrate status`: «Database schema is up to date!».

## Rojo de CI en el PR #187 (run 37951548421, 2026-10-09)

- **Rojo:** `tests/integration/scripts/seed-demo.int.test.ts` (no está en el baseline). El seed de demo,
  que entró con el merge de `dev`, llamaba a `startConditioning` con la entrada vieja `{ orderId }` y
  el caso de uso respondía `ValidationError`.
- **Arreglo en el seed** (`scripts/seed-demo/gateway.ts`): el paso de comenzar el acondicionamiento
  manda como equipo a la propia persona que acondiciona (`demo.acondicionador`, rol acondicionamiento,
  activa, no Administradora): `{ orderId, userIds: [actors.conditioner], workGroupIds: [] }`.
  Es determinista. No había otros llamadores fuera de `lib/` y `tests/` (no hay seeds de Prisma que lo usen).
- **Arreglo en el test:** `deleteCompany` borra ahora `orderConditioningTeamMember` antes de `order`.
  Sin eso la limpieza fallaba por la clave foránea. `countByTable` no cuenta esa tabla, así que los
  conteos esperados no cambian y no se tocaron.
- **Verificación:**
  - `vitest run tests/integration/scripts/seed-demo.int.test.ts`: `Test Files 1 passed (1)`, `Tests 1 passed (1)`.
  - `pnpm typecheck`: exit 0.
  - `pnpm lint`: exit 0 (0 errores, 7 avisos previos que no son de esta feature).
  - `vitest run tests/guards`: `Test Files 54 passed (54)`, `Tests 735 passed | 9 skipped (744)`.
