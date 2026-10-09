# QC-249 — bitacora de implementacion

## implementer — consolidado (2026-10-09)

Commits en `feature/QC-249-entorno-de-preview`: `57ba2352` (T1, T4, T5), `79fb3ab6` (T2, T3),
docs/T6-T7 y este cierre. T1-T7 marcadas `[x]` en `tasks.md`; T9 es del humano.

### Archivos creados/modificados
- Nuevos: `scripts/entorno-de-preview.mjs`, `.github/workflows/preview.yml`,
  `lib/modules/identity/adapters/driven/mail/credential-setup-mailer-desactivado.ts`,
  `tests/unit/scripts/entorno-de-preview.test.ts`,
  `tests/unit/identity/credencial/mailer-desactivado.test.ts`,
  `tests/guards/guard-despliegue-preview.test.ts`, `tests/guards/guard-variables-por-entorno.test.ts`.
- Modificados: `scripts/build.mjs`, `scripts/seed-demo.ts` (cabecera), `scripts/seed-demo/guard.ts`,
  `lib/modules/identity/adapters/driven/config/mail-config-env.ts`, `lib/composition/index.ts`
  (**solo 3 lineas `+`**), `.env.example` (**solo adiciones**, 0 lineas `-`),
  `tests/unit/scripts/build.test.ts`, `tests/unit/scripts/seed-demo-guard.test.ts`,
  `tests/unit/identity/credencial/mail-config.test.ts`, `tests/unit/composition/identity-facade.test.ts`,
  `docs/architecture.md`, `docs/verification.md`, `docs/dependencias.md`,
  `specs/QC-79-alta-sin-contrasena-y-enlace/design.md`,
  `specs/QC-107-componente-de-carga-de-archivos/design.md`, `specs/QC-249-entorno-de-preview/tasks.md`.

### Mapa R<n> -> test (resumen; nombres exactos en las secciones de cada tanda)
| R | Test |
|---|---|
| R1-R6 | `tests/guards/guard-despliegue-preview.test.ts` (casos «R1: ...» a «R6: ...») |
| R7, R8 | `tests/unit/scripts/build.test.ts`; R8 tambien `tests/unit/identity/seed/deploy-hook.test.ts` |
| R9, R10 | `tests/unit/scripts/entorno-de-preview.test.ts` y `tests/unit/scripts/build.test.ts` (via `ejecutarBuild`) |
| R11 | `tests/unit/identity/credencial/mailer-desactivado.test.ts`, `mail-config.test.ts`, `tests/unit/composition/identity-facade.test.ts` |
| R12 | `tests/unit/identity/credencial/mail-config.test.ts`, `identity-facade.test.ts`, `tests/guards/guard-envio-de-correo.test.ts` |
| R13-R15 | `tests/unit/scripts/seed-demo-guard.test.ts` |
| R16 | `tests/unit/scripts/seed-demo-run.test.ts` (verde) y `tests/integration/identity/identity-seed.int.test.ts` (no corrido en local, ver abajo) |
| R17 | `tests/guards/guard-variables-por-entorno.test.ts` («R17: toda variable de .env.example fuera del bloque MCP aparece en la primera columna de la tabla» + sensibilidad) |

### T8 — gate local (salida real)
- `./init.sh` (con `DATABASE_URL` local pasada por el entorno, el worktree no tiene `.env`):
  node, dependencias, board, cupo, specs, perfil, worktrees, Prisma, tipos de ruta, **typecheck
  paso**, **lint paso**; `test:rapido` **fallo por entorno**: `connect ECONNREFUSED 127.0.0.1:5433`
  (Docker Desktop no esta corriendo; el setup global del proyecto `integration` necesita el
  Postgres local). No es un fallo de codigo. **T8 queda sin cerrar en verde**: hay que repetirlo
  con el Postgres arriba.
