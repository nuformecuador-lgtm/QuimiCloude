# review QC-201 — empacador-no-ejecuta-pedidos

Reviewer, 2026-10-04. Rama `feature/QC-201-empacador-no-ejecuta-pedidos`, HEAD `c3c7cca2`, comparada con
`origin/dev` `57a01471` (merge-base = `origin/dev`: la rama está al día). El MCP del grafo no se usó:
la revisión se hizo con `git diff`, Grep y Read.

## Verificación ejecutada (por el reviewer, no copiada de la bitácora)

- `pnpm run typecheck`: verde.
- `eslint` sobre los `.ts/.tsx` añadidos o modificados: 0 errores.
- `vitest --project node --project ui` sobre los tests unitarios tocados, `tests/guards/**`,
  `tests/unit/asignaciones/**` y `tests/unit/asignaciones-ui/**`: 114 archivos, 1834 passed, 0 failed
  (8 skipped preexistentes; el diff no añade `.skip`, `.only` ni `.todo`).
- `vitest --project integration`: `execution-permission-migration`, `finished-orders`,
  `order-catalog-company-summary`, `identity-seed`, `assigned-orders` y `session-user`: 6 archivos,
  67 passed.
- Los 8 archivos de `tests/baseline-rojos.json`, corridos aparte: `Test Files 8 failed`,
  `Tests 10 failed`.
- No corrí `./init.sh` completo ni el E2E (los corre el leader).

## Checklist

### Especificación
- [x] `requirements.md` con R1–R22 en EARS, `design.md` con alternativas descartadas (§7) y
      `tasks.md` con todas las tasks marcadas `[x]`, T12 incluida.

### Trazabilidad (R<n> -> test, comprobado abriendo cada test)
- [x] R1, R2, R14: `tests/unit/identity/permissions.test.ts`, describe «QC-201 …». Hay casos
      reales: la entrada exacta, la lista previa intacta, `ejecutar` solo en `asignaciones` y fuera
      de `ADMIN_EXCLUDED_PERMISSIONS`.
- [x] R3, R4: `permissions.test.ts`, `seed-initial-access.test.ts`, `identity-seed.int.test.ts` y
      `empacador-authorization.test.ts`.
- [x] R5, R6, R7, R7a, R7b: `get-assigned-order-execution`, `start-assigned-order` y
      `finish-assigned-order.test.ts`. Prueban el rechazo sin el permiso antes de validar la entrada
      y sin tocar puertos, y la concesión con solo `asignaciones.ejecutar`.
      `empacador-authorization.test.ts` lo prueba con el conjunto del Empacador
      (`consultar` + `empaque.modificar`), que es R7a.
- [x] R8: `order-execution-page.test.tsx`: 404 sin el permiso, sin llamar a la action. E2E
      `pedidos-asignados.spec.ts` «R8 - …».
- [x] R9: `authorization.test.ts`, describe `canExecuteAssignedOrders`. Cubre la matriz frente a
      `requirePermission`, y los casos de actor nulo, sin conjunto y con conjunto vacío.
- [x] R10, R11, R11a: `assigned-orders-can-execute.test.tsx` (columna, enlace, skeleton y barrido
      de la fuente) y `asignacion-page.test.tsx`. Este último comprueba que un rol llamado
      «Operador» sin el permiso recibe `canExecute: false`, así que la decisión no sale del nombre.
- [x] R12, R13: `execution-permission-migration.int.test.ts`, contra Postgres real (verde).
- [x] R15: `module-contract.test.ts`: lista exacta de quién nombra `asignaciones.ejecutar` y
      mutaciones en rojo en los dos sentidos.
- [x] R16, R17: `list-assigned-orders.test.ts`, `empacador-authorization.test.ts` y
      `assigned-orders.int.test.ts`.
- [x] R18: E2E «R18, R19a, R10 - …» (PENDIENTE y EN_CURSO). BLOQUEADO lo cubre R16 a nivel de
      caso de uso.
