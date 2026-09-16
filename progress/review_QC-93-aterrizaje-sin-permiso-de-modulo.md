# QC-93 — aterrizaje-sin-permiso-de-modulo · review (F2.2)

> Reviewer. Worktree `.worktrees/QC-93-aterrizaje-sin-permiso-de-modulo`, rama
> `feature/QC-93-aterrizaje-sin-permiso-de-modulo`, commit revisado `ee4811f`, comparado contra
> `origin/dev` (merge `0d8f05d` ya dentro). Fecha: 2026-09-15.
>
> Leido: `specs/QC-93-.../{requirements.md (R1-R28), design.md, tasks.md}`, la bitacora
> `progress/impl_QC-93-...md`, los logs `progress/e2e_QC-93_*.log`, `CHECKPOINTS.md` y
> `docs/verification.md`. Contexto aceptado sin reabrir: la enmienda del 2026-09-15 (`77c9016`,
> R25-R28, R11 enmendado) y R19 como decision cerrada.

## Veredicto

**OK (APROBADO)** — 0 bloqueantes, 6 menores. Condicionado a lo que no es de este rol: T11
(`./init.sh` completo, leader) y escribir en el PR las corridas y la clasificacion de rojos
(R23/R24 piden «en el PR»).

## 1. Lo que ejecute yo (no copiado de la bitacora)

Todo sobre `ee4811f`, en el worktree y contra la base `QuimiCloude_QC93` de su `.env`. Salidas en el
scratchpad de la sesion del reviewer.

