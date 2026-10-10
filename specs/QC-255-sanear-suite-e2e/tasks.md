# QC-255 — sanear-suite-e2e · tasks.md

> Orden: T1 → T2 → (T3 ∥ T4 ∥ T5 ∥ T6) → T7 → T8 → T9. `[P]` = paralelizable con las demás `[P]`
> de su tanda. Ninguna task toca `app/`, `lib/`, `components/`, `hooks/`, `middleware.ts` ni `db/`
> (R22).
>
> E2E en local: `pnpm exec playwright test <spec>` (puerto 3117, base propia). Al menos una pasada
> por spec tocado, en `--project=chromium` y en `--project=webkit`.

## Tanda 1 — el helper

- [ ] **T1 — `e2e/helpers/fixture-user.ts` y su test unitario** (R1, R2, R3, R4)
  - `fixtureSessionsValidFrom(now)` y `createFixtureUser(args)` según `design.md > 2`.
  - `tests/unit/e2e-helpers/fixture-user.test.ts` con Prisma mockeado, como `landing.test.ts`:
    - el sello cae ≥ 1 s antes de `floor(now)`, probado con `now` en `.000`, `.500` y `.999` (R1);
    - sin `accountStatus`, llega `active` (R2);
    - con `accountStatus: 'pending'`, con `sessionsValidFrom` explícito y con un `select`, llega lo
      del llamante (R3, R4).
  - **Hecho:** `pnpm exec vitest related --run e2e/helpers/fixture-user.ts` verde, typecheck y
    lint verdes.

- [ ] **T2 — Guardia de fixtures de usuario** (R6; sujeta a P1) — depende de T1
  - `tests/guards/guard-e2e-fixture-user.test.ts` según `design.md > 4.3`, con un caso rojo
    sintético que demuestra que muerde.
  - **Hecho:** la guardia está **roja** contra `dev` y nombra los 54 sitios. Se deja roja hasta T3.

## Tanda 2 — migrar y adaptar (paralelo)

- [ ] **T3 [P] — Migrar los 52 specs al helper** (R5, R7, R8, R9) — depende de T1
  - Reemplazo mecánico `prisma.user.create(` → `createFixtureUser(` en todos los specs de
    `## Archivos esperados` marcados «helper». En `errores.spec.ts` no se añade nada: el `active`
    lo pone el helper.
  - `login.spec.ts`, `establecer-contrasena.spec.ts`, `session.spec.ts` y
    `cierre-de-sesiones.spec.ts` conservan sus estados y sus afirmaciones de revocación.
  - **Hecho:** T2 verde. `errores.spec.ts`, `session.spec.ts`, `cierre-de-sesiones.spec.ts` y
    `login.spec.ts` verdes en local en los dos proyectos. Una muestra de 5 specs flaky del diagnóstico
    (inventario, marca-componentes, recetas-pasos, unidades, pedidos-asignados) verde en chromium con
    `--retries=0`.

- [ ] **T4 [P] — Casos de formularios: C** (R10, R11, R12, R13) — depende de T1
  - `presentaciones.spec.ts` R36, `aislamiento-recetas.spec.ts` paso 4 y `pedidos-cotizacion.spec.ts`
    `:416` y `:503`, según `design.md > 3`.
  - **Hecho:** los tres specs verdes en local en los dos proyectos, sin cambiar ningún importe
    esperado. Si un importe no cuadra, se para (R13).

- [ ] **T5 [P] — Casos de controles movidos: D** (R14, R15, R16) — depende de T1
  - `permisos.spec.ts`, `grupos-de-trabajo.spec.ts` R42 y `datos-de-lote-en-acondicionamiento.spec.ts`
    R22.
  - **Hecho:** los tres verdes en local en los dos proyectos. `grep -n "private-user-trigger\|work-group-member-search\|work-group-candidate'" e2e/` sin resultados.

- [ ] **T6 [P] — Formato y limpieza: E, F** (R17, R18) — depende de T1
  - `proveedores.spec.ts` R51 y `usuarios.spec.ts` `afterAll`.
  - **Hecho:** los dos verdes en local en chromium y webkit. Tras correr `usuarios.spec.ts`, ningún
    usuario ni empresa con su prefijo de `RUN_ID` queda en la base.

## Tanda 3 — sin relajar y presupuesto

- [ ] **T7 — Tabla de equivalencias y guardia de saltos** (R19, R20, R21) — depende de T3–T6
  - `progress/impl_QC-255.md`: tabla «caso → afirmación antes / después → ficha o commit», con el
    spec dueño de cada requisito citado (R36, R42, R22, R51) y la ficha de `afa5a867` confirmada con
    `git log`.
  - `tests/guards/guard-e2e-sin-saltos.test.ts` (sujeta a P1).
  - **Hecho:** guardia verde. Cada fila de la tabla tiene su origen. Sin casos de R21, o la feature
    parada con la pregunta escrita.

- [ ] **T8 — `actionTimeout` y matriz por navegador** (R23, R24, R25; R24/R25 sujetos a P2) —
  depende de T3–T6
  - `playwright.config.ts > use.actionTimeout = 30_000`.
  - `.github/workflows/gate.yml`: job `e2e-navegador` con matriz y job agregador `e2e`, según
    `design.md > 4.2`. Se actualiza el comentario de cabecera del workflow.
  - `tests/guards/guard-e2e-presupuesto.test.ts`.
  - **Hecho:** guardia verde, `./init.sh` verde (incluye `check-perfil`) y
    `pnpm exec playwright test --list` cuenta los mismos tests por proyecto que antes.

## Tanda 4 — la prueba

