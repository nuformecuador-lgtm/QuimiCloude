# Diagnóstico E2E del PR #199 (dev → prod) — entrada de QC-255

> Copia versionada de lo esencial del diagnóstico del run `38061624000` (commit `2c546f39`, =
> `origin/dev` del 2026-10-10). El original vivía en el scratchpad de la sesión del leader. Al final,
> las comprobaciones que hizo `spec_author` el 2026-10-10 sobre el código.

## Resumen

- **El E2E no es una regresión de esta tanda: lleva rojo desde ~2026-09-08.**
  - Último run terminado antes de #199: `37949320994` (workflow_dispatch sobre QC-223, 2026-10-09),
    218 tests en 2 workers: **18 failed + 14 flaky en 58.5 min**. Ya fallaban los mismos 9 tests
    "duros" en los dos navegadores.
  - El anterior, `37804883269` (QC-167, 10-08), también fue `failure`.
- **El run de #199 hizo 264 ejecuciones**: chromium completo (171 tests) y webkit solo 36 de 171.
  - 69 ✘ en 46 tests distintos; 11 "duros" (3 intentos en rojo: 10 en chromium y
    aislamiento-recetas en webkit); **34 flaky**; 1 test cortado a medias.
- **Tiempo.** ~6 840 worker-s: 5 890 s en fallos (60–300 s cada uno, ×3 por retries) y solo 950 s
  en tests verdes.
- **Seis causas raíz** más el presupuesto de tiempo. Una de entorno/fixture explica la mayoría de
  los flakes; las otras cinco son tests desactualizados por cambios intencionales.
  **No se encontró ninguna regresión de código de app.**

| # | Causa | Tipo | Tests afectados (CI) | Duro / flaky |
|---|---|---|---|---|
| A | Carrera del "sello de sesión" en el mismo segundo que la creación del usuario del fixture | fixture/tiempo, latente en app (QC-116) | ~35 | flaky |
| B | Fixture que crea usuarios sin `accountStatus: 'active'` | test desactualizado (QC-65/QC-78) | errores | duro |
| C | Formularios que ahora exigen más campos | test desactualizado | presentaciones, aislamiento-recetas, pedidos-cotizacion ×2 | duro |
| D | Testids/controles retirados o movidos a menú de fila | test desactualizado | permisos, grupos-de-trabajo, datos-de-lote | duro |
| E | Formato decimal de pantalla (2 decimales) | test desactualizado | proveedores R51 | duro |
| F | Limpieza `afterAll` rota por FK de `credential_setup_tokens` | test desactualizado | usuarios R42 | duro |
| G | Presupuesto: `next dev` + 2 workers + clicks sin timeout + retries ×3 | entorno CI | todo el job | — |

## A. Carrera del sello de sesión

- **Síntoma:** `loginAndLand` (`e2e/helpers/landing.ts:79`) se queda 60 s en `waitForURL`, con
  `/dashboard` → `/login?sesion=fin`.
- **Mecanismo:** `users.sessions_valid_from` nace con `now()` con fracción de segundo
  (`db/migrations/20260912103000_session_revocation`, QC-23); el `iat` del token va truncado al
  segundo; `isStampedOut` (`lib/modules/identity/domain/session-revocation.ts:61`) corta con
  `iat <= sello`. Una sesión emitida en el mismo segundo de reloj en que se insertó el usuario nace
  muerta.
- **52 specs** crean usuarios con Prisma y ninguno fija `sessionsValidFrom`.
- **Evidencia:** sonda local (login a los 16 ms de crear el usuario → `sesion=fin`; esperando 1.5 s
  aterriza). En CI: 89 `GET /login?sesion=fin`; 40 de 69 fallos con `sesion=fin` en la ventana
  previa, frente a 6 de 195 verdes (los tests de sesión que lo provocan a propósito). En local,
  17 de 27 rojos eran este patrón.
- **Specs afectados (flaky de CI):** ajuste-de-inventario, catalogo-desde-pdf, cierre-de-sesiones,
  clientes, documentos, ejecucion-receta, entregar-producto-terminado, integraciones,
  inventario-importar, inventario, marca-componentes, movimiento, pasos-de-envasado,
  pedidos-asignados, pedidos-busqueda, pedidos-responsables, presentaciones R6, recetas-pasos,
  recetas-porcentaje, recorrido-ejecucion, registro-ejecucion, session, unidades,
  versiones-de-receta.
- **Arreglo propuesto (el que toma QC-255):** helper E2E único que crea usuarios de fixture con el
  sello en el pasado y `accountStatus: 'active'`, y migrar los 52 specs. El arreglo de la app
  (sello truncado) es QC-116 y no entra aquí.

## B. Usuario de fixture que nace `pending`

- `errores.spec.ts:197`, duro en los dos navegadores desde el 2026-09-10. `waitForURL` sin ninguna
  navegación: el login rechaza las credenciales.
- El `beforeAll` (`~157`) hace `prisma.user.create` sin `accountStatus`; desde QC-65/QC-78 el
  default es `pending`.

## C. Formularios que exigen más datos