- Sin base, lo mismo que relaciona `test:rapido`, por proyecto:
  - `pnpm exec vitest related --run --project node --project ui <archivos .ts/.mjs del diff>`:
    `Test Files 290 passed (290)` · `Tests 4512 passed | 1 skipped (4513)`.
  - `pnpm exec vitest run guard`: `Test Files 64 passed (64)` · `Tests 859 passed | 15 skipped (874)`.
  - `pnpm exec vitest run tests/unit/identity/seed/deploy-hook.test.ts tests/unit/scripts/seed-demo-run.test.ts`: 2 archivos, 27 pasan.

### Puntos para el reviewer
1. `preview.yml`, paso de proteccion: si `curl` falla por red/tiempo, el paso queda en rojo
   (bash con `-e`). Lado seguro; el design no lo fija.
2. `guard-dobles-e2e.test.ts` es fragil: su patron toma la declaracion siguiente a
   `DOCUMENTS_E2E_DOUBLES=` como si la activara; por eso `PREVIEW_SUPABASE_REF=` va antes de ese
   bloque en `.env.example`. Fuera de alcance; candidato a ficha.
3. `lib/composition/index.ts`: el comentario «Los tres cumplen el MISMO puerto» queda corto (ya son
   cuatro) y no se cambio por la restriccion de solo adiciones.

## backend_dev — T1, T4, T5 (2026-10-09)

### Archivos
- Nuevo: `scripts/entorno-de-preview.mjs` (`VARIABLE_REF_DE_PREVIEW`, `apuntanAPreview`,
  `comprobarEntornoDePreview`; Node puro, sin imports de `lib/`; `DOCUMENTS_E2E_DOUBLES` solo como
  elemento de arreglo y leida por indice).
- Nuevo: `tests/unit/scripts/entorno-de-preview.test.ts`.
- Modificado: `scripts/build.mjs` (`SEMBRAR_DEMO`, `CON_TODO_Y_DEMO`, rama `VERCEL_ENV=preview`,
  `problemas` en `ejecutarBuild`, cabecera, mensaje de la rama sin base).
- Modificado: `tests/unit/scripts/build.test.ts` (cambia el caso de preview; casos nuevos).
- Modificado: `scripts/seed-demo/guard.ts` (rama de preview con
  `apuntanAPreview(env, ['DATABASE_URL','DIRECT_URL'])`, cabecera con la enmienda fechada).
- Modificado: `scripts/seed-demo.ts` (solo cabecera).
- Modificado: `tests/unit/scripts/seed-demo-guard.test.ts` (el caso «--forzar no anula preview»
  cambia de sentido; casos R13/R14/R15).

### R -> test
- R7: `build.test.ts` > «Vercel con VERCEL_ENV=preview y configuracion correcta corre migrate,
  generate, seed, seed de demo y next build (R7)», «configuracion correcta: corre los cinco pasos
  en orden, la demo sin --forzar, y devuelve 0 (R7)», «falla el seed de demo... (R7)», «falla
  migrate... (R7)».
- R8: `build.test.ts` > «Vercel con VERCEL_ENV=production corre los cuatro pasos... sin seed de
  demo (R8)», «...development se salta migrate y seed (R8)», «...otro VERCEL_ENV cualquiera
  (R8)», «...VERCEL_ENV vacio... (R8)», «Vercel sin VERCEL_ENV... (R8)», «fuera de Vercel... aunque
  VERCEL_ENV diga preview (R8)»; `deploy-hook.test.ts` sigue verde.
- R9: `entorno-de-preview.test.ts` > «sin PREVIEW_SUPABASE_REF falla nombrandola (R9)», «cada URL
  sin el ref de preview es un problema que la nombra (R9)», «ningun mensaje contiene un valor del
  entorno (R9, R10)»; `build.test.ts` > «una URL de otro proyecto: devuelve 1, no ejecuta ningun
  paso y nombra la variable (R9)».
- R10: `entorno-de-preview.test.ts` > «MAIL_TRANSPORT distinta de desactivado... (R10)»,
  «DOCUMENTS_E2E_DOUBLES vacia o ausente es un problema (R10)», «cada credencial con valor es un
  problema que la nombra (R10)», «todas las condiciones juntas... (R9, R10)», «...usa el mismo
  literal que ...e2e-doubles-env.ts (R10)»; `build.test.ts` > «efectos fuera de la app: escribe un
  problema por variable, devuelve 1 y no ejecuta nada (R10)».
