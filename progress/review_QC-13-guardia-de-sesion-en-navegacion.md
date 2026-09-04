# Review — QC-13 guardia-de-sesion-en-navegacion

## Checklist

- [x] Trazabilidad R1-R16 → test real que muerde (verificado leyendo y mutando, no solo por la bitácora).
- [x] Tasks T1-T5 marcadas `[x]` en `tasks.md`. T6 sin marcar (ver hallazgo menor).
- [x] Checkpoints de `CHECKPOINTS.md` (autenticación/permisos exige E2E: presente y verificado en verde).
- [x] `./init.sh` corrido por el leader antes de esta revisión: typecheck limpio, lint limpio, 1349
      tests con 8 rojos ajenos (deuda documentada de `identity-seed.int.test.ts`, decisión humana de
      no tocarla), E2E verde en Chromium y WebKit aterrizando en `/inventario`.
- [x] Calidad/seguridad: sin RLS aplicable (no hay migración ni tabla nueva), sin secretos, sin
      hardcode de contexto. El E2E no borra datos reales de rol (ver mutación de lectura abajo).
- [x] Multiplataforma: la ficha no toca UI de layout/estilos, solo datos de navegación y dos tests.
      No aplica.
- [x] Dependencias: sin cambios en `package.json`/`pnpm-lock.yaml` en ningún commit de QC-13
      (confirmado con `git log -- package.json pnpm-lock.yaml`, ningún commit `QC-13` aparece).
      Decisión cerrada 17 y R16 se cumplen.

## Mutaciones probadas (revertidas, `git diff` vacío confirmado)

**Mutación 1 — reintroducir los cuatro ítems y sus cuatro constantes retiradas** en
`lib/shared/navigation/private-nav.ts` (`SUPPLIERS_ROUTE`, `NOTIFICATIONS_ROUTE`,
`PURCHASE_ORDERS_ROUTE`, `BATCHES_ROUTE`, más el ítem `nav-produccion-lotes` y el grupo
`nav-compras`/`nav-compras-proveedores`).

Resultado: `pnpm exec vitest run tests/unit/app-sidebar.test.tsx tests/guards/guard-nav-serializable.test.ts`
→ **5 tests caen**:
- "private-nav.ts no exporta las constantes de ruta retiradas" (R1)
- "PRIVATE_NAV_ITEMS no contiene ningún destino ni testId de los ítems retirados" (R2/R3)
- "PRIVATE_NAV_ITEMS tiene exactamente tres entradas de nivel superior en orden" (R5)
- "el grupo nav-produccion conserva un único hijo, nav-produccion-formulas" (R6)
- guard-nav-serializable, "cada icono declarado es una cadena" — cae de rebote porque el grupo
  `nav-compras` mutado no llevaba `icon`; confirma que la guardia sigue viva y sensible a cualquier
  ítem nuevo del árbol, no solo a los que el implementer anticipó.

Revertido con `git checkout -- lib/shared/navigation/private-nav.ts`. `git status --porcelain` y
`git diff --stat` vacíos tras revertir. Re-ejecución: 32/32 verde en
`app-sidebar.test.tsx` + `guard-nav-serializable.test.ts` + `sidebar-ajuste.test.tsx`.

No hizo falta mutar R4/R14 (Fórmulas intacto) porque el test que lo cubre afirma valores
literales exactos (`href`, `label`, `testId`), que por construcción caerían ante cualquier cambio
accidental; se verificó por lectura que el commit `653eaa9` no toca esas líneas (diff mostrado).

## R11-R13 (E2E, retorno a /inventario)

Verificado por lectura completa de `e2e/session.spec.ts` y confirmación cruzada de `testId`:
- `app/(private)/dashboard/page.tsx:35` → `data-testid="dashboard-title"`.
- `app/(private)/inventario/page.tsx:55` → `data-testid="inventario-title"`.

Son testId distintos: la aserción `getByTestId('inventario-title')` del paso 2 **no pasaría** si
el retorno fallara y el usuario cayera al dashboard por defecto — discrimina de verdad, que era
el objetivo entero de la ficha (R11-R13). El paso 1 (`RETURN_PARAM` = `INVENTORY_ROUTE`) también
discrimina de `DASHBOARD_ROUTE`. Un único `test()` dentro de un único `describe()` confirmado por
lectura (R13).