- [ ] **T9 — Run E2E completo** (R26, R27) — depende de T7 y T8
  - Push de la rama y `workflow_dispatch` de `gate.yml` sobre ella.
  - En `progress/impl_QC-255.md`: id del run, duración por job, `passed / flaky / failed / skipped`
    por proyecto, recuento de `sesion=fin` atribuido a su test, y lista de flaky con su primer error
    (los de `interrupted by another navigation` marcados para QC-208).
  - **Hecho:** run en éxito dentro del timeout, 0 `skipped` o `did not run`, 0 `sesion=fin` fuera
    de `session.spec.ts` y `cierre-de-sesiones.spec.ts`. Si no cabe en el tiempo, se para y se
    pregunta (P4).

## Trazabilidad R → test

| R | Test |
|---|---|
| R1, R2, R3, R4 | `tests/unit/e2e-helpers/fixture-user.test.ts` |
| R5, R6 | `tests/guards/guard-e2e-fixture-user.test.ts` |
| R7 | `e2e/session.spec.ts` (caso que afirma `LOGIN_ROUTE_SESSION_ENDED`), `e2e/cierre-de-sesiones.spec.ts` |
| R8 | `e2e/login.spec.ts`, `e2e/establecer-contrasena.spec.ts` |
| R9 | `e2e/errores.spec.ts` (caso de `:197`) |
| R10 | `e2e/presentaciones.spec.ts` (R36) |
| R11 | `e2e/aislamiento-recetas.spec.ts` (paso 4) |
| R12, R13 | `e2e/pedidos-cotizacion.spec.ts` (`:416`, R59 `:503`) |
| R14 | `e2e/permisos.spec.ts` (`:201`) |
| R15 | `e2e/grupos-de-trabajo.spec.ts` (R42) |
| R16 | `e2e/datos-de-lote-en-acondicionamiento.spec.ts` (R22) |
| R17 | `e2e/proveedores.spec.ts` (R51) |
| R18 | `e2e/usuarios.spec.ts` (R42 y su `afterAll`) |
| R19 | `tests/guards/guard-e2e-sin-saltos.test.ts` |
| R20, R21 | Tabla de `progress/impl_QC-255.md`, verificada por el reviewer sobre el diff |
| R22 | `git diff --name-only origin/dev...HEAD` (reviewer) |
| R23, R24, R25 | `tests/guards/guard-e2e-presupuesto.test.ts` |
| R26, R27 | Run de CI citado en `progress/impl_QC-255.md` (T9) |

## Archivos esperados

Nuevos:

- `e2e/helpers/fixture-user.ts`
- `tests/unit/e2e-helpers/fixture-user.test.ts`
- `tests/guards/guard-e2e-fixture-user.test.ts`
- `tests/guards/guard-e2e-sin-saltos.test.ts`
- `tests/guards/guard-e2e-presupuesto.test.ts`
- `progress/impl_QC-255.md`

Configuración:

- `playwright.config.ts`
- `.github/workflows/gate.yml`

Specs que pasan al helper («helper»; los marcados con `+` además se adaptan en T4–T6):

- `e2e/acondicionamiento.spec.ts`
- `e2e/acondicionar-con-equipo.spec.ts`
- `e2e/aislamiento-inventario.spec.ts`
- `e2e/aislamiento-pedidos.spec.ts`
- `e2e/aislamiento-proveedores.spec.ts`
- `e2e/aislamiento-recetas.spec.ts` (+)
- `e2e/ajuste-de-inventario.spec.ts`
- `e2e/catalogo-desde-pdf.spec.ts`
- `e2e/cierre-de-sesiones.spec.ts`
- `e2e/clientes.spec.ts`
- `e2e/datos-de-lote-en-acondicionamiento.spec.ts` (+)
- `e2e/documentos.spec.ts`
- `e2e/ejecucion-receta.spec.ts`
- `e2e/empaque.spec.ts`
- `e2e/entregar-producto-terminado.spec.ts`
- `e2e/envases-del-pedido.spec.ts`
- `e2e/errores.spec.ts` (+)
- `e2e/formula-desde-pdf.spec.ts`
- `e2e/grupos-de-trabajo.spec.ts` (+)
- `e2e/insumo-por-unidad.spec.ts`
- `e2e/integraciones.spec.ts`
- `e2e/inventario-importar.spec.ts`
- `e2e/inventario.spec.ts`
- `e2e/login.spec.ts`
- `e2e/marca-componentes.spec.ts`
- `e2e/movimiento.spec.ts`
- `e2e/pasos-de-envasado.spec.ts`
- `e2e/pedido-bloqueado.spec.ts`
- `e2e/pedido-con-cliente.spec.ts`
- `e2e/pedido-conversion-de-unidad.spec.ts`
- `e2e/pedido-en-varias-presentaciones.spec.ts`
- `e2e/pedidos-asignados.spec.ts`
- `e2e/pedidos-busqueda.spec.ts`
- `e2e/pedidos-cotizacion.spec.ts` (+)
- `e2e/pedidos-responsables.spec.ts`
- `e2e/pedidos-terminados.spec.ts`
- `e2e/pedidos.spec.ts`
- `e2e/permisos.spec.ts` (+)
- `e2e/presentaciones.spec.ts` (+)
- `e2e/producto-terminado.spec.ts`
- `e2e/proveedores.spec.ts` (+)
- `e2e/recetas-pasos.spec.ts`
- `e2e/recetas-porcentaje.spec.ts`
- `e2e/recetas.spec.ts`
- `e2e/recorrido-ejecucion.spec.ts`
- `e2e/registro-ejecucion.spec.ts`
- `e2e/reserva-de-material.spec.ts`
- `e2e/session.spec.ts`
- `e2e/unidades.spec.ts`
- `e2e/usuarios.spec.ts` (+)
- `e2e/versiones-de-receta.spec.ts`
- `e2e/versiones-en-la-receta.spec.ts`
