# QC-237 — conexion-whatsapp-por-empresa · bitácora de implementación

Rama `feature/QC-237-conexion-whatsapp-por-empresa`, base `origin/dev` (ab2c6ac1; sin cambios en dev al
empezar: 79 códigos, última migración `20261008150200_delivery_permission`).

## Estado de las tareas
- T1–T11: hechas y marcadas `[x]` en `tasks.md`.
- T12: **escrita pero sin marcar**. `integraciones-whatsapp.spec.ts` no se pudo ejecutar: la base local
  de E2E no tiene la migración `20261009130000_whatsapp_connections`, y aplicarla es un paso manual de
  base (ver «Bloqueo»).
- T13: este mapa está hecho y R43 comprobado. Falta `./init.sh`, que lo corre el leader.

## Commits
| Commit | Tanda |
|---|---|
| dfa69928 | T1–T3: esquema, migración, catálogo, dominio base y puertos |
| cc250d25 | T4: seis casos de uso |
| a9c756ed | T5–T7: adaptadores de persistencia, Graph, config, aleatoriedad, doble canned |
| 85e0a8a5 | T8–T9: composición, ruta del webhook, contrato, Server Actions |
| 04ed974d | T10–T11: pantalla |
| (siguiente) | T12 escrita y esta bitácora |

## Archivos
**Base de datos:** `db/schema.prisma` (bloque al final), `db/migrations/20261009130000_whatsapp_connections/{migration.sql,down.sql}`.

**Catálogo:** `lib/modules/errores/domain/error-codes.ts`, `error-catalog.ts` (los tres códigos van al final).

**Compartido y composición:** `lib/shared/routes.ts` (al final), `lib/composition/index.ts` (bloque al final;
la línea anterior `export const integraciones = {secretCipher, secretDigest}` se quitó y se redeclara al final).

**Módulo `lib/modules/integraciones/`:**
- `index.ts`
- `domain/`: `errors.ts`, `actor.ts`, `integraciones-scope.ts`, `whatsapp-connection.ts`,
  `whatsapp-connection-input.ts`, `graph-failure.ts`, `connection-status.ts`, `connection-secrets.ts` (extra) y los
  seis casos de uso (`get-`, `create-`, `update-`, `test-`, `set-…-enabled`, `regenerate-…-verify-token`)
- `ports/`: `whatsapp-connection-repository.ts`, `whatsapp-graph-client.ts`, `random-source.ts`
- `adapters/driven/`: `config/{whatsapp-config-env,public-base-url-env,e2e-doubles-env}.ts`,
  `graph/{whatsapp-graph-client-fetch,whatsapp-graph-client-canned}.ts`,
  `persistence/{company-scope,whatsapp-connection-prisma}.ts`, `security/random-source-node.ts`
- `adapters/driving/whatsapp-connection-actions.ts`; se borró `adapters/driving/.gitkeep`

**Pantalla:** `app/(private)/integraciones/whatsapp/page.tsx` (reescrita) y `components/` (`index.ts`,
`whatsapp-integration-tabs`, `-connection-form`, `-setup-guide`, `-connection-card`, `-connection-actions`,
`-webhook-panel`, `-status-badge`).

**Entorno y E2E:** `.env.example`, `playwright.config.ts`, `e2e/integraciones-whatsapp.spec.ts` (nuevo),
`e2e/integraciones.spec.ts`.

**Tests nuevos:**
- `tests/unit/integraciones/whatsapp/`: `connection-view`, `graph-failure`, `authorization`,
  `create-whatsapp-connection`, `update-whatsapp-connection`, `test-and-enable`, `regenerate-verify-token`,
  `whatsapp-config-env`, `whatsapp-graph-client-fetch`, `random-source-node`,
  `whatsapp-graph-client-canned`, `whatsapp-webhook-url`, `whatsapp-connection-actions` (`.test.ts`) y
  `whatsapp-doubles.ts` (dobles compartidos)