- R13: `seed-demo-guard.test.ts` > «VERCEL_ENV=preview dentro de Vercel contra la base de preview:
  permitido sin --forzar, aunque la base sea remota y haya CI (R13)».
- R14: `seed-demo-guard.test.ts` > «VERCEL_ENV=preview sin VERCEL: negado, tambien con --forzar
  (R14)», «...sin PREVIEW_SUPABASE_REF... (R14)», «...con DATABASE_URL o DIRECT_URL de otro
  proyecto o local... (R14)».
- R15: `seed-demo-guard.test.ts` > «rechaza VERCEL_ENV=production aunque la base sea local
  (R15)», «--forzar no anula VERCEL_ENV=production (R15)», «--forzar no anula un VERCEL_ENV
  arbitrario distinto de development (R15)», «VERCEL_ENV=production o arbitrario se niega aunque el
  entorno apunte a la base de preview, con o sin --forzar (R15)».

### Verificacion (salida real)
- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: 0 errores, 8 warnings (ninguno en estos archivos; uno en
  `credential-setup-mailer-desactivado.ts`, del otro agente; el resto preexistentes).
- `pnpm exec vitest related --run <archivos>`: 4 files, 79 passed.
- `pnpm exec vitest run guard`: 63 files, 853 passed, 15 skipped.
- `pnpm exec vitest run tests/unit/identity/seed/deploy-hook.test.ts tests/unit/scripts/seed-demo-run.test.ts`:
  2 files, 27 passed.

Veredicto: T1, T4 y T5 hechas y en verde.

## backend_dev — T2, T3 (2026-10-09)

### Archivos
- Modificado: `lib/modules/identity/adapters/driven/config/mail-config-env.ts` (`'desactivado'` al
  final de `MAIL_TRANSPORTS`; `resend` sigue primero y el defecto no cambia).
- Nuevo: `lib/modules/identity/adapters/driven/mail/credential-setup-mailer-desactivado.ts`.
- Modificado: `lib/composition/index.ts` (solo adiciones: 1 import y `case 'desactivado'`;
  `git diff --stat`: 3 insertions(+), 0 deletions).
- Nuevo: `.github/workflows/preview.yml`.
- Nuevo: `tests/guards/guard-despliegue-preview.test.ts`.
- Nuevo: `tests/unit/identity/credencial/mailer-desactivado.test.ts`.
- Modificado: `tests/unit/identity/credencial/mail-config.test.ts`,
  `tests/unit/composition/identity-facade.test.ts` (bloque nuevo al final).

### R -> test
- R1: `guard-despliegue-preview.test.ts` > «R1: dispara solo en pull_request a [dev]...», «R1:
  despliega con `vercel@x.y.z deploy` y SIN `--prod`», «R1: la CLI va con version semver exacta y
  es la MISMA que la de desplegar.yml», «R1: el runner no instala dependencias ni construye...».
- R2: `guard-despliegue-preview.test.ts` > «R2: el job solo corre si la rama del PR vive en este repo...».
- R3: `guard-despliegue-preview.test.ts` > «R3: el entorno `preview` toma su URL de la salida del
  paso de despliegue», «R3: la URL queda en el resumen de la ejecucion».
- R4: `guard-despliegue-preview.test.ts` > «R4: lee los tres secrets de Vercel», «R4: antes de
  desplegar, un paso comprueba los tres secrets con `-n` y sale con `exit 1`», «R4: el token no va
  por `--token`».
- R5: `guard-despliegue-preview.test.ts` > «R5: grupo de concurrencia por numero de PR y
  `cancel-in-progress: false` explicito».
- R6: `guard-despliegue-preview.test.ts` > «R6: despues del despliegue, un paso pide la URL con
  curl y falla ante cualquier 2xx».