1. `presentaciones.spec.ts:280` (R36): `presentation-sheet` no se cierra; desde QC-80 la unidad es
   obligatoria (`presentation-form.tsx`, error `unitId`). El helper de alta rápida ya se arregló
   (`566d122d`); este caso no.
2. `aislamiento-recetas.spec.ts:203`, paso 4: `recipe-form-submit` está
   `disabled={isPending || !canSubmit}` con `canSubmit = isComplete && hasAllProducts`
   (`app/(private)/produccion/formulas/components/recipe-form.tsx:230`, desde `afa5a867`,
   2026-09-23). El test solo teclea el nombre.
3. `pedidos-cotizacion.spec.ts:416` y `:503`: `order-cost-quote-value` se queda en `—`. Ver la
   comprobación de abajo: falta la unidad.

## D. Controles retirados o movidos

1. `permisos.spec.ts:201`: busca `private-user-trigger`, retirado el 2026-09-08 (el logout pasó al
   encabezado, `components/private/nav-user.tsx`, "ENMIENDA DEL 2026-09-07").
2. `grupos-de-trabajo.spec.ts:358`: `work-group-member-search` ya no existe; lo retiró `897a4f91`
   ("alta de grupo con miembros", 2026-10-02, commit fuera del arnés, ver QC-180) y `527a9902`.
3. `datos-de-lote-en-acondicionamiento.spec.ts:625` (R22): click sin timeout sobre
   `product-batches-open` dentro de la fila (`:410`). QC-232 (`c2d4d46f`, 2026-10-09) movió "Lotes"
   al menú de fila (`product-row-actions.tsx:28`); el spec de QC-219 (`46236c42`) se escribió contra
   la fila vieja.

## E. Formato decimal

- `proveedores.spec.ts:360` (R51): espera `12.3456`, recibe `12.35` en `data-table-cell-cost`.
  Desde `682d3e3b` ("la pantalla redondea a dos", 2026-09-17) la celda pinta `formatDecimalDisplay`
  y guarda el exacto en `title` (`app/(private)/proveedores/[id]/components/catalog-columns.tsx:199`).

## F. Limpieza de usuarios

- `usuarios.spec.ts:305` (R42): `prisma.company.deleteMany` lanza `users_company_id_fkey` porque
  el `prisma.user.deleteMany` previo falló por `credential_setup_tokens_user_id_fkey` (crear un
  usuario genera su token, QC-79). El error del `finally` tapa el primero.
- El log muestra también `faltan RESEND_API_KEY, MAIL_FROM_ADDRESS`: no rompe el test.

## G. Presupuesto de tiempo

- Verde medio por test: chromium 4.3–7.2 s, webkit 7.7–13.4 s. Arranque del job ~1.5 min.
- Con la suite sana (342 tests, 171 por proyecto): 43–57 min-worker / 2 workers ≈ **22–29 min de
  suite, 25–32 min de job**. 60 min alcanzan con margen ~2×.
- Hoy no alcanza por: fallos ×3 intentos; clicks/fills sin timeout (C2, D2, D3) que consumen el
  timeout del test (180–300 s) en cada intento; `next dev` compilando bajo demanda.
- Propuestas: arreglar A–F; `use.actionTimeout` (~15–30 s); matriz por proyecto en el job E2E
  (alternativa `--shard`); opcional `next build && next start` en CI; retries a 1 tras quitar A.

## Comprobaciones de `spec_author` (2026-10-10, sobre `dev` = `2c546f39`)

- **C3, campo exacto:** `canQuote` (`use-order-cost-quote.ts:62`) exige receta, reparto válido y
  que `quoteOrderCostSchema` acepte `{recipeId, quantity, unitId, presentationLines}`. `unitId` es
  `z.string().uuid()` obligatorio (`lib/modules/pedidos/domain/order-input.ts:64,128,213-215`). Un
  reparto vacío es válido (`presentationLinesSchema = ...default([])`, `order-input.ts:104`). El
  caso `:416` elige la unidad en el paso (d), **después** de esperar las cotizaciones (a)–(c); el
  caso `:503` no la elige nunca. **Lo que falta es la unidad**, no el reparto.
- **D3, los otros cuatro specs:** `ajuste-de-inventario`, `insumo-por-unidad`,
  `producto-terminado` y `reserva-de-material` ya abren `product-batches-open` por
  `openRowActionsMenuItem`. Solo `datos-de-lote-en-acondicionamiento` usa la fila.
- **D2, el buscador actual:** la búsqueda de personas del grupo es ahora `WorkGroupMemberPicker`
  (`app/(private)/configuracion/usuarios/components/work-group-form.tsx:550`), montado sobre el
  `DataTable` compartido; los candidatos no tienen `data-testid` propio: el botón lleva
  `aria-label="Agregar: <nombre>"`.
- **B:** `errores.spec.ts` es el único de los 52 que crea usuarios sin `accountStatus`.
- **A:** ningún spec de `e2e/` fija hoy `sessionsValidFrom`.
- **Saltos:** `e2e/` no tiene hoy ningún `test.skip`, `test.fixme` ni `test.fail`; hay un
  `click({ force: true })` previo en `pedido-con-cliente.spec.ts:527`, fuera de esta ficha.