- [x] R19, R19a: `assignment-views.test.ts`, `asignacion-page.test.tsx` y el E2E.
- [x] R20, R20a: unit (`list-finished-orders`, `order-catalog`) e integración
      (`order-catalog-company-summary`: total, paginación, `packed_by NULL` y empresa cruzada;
      `finished-orders`: dos empacadores). También el E2E «R20 - …».
- [x] R21: `session-user.int.test.ts` «trae los permisos del rol sin una segunda consulta», que ya
      existía (ver menor m2).
- [x] R22: `list-responsible-candidates.test.ts`, con el conjunto leído de
      `SEED_ROLE_PERMISSIONS`.
- [x] El mapa R -> test está en `progress/impl_QC-201.md`.

### Puntos pedidos por el leader
1. [x] **Migración `20261004150000_execution_permission`.**
   - El UP tiene dos `INSERT … ON CONFLICT DO NOTHING`. La asignación se resuelve con un `WHERE` por
     nombre que solo lista Administrador y Operador.
   - El DOWN borra primero `role_permissions` y después `permissions` (el FK es RESTRICT), solo
     para `asignaciones.ejecutar`.
   - No hay DDL ni CASCADE. El test de integración prueba que no toca otras filas, que es
     idempotente, que el DOWN completo retira también una asignación puesta a mano, que un segundo
     DOWN no falla, y que los literales coinciden con `PERMISSIONS` y `ROLE_*`.
   - Es reversible y solo da el permiso a esos dos roles.
2. [x] **La autorización va en la primera línea.** `requirePermission` con `asignaciones.ejecutar`
   es la primera sentencia de los tres casos de uso (`get-assigned-order-execution.ts:42`,
   `start-assigned-order.ts:38`, `finish-assigned-order.ts:174`), antes del `safeParse`. La página
   `[id]` llama a `requirePagePermission` antes de `await params`.
3. [x] **Las vistas y «Entrar» se deciden por permiso.** `resolveAssignmentViews` y `page.tsx` usan
   `canExecuteAssignedOrders(sessionUser)`; `canExecute` baja por props hasta columnas y skeleton.
   En `app/` y `lib/` no hay comparaciones con el nombre del rol. `asignaciones.ejecutar` solo
   aparece en el catálogo y el seed, `actor.ts`, los tres casos de uso y la página `[id]`.
4. [x] **El filtro `packedBy` se aplica en el servidor.** `listFinishedOrders` decide el filtro con
   `canExecuteAssignedOrders(actor)` y toma `packedBy` de `actor.id`, nunca de la entrada.
   - El adaptador Prisma lo añade al mismo `where`, que comparten lista y `count`, junto a
     `orderCompanyScope`.
   - El Administrador tiene `pedidos.consultar` y va a la vista `todos`, que es otro caso de uso.
     Además tiene `ejecutar`, así que no se le filtra. El Operador tiene `ejecutar` y ve el
     resultado sin filtro, el de hoy (R20a, con test de integración).
   - No rompe la vista de ninguno de los dos.
5. [x] **Decisiones humanas del 2026-10-04.**
   - qc138 R37 «ningún permiso nuevo»: el diff retira solo ese caso, el extractor
     `codigosDePermiso` y su autotest (29 -> 27 casos). Se conservan `git`, `padreDeLaRama`,
     `enElPadre` y `stripComments`. Los describes R39 (dependencias, borrado físico,
     identificadores en inglés) y R21 (sin desbloqueo manual) no están en el diff y pasan en verde.
     El otro caso R37 (permisos de `pedidos.*` e `inventario.*`) sigue.
   - E2E con el menú de 3 puntos: el helper nuevo es `e2e/helpers/row-actions-menu.ts`, y
     `openOrderRowMenu` delega en él. Están corregidos `pedidos-terminados` (caso D),
     `pedidos-busqueda`, `pedidos-responsables` y `cierre-de-sesiones`. No queda en `e2e/` ningún
     clic directo sobre items de los menús de fila de pedidos o usuarios, que son las dos únicas
     pantallas que usan `RowActionsMenu`. Los clics directos de `clientes` y `grupos-de-trabajo`
     son de pantallas sin menú.