- R11: `mailer-desactivado.test.ts` > «R11: devuelve failed y no lanza», «R11: no llama a fetch ni
  escribe ningun archivo», «R11: registra una sola linea ... sin destinatario, URL ni secreto»,
  «R11: el adaptador no importa nada ni lee el entorno»; `mail-config.test.ts` > «R11: desactivado
  se admite y se resuelve tal cual»; `identity-facade.test.ts` > «R11: con
  MAIL_TRANSPORT=desactivado la fachada usa ese transporte y devuelve failed».
- R12: `mail-config.test.ts` > «R12: ausente o vacia sigue siendo resend, y resend sigue siendo el
  primero de la lista», «R12: variantes de desactivado que no son exactas fallan»;
  `identity-facade.test.ts` > «R12: sin MAIL_TRANSPORT la fachada sigue usando resend»;
  `guard-envio-de-correo.test.ts` verde.

### Salida
- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: 0 errors, 7 warnings (todas preexistentes, en `confirm-catalog-import.test.ts`
  y `order-service.test.ts`).
- `pnpm exec vitest related --run --project node --project ui <archivos de T2/T3>`: 285 files,
  4427 passed, 1 skipped. Sin `--project`, `related` arrastra el proyecto `integration` y su
  globalSetup aborta por falta de `DATABASE_URL` (no hay base de test en este worktree).
- `pnpm exec vitest run guard`: 63 files, 853 passed, 15 skipped.

Veredicto: T2 y T3 hechas y en verde.

## backend_dev — T6, T7 (2026-10-09)

### Archivos
- `docs/architecture.md`: nota fechada en el bullet de `## Despliegue a produccion`; «Por qué»
  corregido a «Migrate y seed solo en production y preview, cada uno con su base» con nota fechada;
  seccion nueva `## Previews (QC-249)` (flujo del workflow, comprobacion previa R9/R10, limite
  conocido de la subida de PDF —pregunta abierta 1 cerrada con la opcion por defecto—, lo que hace
  el humano, `### Variables por entorno` con la tabla de design § 11 con los comodines `SEED_*`
  expandidos a nombres explicitos).
- `docs/verification.md > Datos de demostración`: punto nuevo con las reglas enmendadas de la guarda
  y nota fechada de la enmienda de QC-230 (texto original intacto).
- `docs/dependencias.md`: fila de la CLI de Vercel, uso ampliado a `preview.yml` (misma version).
- `.env.example`: SOLO adiciones (18 lineas, 0 borradas): comentario de `desactivado` antes de
  `MAIL_TRANSPORT=`; nota fechada en el bloque `INTEGRATIONS_ENCRYPTION_*`; bloque nuevo con
  `PREVIEW_SUPABASE_REF=` vacia **entre** `INTEGRATIONS_ENCRYPTION_ACTIVE=` y el bloque de dobles.
  No va al final: `PATRON_DE_ACTIVACION` de `guard-dobles-e2e.test.ts` usa `\s*` tras el `=`, que
  cruza saltos de linea; con cualquier declaracion despues de `DOCUMENTS_E2E_DOUBLES=` la guardia
  la lee como activada (rojo medido). Fragilidad de esa guardia, no corregida aqui.
- `tests/guards/guard-variables-por-entorno.test.ts` (nuevo).
- `specs/QC-79-alta-sin-contrasena-y-enlace/design.md > 9.2` y
  `specs/QC-107-componente-de-carga-de-archivos/design.md > 8`: notas fechadas, sin reescribir.

### R -> test
- R17: `tests/guards/guard-variables-por-entorno.test.ts` > «R17: toda variable de .env.example
  fuera del bloque MCP aparece en la primera columna de la tabla», con sensibilidad «R17
  SENSIBILIDAD: una variable inventada en .env.example pondria esta guardia en rojo» y «quitar una
  fila de la tabla pondria esta guardia en rojo»; ademas comprueba que el bloque MCP se delimita y
  contiene exactamente `ATLASSIAN_MCP_AUTH`, `CONTEXT7_API_KEY`, `SUPABASE_PROJECT_REF`.

### Salida
- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: 0 errors, 7 warnings (preexistentes, `confirm-catalog-import.test.ts` y
  `order-service.test.ts`).