- `tests/unit/composition/integraciones-graph-doubles.test.ts`
- `tests/unit/integraciones-ui/`: `whatsapp-connection-card`, `whatsapp-connection-form`,
  `whatsapp-webhook-panel`, `whatsapp-page` (`.test.tsx`)
- `tests/integration/integraciones/`: `whatsapp-connection-migration.int.test.ts`,
  `whatsapp-connection-prisma.int.test.ts`
- `tests/guards/guard-ambito-empresa-integraciones.test.ts`

**Tests modificados:**
- `tests/unit/errores/catalogo.test.ts` (82)
- `tests/unit/integraciones/module-shape.test.ts` (R13, R17–R20)
- `tests/unit/integraciones/encryption-keys-env.test.ts` (fachada de 9 miembros)
- `tests/unit/integraciones-ui/integration-pages.test.tsx`
- `tests/unit/identity/session-once-per-request-actions.test.ts` (una fila al final de `ACCIONES`)
- `tests/guards/guard-dobles-e2e.test.ts` (parametrizada por variable)
- `tests/guards/guard-identificador-de-request.test.ts` (migración al final de `MIGRACIONES_ESPERADAS`;
  spec al final de `E2E_ESPERADOS`)
- `tests/integration/aislamiento.json` (los dos `.int` nuevos)

## Mapa R<n> → test
Abreviaturas: `wa/` = `tests/unit/integraciones/whatsapp/`, `ui/` = `tests/unit/integraciones-ui/`,
`int/` = `tests/integration/integraciones/`, `e2e` = `e2e/integraciones-whatsapp.spec.ts`.

