# QC-255 — sanear-suite-e2e · design.md

## Lo que ya existe

Buscado el 2026-10-10 en el board (`feature_list.json`, todos los estados), en `specs/` y en el
grafo (proyecto `R-job-singularis-projects-QuimiCloude`, `dev` = `2c546f39`; el worktree no tiene
índice propio, así que se leyó `dev`, que es su base). Términos: «sello / sessionsValidFrom /
fixture de usuario», «E2E / Playwright / actionTimeout», «shard / matriz».

| Apareció | Qué es | Qué se hace con ello |
|---|---|---|
| QC-116 `sesion-revocada-en-el-mismo-segundo` (`in_progress`, Carlos) | El arreglo **en la app** de la misma carrera (A). Su ficha ya dice que el sello en el pasado de los fixtures «no sustituye al arreglo». | Fuera (D6). El helper no lo necesita ni lo bloquea (R1). Riesgo de choque de archivos: P7. |
| QC-208 `helper-e2e-espera-refresco` (`pending`) | Helper de espera a `router.refresh()` en WebKit. Otra causa. | Fuera, recomendado en P3. |
| QC-254 `deudas-guardia-dobles-y-seed-demo` (`pending`) | Patrón de `guard-dobles-e2e`, que lee `playwright.config.ts`. | No se solapa. Esta ficha cambia `playwright.config.ts` (sin tocar `env`) y no toca esa guardia. |
| QC-58 `timeout-tests-ui-bajo-carga` | Plazos de los tests de UI de **Vitest**. | No aplica a Playwright. |
| QC-180 | Documenta que `897a4f91` (alta de grupo con miembros) entró fuera del arnés. | Se cita como origen del cambio de R15. |
| `e2e/helpers/landing.ts` (`loginAndLand`, QC-93) | Login y aterrizaje únicos de los E2E. | Se reutiliza sin cambios. |
| `e2e/helpers/row-actions-menu.ts` (`openRowActionsMenuItem`) | Abrir un ítem del menú de fila. | Lo usa R16, igual que otros cuatro specs. |
| `e2e/pedido-conversion-de-unidad.spec.ts:153-154` | Patrón ya adaptado para elegir la unidad del pedido. | Lo copian los casos de R12. |
| `tests/unit/e2e-helpers/landing.test.ts` | Test unitario de un helper E2E con Prisma mockeado. | Patrón del test de R1–R4. |
| `tests/guards/guard-e2e-landing.test.ts`, `guard-despliegue-produccion.test.ts` | Guardias que leen `e2e/` y un workflow como texto. | Patrón de las guardias de R6, R19, R23–R25. |

Nada en el board ni en el código crea hoy usuarios de fixture de forma centralizada: ningún spec
fija `sessionsValidFrom`.

## 1. Modelo de datos

No cambia. Sin tablas, sin migraciones y sin RLS nuevas. La feature no toca código de producción
(R22). Usa estos campos que ya existen en `db/schema.prisma > model User`:

- `accountStatus` (`@default(pending)`);
- `sessionsValidFrom` (`@default(now())`, `Timestamptz(6)`);
- la relación `CredentialSetupToken.user` (`onDelete: Restrict`), que es lo que rompe la limpieza
  de R18.

## 2. El helper de usuario de fixture (R1–R5)

**Archivo:** `e2e/helpers/fixture-user.ts`. El nombre en inglés sigue a los vecinos (`landing.ts`,
`row-actions-menu.ts`).

**Contrato.**

```ts
/** Margen del sello respecto al segundo de creación. */
export const FIXTURE_STAMP_MARGIN_MS = 60_000

/** El sello que pone el helper: inicio del segundo de `now`, menos el margen. Pura. */
export function fixtureSessionsValidFrom(now: Date): Date

/** Mismo argumento que `prisma.user.create` y mismo resultado tipado (con `select` si lo hay). */
export function createFixtureUser<T extends Prisma.UserCreateArgs>(
  args: Prisma.SelectSubset<T, Prisma.UserCreateArgs>,
): Prisma.Prisma__UserClient<Prisma.UserGetPayload<T>>
```