- `pnpm exec vitest run guard`: 64 files, 859 passed, 15 skipped.
- `pnpm exec vitest run tests/unit/identity/seed/deploy-hook.test.ts`: 1 file, 13 passed.
- `git diff .env.example | grep '^-[^-]'`: sin salida.

Veredicto: T6 y T7 hechas y en verde; falta T8 (gate local) y T9 (humano).

## T8 (leader, 2026-10-09)
`./init.sh` (rápido) en el worktree, con Docker arrancado y el `.env` local del checkout principal
cargado en el entorno (apunta a localhost; no se copió ningún archivo): `== init OK ==`.
Unit/ui/node: 309 archivos, 4755 tests en verde (2 skipped). Guardias: 102 archivos, 1413 tests en
verde (32 skipped). Integración relacionada (incluida `identity-seed.int.test.ts`) en verde.

## Enmienda R9 (m1) y m5 del review (backend_dev, 2026-10-09)
Aprobada por el humano el 2026-10-09.

### Archivos
- `scripts/entorno-de-preview.mjs`: `apuntanAPreview` exige ref `/^[a-z]{20}$/` y posicion por
  variable (`POSICION_DEL_REF`): usuario `postgres.<ref>` o host `db.<ref>.supabase.co` en
  `DATABASE_URL`/`DIRECT_URL`; host `<ref>.supabase.co` en `SUPABASE_STORAGE_URL`. Variable sin
  regla o URL ilegible: no cumple. Mensajes sin valores.
- `scripts/build.mjs`: `VERCEL_ENV` recortado (m5).
- Tests: `entorno-de-preview.test.ts`, `build.test.ts`, `seed-demo-guard.test.ts` (fixtures a refs
  inventados de 20 letras y hosts `supabase.co`/`pooler.supabase.com`; tests nuevos).
- Notas fechadas (solo adicion): `requirements.md` (R9), `design.md > 4`, `docs/architecture.md >
  Previews`.
- Sin tocar: `lib/composition/index.ts`, `.env.example` (su comentario aun dice «no lo contienen»).

### R → test
- R9 (forma): `apuntanAPreview: forma del ref ...` > «un ref sin la forma de Reference ID...»,
  «ref "supabase" o "postgres"...», «ref truncado (19 letras)...»; `build.test` > «m1: ...».
- R9 (posicion): «el ref valido solo como subcadena fuera de su posicion no cuenta», «URL de
  produccion (otro ref de 20 letras)...», «validas: pooler transaction 6543, pooler session 5432 y
  conexion directa...», «la posicion depende de la variable...», «una variable sin regla...».
- R14 (herencia): `seed-demo-guard.test` > «...hereda el candado estricto de R9...», «...solo fuera
  de su posicion...».
- R7/R8 (m5): `build.test` > «m5: VERCEL_ENV se compara recortado...».

### Salida
- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: 0 errors, 7 warnings (preexistentes).
- `vitest related --project node --project ui` (6 archivos): 4 files, 94 passed.
- `pnpm exec vitest run guard`: 64 files, 861 passed, 15 skipped.

Veredicto: m1 y m5 cerrados, en verde; sin commit.

## implementer — cierre de m1 y m5 (2026-10-09)
- Enmienda de R9 aprobada por el humano: ref = `/^[a-z]{20}$/` y en posicion reconocida por variable;
  m5: `VERCEL_ENV` recortado en `scripts/build.mjs`. Detalle y nombres de test en la seccion anterior.
- `.env.example`: 3 lineas de comentario anadidas (enmienda m1); 0 lineas borradas.
- Salida: typecheck exit 0; lint 0 errores (7 avisos previos ajenos); related node+ui 4 archivos /
  94 tests verdes; `vitest run guard` + `deploy-hook.test.ts`: 65 archivos, 874 pasan, 15 saltados.
- Abierto para el humano (no implementado): una `DIRECT_URL` con host de preview y `?host=<otro>`
  pasaria la comprobacion (Prisma prioriza ese parametro). Ampliacion barata si se aprueba.