| R | Test |
|---|---|
| R1 | `wa/authorization.test.ts`: «R1: <operación> con <actor> rechaza con unauthorized sin tocar ningún puerto» (7 operaciones × 5 actores) |
| R2 | `wa/authorization.test.ts` «R2: crear usa la empresa del actor…», «R2: consultar, editar, probar, habilitar y regenerar filtran por la empresa del actor»; `guard-ambito-empresa-integraciones`; `int/whatsapp-connection-prisma` (empresa sale del ámbito) |
| R3 | `wa/update-whatsapp-connection.test.ts` (otra empresa, inexistente, borrada); `wa/test-and-enable.test.ts`; `wa/regenerate-verify-token.test.ts`; `int/whatsapp-connection-prisma` (B no lee ni edita la de A) |
| R4 | `ui/whatsapp-page.test.tsx` «R4: sin integraciones.modificar responde notFound…», «R4: sin sesion redirige…», «R4: exige … como primera sentencia»; `ui/integration-pages.test.tsx` R11–R13 |
| R5 | `int/whatsapp-connection-migration` «la tabla tiene company_id obligatorio y RLS activada y forzada», «ida, vuelta e ida…»; `int/whatsapp-connection-prisma` (`relforcerowsecurity`) |
| R6 | `wa/create-whatsapp-connection.test.ts` «R6: con una conexión viva … whatsapp_connection_exists sin llamar a Graph»; `int/whatsapp-connection-prisma` (segunda viva, carrera concurrente, tras borrado); `int/whatsapp-connection-migration` (índice parcial); `catalogo.test.ts` |
| R7 | `int/whatsapp-connection-prisma` (mismo phone en otra empresa: alta y edición; borrado reutilizable; mensaje sin empresa); `int/whatsapp-connection-migration`; `catalogo.test.ts` |
| R8 | `wa/create-whatsapp-connection.test.ts` «R22, R8: prueba buena crea la conexión PENDING, MANUAL…» |
| R9 | `wa/create-whatsapp-connection.test.ts` «R9: cada secreto se cifra con {companyId, recordId = id de la conexión, field}…»; `int/whatsapp-connection-prisma` (columnas `v<n>:`, hash de 64 hex, sin texto en claro) |
| R10 | `wa/connection-view.test.ts` (4 casos); `wa/whatsapp-connection-actions.test.ts` (casos R10 por acción y estado, sin fuga de la fila) |
| R11 | `wa/update-whatsapp-connection.test.ts` «R11: con los dos secretos vacíos conserva…», «R11: con el App Secret vacío y el Phone Number ID cambiado…»; `e2e` paso R11 |
| R12 | `wa/update-whatsapp-connection.test.ts` «R12, R26: un Access Token nuevo…», «R12, R26: un App Secret nuevo…» |
| R13 | `wa/test-and-enable.test.ts` «R13: un secreto ilegible al probar…», «R13: un valor cifrado en el contexto de otra conexión no se descifra», «R13: habilitar con un secreto ilegible…»; `wa/update-whatsapp-connection.test.ts` «R13: si el token guardado no se descifra al editar el teléfono…» |
| R14 | `wa/create-whatsapp-connection.test.ts` «R14: guarda solo el resumen del verify token…»; `wa/random-source-node.test.ts`; `wa/whatsapp-connection-actions.test.ts` «R10, R14…», «R14, R15…» |
| R15 | `wa/regenerate-verify-token.test.ts` (3 casos); `wa/whatsapp-connection-actions.test.ts` «R15 — regenerar…» |
| R16 | `ui/whatsapp-page.test.tsx` «R16: ni el HTML ni las props de la pagina contienen un verify token»; `e2e` paso R16 |
| R17 | `wa/whatsapp-graph-client-fetch.test.ts` (URL, Bearer, timeout, IDs codificados, 2xx/400/502, red caída) |
| R18 | `wa/whatsapp-graph-client-fetch.test.ts`, `wa/whatsapp-config-env.test.ts` (versión ausente o mal formada); `tests/unit/composition/integraciones-graph-doubles.test.ts` «R18, R42…» |
| R19 | `wa/test-and-enable.test.ts` «R28, R19…», «R30, R19…»; `wa/update-whatsapp-connection.test.ts` «R26, R19…» |
| R20 | `wa/graph-failure.test.ts` (6 casos) |
| R21 | `wa/create-whatsapp-connection.test.ts` «R21: la prueba contra Graph se ejecuta antes de persistir…» |
| R22 | `wa/create-whatsapp-connection.test.ts` «R22, R8…»; `e2e` paso R22 |
| R23 | `wa/create-whatsapp-connection.test.ts` «R23: prueba rechazada por Meta no crea ninguna fila…», «R23: Meta inalcanzable…»; `e2e` paso R23 |
| R24 | `wa/create-whatsapp-connection.test.ts` (11 casos de invalid_input, límites 80/1024, IDs libres, ID desconocido = prueba fallida) |
| R25 | `wa/update-whatsapp-connection.test.ts` «R25, R27…», «R25: las reglas de R24 aplican al editar», «R25: el resultado expone la vista sin secretos» |
| R26 | `wa/update-whatsapp-connection.test.ts` «R26: con prueba fallida no se guarda ningún cambio…» y los casos R12/R26, R26/R19 |
| R27 | `wa/update-whatsapp-connection.test.ts` «R25, R27: cambiar solo displayName, App ID y WABA ID…» |
| R28 | `wa/test-and-enable.test.ts` «R28, R19…», «R28: prueba fallida deja ERROR…», «R28: Meta inalcanzable…» |
| R29 | `wa/test-and-enable.test.ts` «R29: deshabilitar deja DISABLED…», «R29: deshabilitar una ya deshabilitada…»; `e2e` paso R29 |
| R30 | `wa/test-and-enable.test.ts` «R30, R19: habilitar una DISABLED…», «R30: habilitar con prueba fallida sigue DISABLED…», «R30: habilitar una que no está DISABLED…»; `e2e` paso R30 |
| R31 | `wa/test-and-enable.test.ts` (probar PENDING/ACTIVE, habilitar); `wa/update-whatsapp-connection.test.ts` (ACTIVE, PENDING, DISABLED se conserva) |
| R32 | `wa/test-and-enable.test.ts` «R32: probar una conexión DISABLED rechaza con action_not_allowed…» |
| R33 | `wa/whatsapp-webhook-url.test.ts` (base fija + id, solo en `routes.ts`, absoluta sin doble barra) |
| R34 | `wa/whatsapp-webhook-url.test.ts` (sin `APP_BASE_URL`: relativa, `complete:false`); `ui/whatsapp-webhook-panel.test.tsx` «R34: sin APP_BASE_URL…», «R34: con la URL completa no hay aviso» |
| R35 | `ui/whatsapp-page.test.tsx` «R35: muestra el titulo y las pestañas…», «R35: las pestañas miden al menos 44 px»; `e2e` «R35: …» |
| R36 | `ui/whatsapp-connection-form.test.tsx` «R36: pinta los seis campos…», «R36: envia…», «R36: precarga…», «R36: al guardar bien…»; `ui/whatsapp-page.test.tsx` «R36: sin conexion…» |
| R37 | `ui/whatsapp-connection-card.test.tsx` (etiquetas D13, `lastError` junto al estado en ERROR); `ui/whatsapp-webhook-panel.test.tsx`; `ui/whatsapp-connection-form.test.tsx` > Actions; `ui/whatsapp-page.test.tsx` «R37: …» |
| R38 | `ui/whatsapp-connection-form.test.tsx` «R38: tras crear…», «R38: Regenerar…»; `ui/whatsapp-webhook-panel.test.tsx` «R38: …»; `e2e` paso R38 |
| R39 | `ui/whatsapp-connection-form.test.tsx` (prueba fallida en alta/edición/habilitar, error de catálogo, inesperado con referencia) |
| R40 | `ui/whatsapp-connection-form.test.tsx` «R40: los campos miden 16 px…», «R40: cada accion tiene talla tactil»; `ui/whatsapp-webhook-panel.test.tsx` «R40: …» |
| R41 | `wa/whatsapp-graph-client-canned.test.ts`; `wa/whatsapp-config-env.test.ts`; `tests/unit/composition/integraciones-graph-doubles.test.ts` (3 casos R41); `guard-dobles-e2e` (fila `INTEGRATIONS_E2E_DOUBLES`); `e2e` paso R41 |
| R42 | `wa/whatsapp-config-env.test.ts` (lectura en cada llamada); `integraciones-graph-doubles.test.ts` «R18, R42…», «R41, R42…»; `wa/whatsapp-webhook-url.test.ts` «R42 — APP_BASE_URL se lee al llamar»; `guard-dobles-e2e` (`.env.example`) |
| R43 | Comprobado a mano: `git diff origin/dev -- package.json pnpm-lock.yaml lib/modules/identity db/seed* private-nav.ts` sale vacío |