**Reglas.**

- Los valores por defecto van **antes** de los del llamante:
  `data: { accountStatus: 'active', sessionsValidFrom: fixtureSessionsValidFrom(new Date()), ...args.data }`.
  Así lo que el spec fije gana (R3): `login.spec.ts` y `establecer-contrasena.spec.ts` siguen
  creando cuentas `pending` o bloqueadas (R8).
- El sello cae en `floor(now, 1 s) − 60 s`. Cualquier `iat` emitido después de la creación es
  `≥ floor(now)`, es decir, más de 60 s por encima del sello. Por eso no hay revocación con la regla
  de hoy (`iat <= sello`, `lib/modules/identity/domain/session-revocation.ts:61`) ni con lo que haga
  QC-116 (truncar el sello o comparar con otra precisión). Esa independencia es R1.
- El margen es 60 s y no 1 s: absorbe cualquier diferencia de reloj entre el proceso de Playwright,
  que calcula `now`, y el servidor, que firma el `iat`. En CI los dos están en el mismo runner. En
  local, Postgres corre en Docker (`quimicloude-pg17:5433`), pero el sello lo pone el helper
  explícitamente y no `now()` de la base.
- Importa `prisma` de `@/lib/shared/db/prisma`, el mismo singleton que ya usan los specs y
  `landing.ts`.
- Solo existe `create`: ningún spec usa hoy `createMany` ni `upsert` sobre `user` (comprobado el
  2026-10-10).

**Migración (R5).** Se reemplaza mecánicamente `prisma.user.create(` por `createFixtureUser(` en los
54 sitios de los 52 specs que lista `## Archivos esperados`. En `errores.spec.ts` se borra el hueco:
pasa a `active` por defecto (R9). En los specs que ya ponían `accountStatus: 'active'`, la línea
puede quedarse o quitarse; se quita si el bloque se toca de todos modos, sin limpieza masiva
(`docs/conventions.md`).

## 3. Los casos adaptados (R9–R18)

Cada uno se adapta al comportamiento actual. La tabla de `progress/impl_QC-255.md` (R20) recoge
la afirmación de antes, la de después y el origen.

| R | Caso | Cambio | Origen del comportamiento actual |
|---|---|---|---|
| R9 | `errores.spec.ts` (`:197`) | Usa el helper: el usuario nace `active`. | QC-65 / QC-78 |
| R10 | `presentaciones.spec.ts` R36 (`:280`) | El alta elige la unidad antes de guardar, igual que el helper de alta rápida ya arreglado (`566d122d`). | QC-80 |
| R11 | `aislamiento-recetas.spec.ts` paso 4 (`:203`) | Antes de guardar, rellena lo mínimo que exige `canSubmit` (`isComplete && hasAllProducts`, `recipe-form.tsx:230`): al menos un ingrediente con producto y cantidad. | `afa5a867` (2026-09-23). La ficha de ese commit se confirma con `git log` en T7. |
| R12 | `pedidos-cotizacion.spec.ts` `:416` y `:503` | Elige la unidad del pedido (`presentation-unit-select` → `presentation-unit-option[data-value=unitId]`) **antes** de teclear la cantidad. En `:416`, el paso (d) deja de elegirla. | `unitId` obligatorio en `quoteOrderCostSchema` (`order-input.ts:64,213-215`); patrón de QC-204 (`pedido-conversion-de-unidad.spec.ts`). |
| R14 | `permisos.spec.ts` (`:201`) | Sin `private-user-trigger`: afirma `private-logout` visible y lo enfoca por teclado (`focus()` + `toBeFocused()`). Se queda la razón de usar teclado en la 404 (overlay de `next dev` en WebKit). | Enmienda del 2026-09-07 (`components/private/nav-user.tsx`); `session.spec.ts:273-275` ya lo usa. |
| R15 | `grupos-de-trabajo.spec.ts` R42 (`:358`) | La búsqueda va por el buscador del `DataTable` que monta `WorkGroupMemberPicker` dentro del panel. El candidato se localiza por su fila y su botón «Agregar: <nombre>»; ya no hay `work-group-candidate`. | `897a4f91` y `527a9902` (2026-10-02, fuera del arnés, QC-180). |
| R16 | `datos-de-lote-en-acondicionamiento.spec.ts` R22 (`:410`) | `openRowActionsMenuItem(page, row.getByTestId('product-row-actions'), 'product-batches-open')`. | QC-232 (`c2d4d46f`). |
| R17 | `proveedores.spec.ts` R51 (`:360`) | `toHaveText('12.35')` y `toHaveAttribute('title', '12.3456')` en `data-table-cell-cost`. El valor exacto se compara contra el que el caso tecleó, no contra un literal nuevo. | `682d3e3b` (2026-09-17, `catalog-columns.tsx:199`). |
| R18 | `usuarios.spec.ts` `afterAll` (`:286`) | `credentialSetupToken.deleteMany({ where: { user: <filtro de los usuarios> } })` antes de `user.deleteMany`. Si el caso ya falló, el error de la limpieza se registra sin reemplazar al primero (mismo patrón `primerFallo` que `pedidos-cotizacion.spec.ts:409`). | QC-79 |