## Fixture del E2E (rol Administrador real)

Lectura completa de `beforeAll`/`afterAll` en `e2e/session.spec.ts`:
- `beforeAll` solo hace `prisma.role.findUnique({ where: { name: ADMIN_ROLE_NAME } })` (lectura,
  nunca `create`/`upsert`/`delete` sobre `role`) y lanza si no existe. La limpieza defensiva de
  huérfanos (`prisma.user.deleteMany`) filtra por `username: { startsWith: USERNAME_PREFIX }` +
  corte de una hora (`ORPHAN_MIN_AGE_MS`), coherente con el patrón ya usado en `login.spec.ts`
  (evita que dos proyectos —Chromium/WebKit— corriendo en paralelo se borren usuarios entre sí).
  No toca `role` en absoluto.
- `afterAll` borra únicamente por `username: { startsWith: \`${USERNAME_PREFIX}${RUN_ID}\` }` —
  usuarios, nunca roles. Ninguna rama puede borrar el rol `Administrador` real. El comentario deja
  explícito por qué (`roles.name` es único, dato de seed compartido).

No hay ninguna rama que pueda borrar datos reales de rol. Coherente con lo reportado por el
implementer.

## FORMULAS_ROUTE (terreno de QC-26)

Confirmado con `git show 653eaa9 -- lib/shared/navigation/private-nav.ts`: el diff de T1 solo
retira las cuatro constantes/ítems de relleno; ninguna línea toca `FORMULAS_ROUTE`, su literal,
su etiqueta `'Fórmulas'` ni el `testId` `nav-produccion-formulas`. El test dedicado (R4/R14) afirma
los tres valores literalmente. Intacto.

## Resolución de `sidebar-ajuste.test.tsx` (hallazgo destapado por el gate)

Se retiró solo la aserción (2) —que algún ítem real declara `badge`, cierto solo porque
"Notificaciones" era placeholder— y se conservó la aserción (1) sobre la fixture `NAV_MINIMA`, que
sigue mordiendo (confirmado por lectura: `badge: 7` en `NAV_MINIMA`, verificado indirectamente por
el propio subagente con mutación reportada y por la naturaleza de la aserción, que exige
`toHaveTextContent('7')` sobre un dato exclusivo de la fixture). El criterio es correcto: la
capacidad bajo prueba —pintar el contador desde el array, no desde un literal del componente—
sigue cubierta; lo que se retiró era una coincidencia del dato de relleno, no una capacidad de
producto. No pierde cobertura real.

## Trazabilidad de los 16 requisitos

Los 16 requisitos tienen test que afirma exactamente lo que el requisito dice (no solo lo cita):
R1 (no-export), R2/R3 (recorrido completo del árbol, hrefs y testIds retirados), R4/R14
(valores literales de Fórmulas), R5 (longitud+orden exactos), R6 (longitud+testId del hijo único),
R7 (cobertura indirecta por los 12 tests preexistentes sin tocar), R8 (guardia de serialización,
sin modificar), R9/R10 (fixture propia sin `SUPPLIERS_ROUTE`/`FORMULAS_ROUTE`, confirmado por
lectura del import list), R11-R13 (E2E, discriminación confirmada arriba), R15 (sin diff en
`route-role-rules.ts` en los commits de QC-13), R16 (sin diff en `package.json`/`pnpm-lock.yaml`).
Todos muerden.

## Hallazgos

**Menores (2):**
1. T6 en `tasks.md` no está marcada `[x]`, aunque su criterio de "hecho" (`./init.sh` en verde +
   mapa de trazabilidad) está satisfecho y documentado en `progress/impl_...md`. Es una tarea del
   leader, no del implementer, y el trabajo está hecho; solo falta la casilla.
2. Ninguno adicional. No se fuerza un segundo hallazgo menor para justificar la ronda.

**Mayores (bloqueantes): 0.**

## Veredicto

**APROBADO**