## Salida real (implementer, 2026-10-09, HEAD 04ed974d + T12 sin commitear)
```
pnpm run typecheck  ->  > tsc --noEmit            (sin errores)
pnpm run lint       ->  ✖ 7 problems (0 errors, 7 warnings)   (los 7 en tests/unit/documentos y tests/unit/pedidos, ajenos)
pnpm exec vitest run tests/unit/integraciones tests/unit/integraciones-ui tests/unit/composition \
  tests/unit/errores tests/unit/identity/session-once-per-request-actions.test.ts tests/integration/integraciones
                    ->  Test Files  35 passed (35)
                        Tests  686 passed | 1 skipped (687)
pnpm exec vitest run guard
                    ->  Test Files  63 passed (63)
                        Tests  860 passed | 15 skipped (875)
```
E2E (frontend_dev, T12): `pnpm exec playwright test e2e/integraciones-whatsapp.spec.ts e2e/integraciones.spec.ts`
→ `10 passed (2.1m)`: todo `integraciones.spec.ts` (5 Chromium + 5 WebKit). Los 4 de
`integraciones-whatsapp.spec.ts` fallan con `The table (not available) does not exist` (ver «Bloqueo»).

`vitest related` no se usó: a través del catálogo de errores y de la composición arrastra casi toda la
suite. Antes de pararla salió rojo `tests/integration/proveedores/catalog-line.int.test.ts` R32
(`.toMatch() expects to receive a string, but got object`). Es ajeno a la feature, también falla suelto y
no está en `tests/baseline-rojos.json`; no se comprobó si falla en `dev` limpio.