| # | Comando / accion | Resultado |
|---|---|---|
| E1 | `pnpm run typecheck` | `EXIT=0` |
| E2 | `pnpm run lint` | `EXIT=0` |
| E3 | `vitest run` de `tests/guards/guard-e2e-landing.test.ts` y `tests/unit/e2e-helpers/landing.test.ts` | 2 archivos, **24 passed** (16 guardia + 8 helper) |
| E4 | Mutacion M1 sobre un spec real: `e2e/pedidos-responsables.spec.ts` (QC-102) vuelve al login en linea con `waitForURL(... === DASHBOARD_ROUTE)` tras `login-submit`. Mutacion M2 simultanea: `const login = async (page) => ...` en `e2e/inventario.spec.ts`. Backup con `cp` | guardia **EXIT=1**, `1 failed / 15 passed`. Nombra `e2e/inventario.spec.ts:101` (define su propia funcion login) y `e2e/pedidos-responsables.spec.ts:537` (waitForURL espera la constante DASHBOARD_ROUTE tras el login-submit de la linea 536). Restaurado con `cp` |
| E5 | Mutacion M3 (intento de evasion) en `e2e/errores.spec.ts`: `const landing = landingRouteForPermissions(['inventario.consultar'])` + login en linea + `waitForURL(... === landing)` | guardia **EXIT=0 (verde)**: ver hallazgo m1. Restaurado con `cp` |
| E6 | Guardia tras restaurar + `git status --porcelain` + `git diff --stat` | `16 passed`; status y diff **vacios** |
| E7 | `git diff --stat origin/dev...HEAD -- app lib db scripts components package.json pnpm-lock.yaml` | **vacio**. `permissions.ts:165` = `[ROLE_OPERADOR]: ['inventario.consultar', 'asignaciones.consultar']` |
| E8 | `git diff --stat origin/dev...HEAD` de `session.spec.ts`, `permisos.spec.ts`, `theme.spec.ts`, `login-skin.spec.ts` y `playwright.config.ts` | **vacio** |
| E9 | Sonda de base (solo lectura) ANTES: roles, usuarios y empresas `qc22_e2e_*` y `qc7_e2e_*` | todo 0; seed `Administrador` (15 permisos) y `Operador` (2: `asignaciones.consultar`, `inventario.consultar`); `role_permissions` = 17 |
| E10 | **Siembra de un huerfano para R28**: empresa `qc22_e2e_revorphanco_de1f1d7c78` y rol `qc22_e2e_rol_revorphan_de1f1d7c78` con `createdAt` de hace 2 h, y un usuario `qc22_e2e_revorphanuser_...` **reciente** colgado de ese rol y esa empresa | sembrado: 1 rol (0 permisos, 1 usuario), 1 usuario, 1 empresa |
| E11 | `playwright test` sobre `inventario`, `login`, `pedidos`, `proveedores` y `recetas`, filtrado con `-g` a los casos «sin X.consultar» y «sin ningun permiso de modulo`, `--workers=3`, chromium + webkit | **10 passed / 0 failed (1.9 min)**: `inventario:606` (R4), `pedidos:440` (R49), `proveedores:455` (R52), `recetas:369` (R6) y `login:386` (QC-93 R14-R18), cada uno en los dos motores |
| E12 | Sonda de base DESPUES | roles, usuarios y empresas `qc22_e2e_*` = **0** (el huerfano de E10 incluido, con su usuario reciente); `qc7_e2e_*` = 0; seed intacto; `role_permissions` = **17**; Operador con sus dos permisos |
| E13 | Conjuntos `R<n>` declarados en `requirements.md` frente a filas del mapa de la bitacora, comparados a maquina. `scripts/check-trazabilidad.mjs` NO cubre QC-93: en el `feature_list.json` del worktree esta `spec_ready` y el script solo mira `in_progress`/`done` | declarados `R1..R28` = mapeados `R1..R28`: **iguales** |
| E14 | Lineas citadas por el mapa: `landing.test.ts:31,35,39,43,47,66,86,93`; guardia `:394,:539,:555,:569`; `login.spec.ts:365,:386`; `inventario.spec.ts:326,:342,:360,:371,:400,:614`; `landing.ts:72` | todas existen y son lo que el mapa dice |
| E15 | Los 21 testids de `MODULE_DATA_TESTIDS` (sonda R18) mas `private-not-found`, `private-nav` y `private-logout`, buscados como literal en `app/`, `components/` y `lib/` | **todos existen** en produccion: la cuenta cero no es vacua por un testid inventado |

No corri `./init.sh` ni la suite E2E completa (instruccion del leader; regla del gate).

## 2. Trazabilidad, requisito a requisito (R1-R28)

Una fila por requisito. «Verificado» = lo comprobe leyendo el test **y** ejecutandolo, o con la
prueba citada.

| R | Test / evidencia | Lo verifica de verdad? | Estado |
|---|---|---|---|
| R1 | El helper `landing.ts` en la carpeta e2e/helpers (unico, identificadores en ingles); guardia `:539` (el recorrido no recoge el helper y el helper existe); T3 `playwright --list` 78 a 78 | Si. `testDir: 'e2e'` sin `testMatch` propio: el helper no casa `*.spec.ts`; E11 lista 10 tests, ninguno del helper. Definiciones locales de `login` en `e2e/`: 0 fuera del helper | Verificado |
| R2 | `landing.test.ts:31` (Admin a dashboard), `:35` (Operador a inventario), `:47` (igual a la composicion de produccion para cada rol del catalogo) | Si. `landingRouteForPermissions` es literalmente `firstVisibleNavHref(filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, p)) ?? DASHBOARD_ROUTE`, la misma expresion de `login-action.ts:122-126` (leida). Sin lista propia ni orden copiado | Verificado (E3) |
| R3 | `landing.test.ts:39` (lista vacia), `:43` (permiso que no abre item); contra base real `login.spec.ts:386` (premisa `permissionsForUsername === []`) | Si | Verificado (E3, E11) |
| R4 | `landing.test.ts:66` (forma de la consulta: `username` + `deletedAt: null`), `:93`; contra base real, cada `loginAndLand` de E11 | Si en lo que importa: `loginAndLand(page, credentials)` solo recibe usuario/contrasena y lee usuario, rol y permisos con Prisma; ninguna de las 14 suites pasa permisos, rol ni ruta. **Salvedad m1**: el helper exporta ademas `landingRouteForPermissions(lista)`, que la guardia trata como destino derivado | Verificado, con menor m1 |
| R5 | `landing.test.ts:86`: rechaza nombrando el username y `expectedLandingRoute` tambien rechaza | Si (con Prisma mockeado; el `throw` esta antes de cualquier `return`) | Verificado (E3) |
| R6 | `landing.ts:72-82` (goto, `login-username`/`login-password`/`login-submit`, `waitForURL(destino)`, `return destination`); usado por las 14 suites; los cuatro casos consumen el valor devuelto | Si. E11 ejercita la entrada real en 5 suites y 2 motores | Verificado (E11) |
| R7 | Firma `loginAndLand(page, credentials)` sin parametro de aterrizaje; guardia `:394` muerde ante un parametro `landing` | Si. Las cuatro suites que pasaban `landing` (`usuarios`, `unidades`, `presentaciones`, `grupos-de-trabajo`) ya no lo hacen (diff leido) | Verificado |
| R8 | Guardia `:569` sobre el arbol real | Si. Lei el diff de las 14 suites (las 13 del censo + `pedidos-responsables.spec.ts` de QC-102): todas importan `loginAndLand` del helper y borraron su `login()`. Solo `login-skin`, `permisos`, `session` y `theme` no lo importan (fuera por diseno) | Verificado (E3, E6) |
| R9 | `tests/guards/guard-e2e-landing.test.ts` (autoprueba `:335-532` + arbol real `:538-589`); `test:guardias` = `vitest run guard` la recoge por nombre | Si: **muerde** sobre specs reales (E4, dos reglas, archivo y linea nombrados) y vuelve a verde tras restaurar (E6). Limite: m1 | Verificado (E4-E6) |
| R10 | Guardia `:555` (excepciones con motivo y archivo existente); diff vacio de `session.spec.ts` y `permisos.spec.ts` | Si | Verificado (E8) |
| R11 | `inventario.spec.ts:606` (usuario de R25), `pedidos.spec.ts:440`, `proveedores.spec.ts:455`, `recetas.spec.ts:369` (Operador): `const landing = await loginAndLand(...)` + `expect(landing).not.toBe(RUTA_DEL_MODULO)` | Si. Ningun destino escrito a mano | Verificado (E11, 8 ejecuciones verdes) |
| R12 | Los mismos cuatro: `response.status() === 404`, `pathname === RUTA` (sin redireccion), `private-not-found` visible | Si. El `goto` es a la ruta del modulo con sesion valida; los tres asertos estan en los cuatro | Verificado (E11) |
| R13 | Los mismos cuatro, cuentas cero. Inventario: `inventario-title`, `data-table`, `product-list-empty`. Pedidos: `pedidos-title`, `order-list`, `data-table`, `order-list-empty`, `order-list-error`. Proveedores: `proveedores-title`, `supplier-table`, `supplier-row`, `supplier-list`, `supplier-list-empty`. Recetas: `recipes-title`, `recipe-table`, `recipe-list-empty`. Titulos con `(R4)`, `(R49)`, `(R52)`, `(R6)` | Si. Cuentas conservadas del caso original (diff); corren despues de `private-not-found` visible, asi que la pagina ya pinto; testids reales (E15). Inventario: usuario en la misma empresa del catalogo (`inventario.spec.ts:371`) | Verificado (E11, E15) |
| R14 | `login.spec.ts:386`, unico caso nuevo (diff: un solo `test(` anadido) | Si | Verificado |
| R15 | `login.spec.ts:386`: premisa `permissionsForUsername === []`, `landing = loginAndLand(...)`, `pathname === landing` | Si: el destino es el derivado; que sea el respaldo lo fija R3 (`landing.test.ts:39`) y la premisa de permisos vacios | Verificado (E11) |
| R16 | `login.spec.ts:386` paso 2: `private-not-found` visible, `private-nav` adjunto, `private-logout` visible | Si | Verificado (E11) |
| R17 | `login.spec.ts:386` paso 4: logout por teclado lleva a `/login`; `goBack()` sigue en `/login`; cuentas cero de `private-not-found`/`private-nav`/`private-logout` | Si: si el navegador restaurara la pagina privada, `goBack` terminaria en `/dashboard` y el `waitForURL` fallaria | Verificado (E11) |
| R18 | `login.spec.ts:386` paso 3: `toHaveCount(0)` para los 21 `MODULE_DATA_TESTIDS` de los siete modulos | Si, y **no vacua**: los 21 testids existen en produccion (E15). Alcance: la sonda mira la pantalla de aterrizaje, no visita cada modulo (menor m3). Resultado: ni un dato visible, **sin agujero de permisos** | Verificado (E11, E15) |
| R19 | Auditoria T10/T15; `permissions.ts:165` sin cambios | Si | Verificado (E7, E9, E12) |
| R20 | `login-action.ts`, `private-nav.ts`, `app/(private)/not-found.tsx` sin cambios | Si | Verificado (E7) |
| R21 | Diff vacio en `app lib db scripts package.json pnpm-lock.yaml` | Si. Nota: el diff incluye `tests/unit/e2e-helpers/landing.test.ts`, que la ultima frase de R21 no lista pero T4 aprueba (menor m5) | Verificado (E7) |
| R22 | `package.json` y lockfile sin cambios; imports del helper: `@playwright/test` (solo tipo), `@/lib/shared/db/prisma`, `@/lib/shared/navigation/private-nav`, `@/lib/shared/routes` | Si | Verificado (E7, lectura) |
| R23 | `progress/e2e_QC-93_antes.log` (**27 failed / 51 passed**, 78) y `progress/e2e_QC-93_despues_T16.log` (**21 failed / 59 passed**, 80), completas, dos motores, base copiada de plantilla | Totales confirmados en los logs. **No volvi a correr la suite completa** (instruccion del leader); falta llevarlo al PR (leader) | Verificado en logs; PR pendiente |
| R24 | Tabla de rojos de T16 en la bitacora | Revise las 21 lineas rojas del log T16 y las trazas de los rojos atribuidos a QC-23 (seccion 3). Ninguno es de aterrizaje ni un agujero de permisos | Verificado en logs; PR pendiente |
| R25 | `inventario.spec.ts:606` entra con `noInventoryUser` del rol `qc22_e2e_rol_<RUN_ID>` (`:360`); `ROLE_OPERADOR`/`operatorUser` en el archivo: 0 | Si | Verificado (E11) |
| R26 | `inventario.spec.ts:611-614`, premisa de la base antes de `loginAndLand`; prueba de que muerde en `progress/e2e_QC-93_T14_mutacion_R26.log` | Si. El log muestra la mutacion aplicada (1), `2 failed` en `:614` en los dos motores y la restauracion con `cp`. No la repeti: su mecanismo (`not.toContain` sobre lo leido de la base) es directo | Verificado (lectura + log) |
| R27 | `role.create` sin `permissions` tras la empresa (`:360`), usuario en la misma empresa (`:371`), `afterAll` borra el rol por nombre exacto despues de los usuarios y antes de la empresa (`:400`) | Si: tras E11, 0 roles/usuarios/empresas `qc22_e2e_*`, seed intacto y `role_permissions` = 17 (E12) | Verificado (E9-E12) |
| R28 | Barrido del `beforeAll` (`:326-345`): roles viejos del prefijo, luego usuarios del prefijo viejos **o** de esos roles, luego roles, luego empresas | Si, **probado con un huerfano real** (E10): rol y empresa de hace 2 h con un usuario reciente. El barrido se llevo los tres sin romper la FK `users.role_id` (E11 verde, E12 a cero) | Verificado (E10-E12) |

28 filas, 28 requisitos. Ninguno sin test ni con test vacio.

## 3. Clasificacion de los 21 rojos de T16

Recorri las 21 lineas rojas de `progress/e2e_QC-93_despues_T16.log` contra la tabla de la bitacora:
cuadran 10 + 2 + 2 + 2 + 1 + 4 = 21.

- **B, QC-80 (10):** `inventario:426/494/550`, `proveedores:360` y `presentaciones:280`, en los dos motores. En todos, `presentation-create` o `presentation-sheet` con `toHaveCount(0)` recibe 1 durante 60 s (lineas 252-273 y 306-328 del log). Son altas de Administrador: no hay aterrizaje ni permisos en juego.
- **C, `errores:197` (2):** agota `waitForURL` en `landing.ts:79` con un Administrador. La causa (usuario `pending`) viene de T1, que ya lo tenia rojo con su propio `login()`. No es aterrizaje.
- **D, `permisos:201` (2):** `private-user-trigger` no existe (lineas 227-244 del log). Archivo fuera por R10 y sin diff.
- **F, `usuarios:305` (2):** FK en `company.deleteMany` del `finally` (lineas 413-429 del log). Es limpieza.
- **E, `session:241` webkit (1):** FK en la limpieza. Archivo sin diff.
- **Carrera de QC-23 (4, solo chromium):**
  - `presentaciones:338` y `proveedores:455` (R52): la traza de Playwright muestra `navigated to /dashboard` y despues `/login?sesion=fin` dentro de `loginAndLand` (lineas 279-298 y 334-353 del log). Para un Operador, `/dashboard` es justo el respaldo al que cae `login-action.ts:122-126` cuando `getSessionUser()` devuelve null; el dashboard lo expulsa luego con `sesion=fin`. La sesion nacio muerta: no es un aterrizaje distinto ni una fuga de datos.
  - Mecanismo confirmado en codigo: `isStampedOut` compara `issuedAt <= sessionsValidFrom` (`session-revocation.ts:61-66`); `iat` viaja en segundos (`session-token.ts:229`); `sessionsValidFrom` es `@default(now())` con microsegundos (`schema.prisma:221`); ningun E2E lo fija (0 apariciones en `e2e/`).
  - Indicio adicional (inferencia mia, no prueba): en el log los dos rojos van justo detras de un rojo B del mismo archivo (indices 23 y 24; 25 y 26). Playwright rearranca el worker tras un fallo, el `beforeAll` crea usuarios nuevos y el caso entra en el mismo segundo. Encaja con que sea intermitente y solo en chromium.
  - `session:241/289` chromium: `inventario-title` no aparece justo tras aterrizar (lineas 359-407 del log). Firma compatible, con menos evidencia (sin traza de URLs).
  - Contraprueba mia: en E11, `proveedores:455` pasa en los dos motores, igual que en T12.
- **Aterrizaje: 0. Agujero de permisos (R18): 0.** Ningun rojo muestra datos de un modulo a quien no tiene el permiso; todos los casos sin permiso que llegan a la pagina ven 404.

La clasificacion se sostiene.

## 4. Checklist

### Especificacion
- [x] `requirements.md` con EARS numerados R1-R28.
- [x] `design.md` con alternativas descartadas y su porque (secciones 6 a-d y 9.5 a-e).
- [ ] **Todas las tasks marcadas**: todas salvo **T11** (gate completo), que la enmienda asigna al leader despues de T14. Esperado; ver m2.

### Trazabilidad
- [x] Cada R1-R28 mapea a un test concreto que lo verifica (seccion 2; conjuntos iguales, E13).
- [x] La bitacora contiene el mapa `R<n> -> test`.

### Calidad de codigo
- [x] `pnpm run typecheck` (E1).
- [x] `pnpm run lint` (E2).
- [~] `pnpm test`: no corri la suite entera (regla del gate); si los dos archivos nuevos (E3). Lo cierra el leader con `./init.sh`.
- [x] Flujo critico (autenticacion/permisos) con E2E: la feature ES E2E; cinco casos verificados en dos motores (E11).
- [n/a] UI multiplataforma: no toca UI (diff vacio en `app/`, `components/`).
- [n/a] Dependencias nuevas: ninguna (E7).

### Datos y seguridad
- [n/a] Tablas o modelos nuevos: ninguno (diff vacio en `db/`).
- [n/a] Permisos nuevos en service: ninguno. La feature solo **comprueba** los existentes, y la sonda R18 no encontro fuga.
- [n/a] RLS, migraciones, webhooks: no aplica.
- [x] Sin secretos hardcodeados. Las contrasenas de fixtures son efimeras y derivadas del `RUN_ID`, como en el resto de `e2e/`. El `.env` del worktree esta en `.gitignore`.
- [x] Acceso a datos por Prisma, sin cliente de Supabase.

### Modulos hexagonales
- [x] Sin cambios en `lib/`. El helper importa `lib/shared` y el test unitario el contrato `@/lib/modules/identity` (barrel), no rutas profundas de otro modulo.

### Permisos
- [x] Sin cambios; los 404 se siguen decidiendo en servidor (E11).

### Configuracion
- [x] Nada dependiente de entorno escrito a mano; puerto y base vienen de config y `.env`.

### Verificacion final (fuera de este rol)
- [ ] `./init.sh` verde: pendiente del leader (T11).
- [x] `progress/review_<feature>.md` con veredicto OK: este archivo.
- [ ] Entrada en `progress/history.md`: leader.
- [ ] Worktree desmontado o anotado: leader.

## 5. Hallazgos

**Bloqueantes: 0.**

**m1 (menor): la guardia acepta como destino derivado una lista de permisos escrita a mano.**
- El helper `landing.ts` exporta `landingRouteForPermissions(permissions)`, y la guardia lo incluye en `DERIVACIONES` (`guard-e2e-landing.test.ts:103`).
- Probado en E5: `const landing = landingRouteForPermissions(['inventario.consultar'])`, mas un login en linea y `waitForURL(... === landing)` en `errores.spec.ts`, deja la guardia **verde**.
- Es la puerta que R4 quiere cerrada: «NO DEBE aceptar una lista de permisos ... escrito en el archivo de test».
- No bloquea, por tres motivos: `design.md` (seccion 2) aprobo esa exportacion, ningun spec la usa hoy (0 en `e2e/`) y la cabecera de la guardia declara su limite de forma.
- Arreglo barato: quitar `landingRouteForPermissions` de `DERIVACIONES` y, opcionalmente, anadir una regla que prohiba importarlo desde un spec. Se puede hacer en esta ficha o dejarlo como deuda anotada.

**m2 (menor, proceso): T11 sin marcar.** Es lo esperado segun la enmienda: el gate completo lo corre el leader. La feature no puede pasar a `done` hasta que T11 este marcada con `./init.sh` verde y la guardia nueva en la salida.

**m3 (menor): la sonda R18 solo mira la pantalla de aterrizaje.**
- `login.spec.ts:386` pide cuenta cero de los 21 testids sobre el 404 de `/dashboard`; ese usuario no visita `/inventario`, `/pedidos`, etc.
- Cumple la letra de R18 y de `design.md` (seccion 5), y los 404 por modulo ya los cubren los cuatro casos mas `unidades:445`, `usuarios:416` y `presentaciones:338` (con el Operador).
- Pero el unico usuario **sin ningun permiso** no recorre los modulos. Una sonda mas fuerte seria un bucle de `goto` + 404 + cuenta cero por ruta. No se pide.

**m4 (menor): texto obsoleto en `inventario.spec.ts`, lineas 176-180.** El mensaje de error de `createUserWithRole` sigue diciendo que el E2E no crea el rol porque la regla ruta-rol compara por nombre exacto. Desde QC-93 el spec **si** crea un rol, y esa regla ya no existe. La bitacora ya lo anota. Solo se ve si falta un rol, pero engana a quien lo lea.

**m5 (menor, spec): R21 lista menos archivos de los que toca la feature.** Su ultima frase («Lo unico que se toca es e2e y la guardia de R9») no incluye `tests/unit/e2e-helpers/landing.test.ts`, que T4 exige y T10 espera. No es una violacion, porque la lista prohibida de R21 esta vacia. Conviene alinear el texto si se vuelve a tocar el spec.

**m6 (menor): `establecer-contrasena.spec.ts` baja su espera de aterrizaje de 120 s a los 60 s del helper.** Hay riesgo de timeout bajo carga, y el subagente ya lo anoto. Paso en T12 y T16. Si esa suite da un rojo por plazo, esta es la primera sospecha (QC-58).

## 6. Para el leader (no son hallazgos de esta ficha)

- **PR.** R23 y R24 exigen escribir en el PR T1 (27/51), T12 (20/60) y T16 (21/59), la diferencia y la tabla de 21 rojos con su causa y destino.
- **Fichas que propone la bitacora, y que suscribo:**
  - QC-80 en los E2E (10);
  - `errores.spec.ts` con `accountStatus: 'active'` (2);
  - `permisos.spec.ts` al boton directo `private-logout` (2);
  - limpieza de `usuarios.spec.ts` (2) y de `session.spec.ts` (1).
- **Carrera de QC-23: merece ficha propia con prioridad.**
  - No es solo de fixtures: cualquier cuenta con fraccion de segundo en `sessions_valid_from` que abra sesion en ese mismo segundo recibe una sesion nacida revocada (`iat` truncado menor o igual que un sello con milisegundos).
  - En E2E tumba casos al azar.
  - Candidatos: que `sessions_valid_from` nazca truncado al segundo, como ya lo escribe `floorToSecond` al cambiar la cuenta, o fijarlo en los fixtures.
- **Receta de base limpia desfasada.** `specs/QC-77-.../design.md` (seccion 3) esta desfasado, segun la seccion 0.1.2 de la bitacora.