6. [x] **El recuento de rojos es coherente, y no hay rojos nuevos.** «10 failed» cuenta *tests* y
   «8 rojos» cuenta *archivos*.
   - `baseline-rojos.json` tiene 8 archivos únicos: 10 entradas en el texto, porque
     `product-page` y `recipe-page` están duplicadas; el JSON se queda con la última.
   - Corridos aparte, esos 8 archivos dan exactamente `8 failed` archivos y `10 failed` tests.
   - Todo lo que tocó esta rama sale verde. No hay ningún rojo fuera del baseline.

### Calidad y seguridad
- [x] Cada permiso nuevo se valida en el dominio (service) y tiene su test.
- [x] Sin tablas ni modelos nuevos en `db/schema.prisma`: no aplica RLS ni la columna de empresa.
      La consulta tocada (`listAliveOrderSummariesInCompany`) sigue filtrando por empresa, con un
      test de acceso cruzado que sí prueba el filtro (`order-catalog-company-summary.int`, «el
      filtro no cruza empresas»).
- [x] Capas: el puerto `OrderCatalog`/`OrderSummaryReader` gana un `filter` opcional; el dominio no
      importa infraestructura.
- [x] Sin secretos, sin webhooks y sin hardcode de contexto.
- [x] `package.json` sin cambios: no hay dependencias nuevas.
- [x] Multiplataforma: el único cambio de UI quita una columna. No añade CSS, `100vh`, `:hover`,
      targets ni inputs.
- [x] Comentarios: ninguna línea añadida en `app/`, `lib/` ni `db/` cita `QC-<n>`, `R<n>`,
      `design.md` ni «decisión cerrada». El diff retira las citas QC-74/QC-86 de
      `SEED_ROLE_PERMISSIONS`. Las citas `(R5)` y `(R6)` de `permissions.ts` y la de `QC-87` en
      `asignaciones/index.ts` son preexistentes y el diff no las toca.

### Verificación final (la cierra el leader)
- [ ] `./init.sh` completo y E2E: según la bitácora, `init OK` y E2E verde. No los he vuelto a
      correr; le tocan al leader.
- [ ] `progress/history.md` y desmontar el worktree: los hace el leader tras el merge.

## Hallazgos

Ningún BLOQUEANTE.

- **m1 (menor).** `tests/unit/pedidos/qc138-transversales.test.ts:4`: al reescribir la cabecera
  quedó una línea de 174 caracteres, cuando el resto del bloque está partido a ~100. Es cosmético.
- **m2 (menor).** R21 se apoya en un test genérico que ya existía (la sesión lee los permisos del
  rol en BD). No hay un caso con `asignaciones.ejecutar`, aunque el mecanismo que prueba es el
  correcto. Además, la bitácora dice que «los permisos de la sesión salen del rol en BD en cada
  lectura». Si es así, el riesgo D11 («hasta 8 h con la sesión vieja») podría no darse. Conviene
  redactar el aviso del PR con lo que hace el código de verdad, no con lo que supone el design §9.
- **m3 (menor).** `tasks.md` T12 dice que el mapa va en
  `progress/impl_QC-201-empacador-no-ejecuta-pedidos.md`, pero está en `progress/impl_QC-201.md`.
  Es una diferencia de nombre; el contenido está.

Fuera de alcance, sin contar como hallazgo de QC-201: `tests/baseline-rojos.json` tiene dos claves
duplicadas (`product-page`, `recipe-page`). No cambia el resultado (8 archivos únicos), pero
confunde el recuento: es de donde viene la «incoherencia» del punto 6.

## Veredicto

**OK**: 0 bloqueantes, 3 menores.