## Bloqueo (paso manual de base)
La base local (`QuimiCloude`, localhost:5432) que usa el E2E no tiene `20261009130000_whatsapp_connections`.
`prisma migrate status` da como última común `20261008150200_delivery_permission` y además muestra tres
migraciones de otras ramas que este worktree no tiene: `20260922160000_inventory_movement_kind_consumption`,
`20260922160100_reservations_and_decimal_stock` y `20261009120000_product_batches_production_date`. Esta
última tiene **el mismo timestamp** que la nuestra. Con esa deriva, aplicar la migración es decisión
humana. Después hay que repetir el comando de E2E de arriba y marcar T12.

## Desviaciones para el reviewer
1. `requirePermission(actor)` recibe un solo argumento, no `(actor, 'integraciones.modificar')`: así
   `actor.ts` es el único sitio del módulo con el código del permiso (§11.3).
2. `errors.ts` suma cinco clases, no cuatro: `UnauthorizedError` y `ActionNotAllowedError` no existían en el
   módulo, aunque sus códigos sí.
3. Archivo extra `domain/connection-secrets.ts`, con los nombres de campo, el contexto, el texto del secreto
   ilegible y `decryptStoredSecret`. Ya está en `module-shape`.
4. `NewWhatsappConnectionRow` y `WhatsappConnectionPatch` (§4.1 los nombra sin definirlos) quedan en el
   puerto: la fila nueva no lleva `companyId`, porque la pone el adaptador desde el ámbito, y el patch es
   todo opcional.
5. **R13 al editar.** Si el token guardado no se descifra al cambiar el teléfono, la conexión queda en
   `ERROR` con el aviso. Sigue el «R13 en detalle» del diseño: un fallo de descifrado no es una prueba
   fallida, así que no aplica D10. **Ojo:** R13 en `requirements.md` solo habla de «probar o habilitar», y
   la fila de `update` del diseño cita R13. Es una ambigüedad, y el reviewer o el humano confirma si editar
   debe escribir `ERROR` o no escribir nada. Al habilitar, una conexión `DISABLED` sigue `DISABLED`.
   **Resuelta por decisión humana (2026-10-09):** al editar se sigue D10 y no se guarda nada; el error se
   relanza (`readStoredSecret`, sin escritura). `ERROR` + `lastError` queda solo para probar. Diseño
   actualizado y test de `update` reescrito para afirmar que no hay escritura.
6. Al editar sin App Secret nuevo, el guardado no se descifra (R11), así que el saneado del mensaje de Meta
   no puede tachar ese App Secret.
7. Un id sin forma de uuid da `whatsapp_connection_not_found` sin llegar al puerto, igual que `isCustomerId`.
   Los secretos se guardan recortados (`trim`).
8. Persistencia: la violación de unicidad se reconoce por el nombre del índice **o** por las columnas
   exactas, porque Prisma a veces da las columnas. No se registró qué forma devolvió.
9. `aislamiento.json` y `MIGRACIONES_ESPERADAS` no estaban en §11.3: son altas mecánicas. El `.int` de
   persistencia es de tipo `commit`, porque la carrera de R6 necesita inserciones concurrentes reales.