**Riesgos que se paran, no se esconden (R13, R21).**

- **R12:** si con la unidad elegida antes la cotización da otro importe, el importe esperado no se
  toca. Se anota y se para. Ese caso diría que la conversión de QC-204 cambia el resultado con la
  unidad del fixture.
- **R15:** si el buscador del picker no tuviera `data-testid` estable y el localizador por rol fuera
  ambiguo (por ejemplo, dos `DataTable` en el panel), el caso se acota con
  `within(page.getByTestId('work-group-sheet'))`. No se añade ningún `data-testid` a la app (R22).
  Si aun así no se puede localizar, se para y se pregunta.

## 4. El presupuesto de tiempo (R23–R25)

### 4.1 `actionTimeout` (R23)

En `playwright.config.ts > use`: `actionTimeout: 30_000`. No toca `navigationTimeout`: la primera
compilación de `next dev` va en el `goto`, y esa espera está cubierta por los `timeout` explícitos de
los casos. Tampoco toca `env` del `webServer`, que vigila `guard-dobles-e2e`.

Cualquier `click` o `fill` con `{ timeout }` propio sigue mandando sobre este valor. Los specs que ya
esperan con `toBeVisible({ timeout: 60_000 })` no se ven afectados: son aserciones, no acciones.

### 4.2 Matriz por navegador en `gate.yml` (R24, R25; sujeto a P2)

```yaml
e2e-navegador:
  name: e2e (${{ matrix.project }})
  if: <la condición actual del job e2e, con github.base_ref == 'prod'>
  timeout-minutes: 60
  strategy:
    fail-fast: false
    matrix:
      project: [chromium, webkit]
  services: { postgres: <igual que hoy> }
  steps:
    # los mismos que hoy, salvo:
    # - cache de navegadores con clave por proyecto
    # - playwright install --with-deps ${{ matrix.project }}
    # - pnpm run e2e --project=${{ matrix.project }}
    # - artefacto e2e-test-results-${{ matrix.project }}
e2e:
  name: e2e
  needs: e2e-navegador
  if: always() && <misma condición>
  steps: [comprobar que needs.e2e-navegador.result == 'success', si no, exit 1]
```

- Cada job de la matriz es un runner distinto: tiene su Postgres de servicio, su base
  `quimicloude_e2e` y su servidor en el 3117, sin choque posible.
- `github.base_ref == 'prod'` sigue escrito tal cual: `scripts/check-perfil.mjs` lo comprueba.
- El job agregador conserva el nombre de check `e2e`. Así una regla de rama o un hábito que lo
  nombren no cambian (P2).

### 4.3 Guardias (R6, R19, R23–R25; sujeto a P1)