10. `session-once-per-request-actions.test.ts`: tasks.md T9 decía «sigue verde sin tocarlo», y §6 que la
    acción «entra sola en su barrido». No es así: el test exige una fila en `ACCIONES` para todo archivo que
    llama a `getSessionUser` y `getSessionContext`, y su mensaje dice «Añade su fila». Se añadió una fila al
    final, sin tocar producción. Ocultar las llamadas habría sido esquivar la guardia.
11. `encryption-keys-env.test.ts` fijaba la fachada en dos miembros; se tensó a nueve (§11.3 no lo listaba).
12. `playwright.config.ts` recibió `INTEGRATIONS_E2E_DOUBLES` ya en T8, porque la guardia parametrizada lo
    exige. El resto, en T12.
13. Pantalla:
    - El verify token tras el alta vive en un contexto cliente, `WhatsappVerifyTokenProvider`, montado en las
      pestañas, para que sobreviva al refresco que cambia el formulario por la tarjeta. Se pierde al recargar
      (R16).
    - La tarjeta es `'use client'`, porque la hora local necesita la zona del navegador
      (`useSyncExternalStore`).
    - Una prueba buena no muestra texto de éxito, porque el spec no lo da.
    - El formulario no pone `maxLength`: la validación la hace el servidor.
14. **Textos de UI que el spec no da**, escritos por frontend_dev; el humano los confirma o los cambia:
    - diálogos de deshabilitar y de regenerar (título, cuerpo, «Cancelar», confirmar);
    - «Dónde sacar cada dato en Meta»;
    - etiquetas de la tarjeta «Número», «Nombre verificado», «Estado», «Última verificación»;
    - «URL del webhook», «Verify token», «Guardando…»;
    - nombres accesibles «Copiar la URL del webhook» y «Copiar el verify token».
15. `.env.example` lleva `INTEGRATIONS_E2E_DOUBLES=""` y no `=`. El patrón de `guard-dobles-e2e` (`\s*`)
    cruza líneas y lee como activación una variable vacía seguida de más código (deuda M2 de QC-234). El
    arreglo de fondo es `[ \t]*` en la guardia, que no se tocó.

## Avisos de despliegue (T13, design §10, D15)
- `WHATSAPP_GRAPH_API_VERSION`, `INTEGRATIONS_ENCRYPTION_KEYS` e `INTEGRATIONS_ENCRYPTION_ACTIVE` deben existir
  en Vercel antes de desplegar.
- `APP_BASE_URL` se fija por entorno, para que una preview no apunte a producción.

## Choque conocido con QC-224 (para F2.3)
Todos los cambios en `db/schema.prisma`, `lib/composition/index.ts`, `error-codes.ts`, `error-catalog.ts`,
`catalogo.test.ts` y `guard-identificador-de-request.test.ts` son bloques o entradas al final. La única
excepción es `composition/index.ts`: se quitó la línea `export const integraciones = …` de su sitio y se
redeclaró al final. Si QC-224 crea una migración, hay que cuidar su orden con
`20261009130000_whatsapp_connections`.

## Cambios del 2026-10-09 (decisión humana)
- Migración renombrada a `20261009130000_whatsapp_connections` (chocaba por timestamp con
  `20261009120000_product_batches_production_date` de QC-219 y con el rango de QC-224). No se aplicó a
  ninguna base a mano.
- D10 al editar con secreto ilegible: ver desviación 5.

## E2E (leader, 2026-10-09, HEAD 54790b3f)
- Con el OK del humano, `pnpm run db:migrate` (`prisma migrate deploy`) aplicó `20261009130000_whatsapp_connections`
  a la base local compartida «QuimiCloude». Solo esa migración; las tres de otras ramas ya aplicadas no se tocan.
- `pnpm exec playwright test e2e/integraciones-whatsapp.spec.ts e2e/integraciones.spec.ts` → `14 passed (2.4m)`.
  T12 queda cerrada (review B1).
- Textos de UI fuera del spec (review, sección «textos a confirmar»): el humano los aprueba tal cual el 2026-10-09.