| Archivo | Qué afirma |
|---|---|
| `tests/guards/guard-e2e-fixture-user.test.ts` | Ningún `e2e/**/*.ts` salvo `e2e/helpers/fixture-user.ts` contiene `.user.create(`, `.user.createMany(` ni `.user.upsert(`. Nombra archivo y línea. Incluye el caso rojo con un texto sintético. |
| `tests/guards/guard-e2e-sin-saltos.test.ts` | Ningún `e2e/**/*.spec.ts` contiene `test.skip(`, `test.fixme(`, `test.fail(`, `test.only(` ni `describe.only(`. |
| `tests/guards/guard-e2e-presupuesto.test.ts` | `playwright.config.ts` (importado) tiene `use.actionTimeout` en `(0, 30_000]`. Además, leyendo `gate.yml` como texto: hay un job con matriz `project` cuyos valores son exactamente los `projects[].name` de la config, con `fail-fast: false` y `--project=${{ matrix.project }}`, y un job `e2e` con `needs` sobre él. |

Las tres viven en `tests/guards/` porque `init.sh` no corre Playwright (mismo motivo que
`guard-e2e-landing`).

## 5. El criterio de hecho (R26, R27)

- **R26:** `workflow_dispatch` de `gate.yml` sobre `feature/QC-255-sanear-suite-e2e`, o el PR a
  `prod`. El run se cita en `progress/impl_QC-255.md` con su id, la duración de cada job y el
  recuento `passed / flaky / failed / skipped` por proyecto. `skipped` y `did not run` deben ser 0.
- **R27:** sobre el log del job, contar `GET /login?sesion=fin` y atribuirlo a su test (el script
  `sesfin.js` del diagnóstico hacía eso; se reescribe dentro de `progress/` si hace falta, sin
  versionarlo como herramienta). Solo valen los casos de `session.spec.ts` y
  `cierre-de-sesiones.spec.ts`.
- Los flaky del run se listan con su primer error. Los que tengan la firma
  `interrupted by another navigation` se anotan como entrada para QC-208 (P3).

## 6. Alternativas descartadas

- **Arreglar el sello en la app** (migración `DEFAULT date_trunc('second', now()) - interval '1 second'`):
  toca identity, necesita su spec y es exactamente QC-116, que está en curso. D6 lo deja fuera.
  Además, el helper sigue haciendo falta después: un fixture no debe depender de la precisión del
  reloj de la base.
- **Esperar 1–1.5 s tras crear el usuario** (lo que demostró la sonda): mete tiempo muerto en 52
  specs (más de 1 min de worker por pasada) y sigue dependiendo del reloj. Se descarta.
- **Un `globalSetup` que actualice `sessionsValidFrom` de todos los usuarios** antes de la suite: no
  cubre los usuarios que los `beforeAll` crean durante la corrida, que son justo los afectados. Se
  descarta.
- **`--shard=1/2,2/2` en vez de matriz por proyecto:** reparte por archivo y mezcla navegadores, así
  que un flake de WebKit sigue tumbando un shard con tests de Chromium. Se queda como opción (b) de
  P2.
- **Subir `timeout-minutes` del job a 90:** tapa el síntoma. El diagnóstico mide que con la suite
  sana caben 25–32 min. Se descarta.

## 7. Dependencias de terceros

Ninguna nueva. Playwright (`@playwright/test`) ya está aprobada (QC-7). Las guardias leen el YAML
como texto, igual que `guard-despliegue-produccion.test.ts`, sin parser.

## 8. Enmiendas a specs cerrados

Ninguna obligatoria. Los requisitos que citan los casos (R36 de presentaciones, R42 de grupos, R22
de datos de lote, R51 de proveedores…) no cambian: cambia cómo los ejercita el E2E. El spec dueño
de cada uno se identifica en T7 al escribir la tabla de R20. Si al adaptar un caso apareciera que el
requisito dueño ya no se cumple tal como está escrito, eso es R21: se para.
