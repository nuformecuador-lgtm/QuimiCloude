# QC-222 — menu-de-integraciones · bitácora de implementación

Implementer, 2026-10-08. Worktree `.worktrees/QC-222-menu-de-integraciones`.

## Estado (2026-10-08, tras la enmienda E4): T0–T11 hechos

Enmienda E4 (`design.md > 14`, commit `322cb79a`, aprobada por el humano): T11 da de alta
`'integraciones.spec.ts'` en `E2E_ESPERADOS` y T9 se cierra con el gate local aprobado (guardias + tests
relacionados por separado; `gate-completo` de CI es el gate final). Detalle y salida en
`## T11 + T9 — gate local aprobado` al final. Los dos bloqueos de abajo quedan resueltos así:
el 1 con T11 y el 2 con el gate local aprobado, porque los 3 rojos son del baseline.

### Histórico: estado tras la enmienda E1–E3 (T9 entonces bloqueado)

La enmienda (`design.md > 14`, commit `a27396d4`) resolvió los 7 rojos de la tabla de abajo. Se hicieron en
T10 (commit `1bb7fc85`). T9 queda abierto por dos cosas:

1. **Un rojo nuevo, fuera de spec y fuera del baseline.** Es
   `tests/guards/guard-identificador-de-request.test.ts:893`, en el caso «no hay ningun archivo nuevo en e2e/ y existe
   el test que lo sustituye (R21)». `E2E_ESPERADOS` es una lista cerrada de specs de `e2e/` y no incluye
   `integraciones.spec.ts`. El arreglo es mecánico: darlo de alta con su comentario, como las otras entradas
   («su punto de extension por diseno es darse de alta en ella»). Pero el archivo no está en
   `tasks.md > Archivos esperados`, así que **no se ha tocado**: decide el leader/humano.
2. **`./init.sh` sale rojo en `test:rapido` solo por los 3 rojos del baseline.** Son `recetas/scope.test.ts`,
   `recetas/module-contract.test.ts` y `navegacion/pantallas-exigen-permiso.test.tsx`. `scripts/test-rapido.mjs:83`
   los pasa como `--exclude`, pero `vitest related` los corrió igual y fallaron. Ningún otro test del diff
   está rojo. Es un fallo del arnés, no de QC-222. init.sh se detuvo ahí y no llegó a la fase de guardias.

### Tabla histórica: los rojos que bloquearon T0 (ya resueltos en T10)

| # | Test | Por qué se pone rojo | Arreglo posible (tensar) |
|---|---|---|---|
| 1 | `tests/unit/app-sidebar.test.tsx:229-242` «renderiza una entrada por cada item de PRIVATE_NAV_ITEMS y en su orden» | orden del DOM escrito a mano | añadir `'nav-integraciones'` tras `'nav-unidades'` |
| 2 | `tests/unit/navegacion/private-layout-menu.test.tsx:343-360` «ancla: el menu real tiene los diez items…» | lista exacta de 10 `testId` | 11, con entrada nueva en su mapa |
| 3 | `tests/guards/guard-nav-permisos-declarados.test.ts:112-124` «ancla: el recorrido encuentra hoy los diez enlaces reales del menu» | ancla de 10 enlaces; ahora 13. **§7.2 dice que esta guardia no se pone roja** | `toHaveLength(13)` + los tres `nav-integraciones-*` |
| 4 | `tests/unit/configuracion-ui/private-nav-unidades.test.ts:79,92` «…exactamente DOS items» | Configuración tiene 3 | 3 y renombrar |
| 5 | `tests/guards/guard-pantallas-exigen-permiso.test.ts` «el barrido encuentra exactamente las veintiuna pantallas privadas de hoy» | `RUTAS_ESPERADAS_HOY` fija 21; hay 24. **§5/§7.2 la dan por verde** | añadir las tres rutas a la lista exacta (no es excepción) |
| 6 | `tests/unit/inventario/scope.test.ts` «la pantalla del catalogo vive solo donde la declara QC-22…» | falso positivo: el detector casa `/product\|inventario/i` en la ruta y ve `(private)/integraciones/inventarios/page.tsx` | decidir: excluir `app/(private)/integraciones/` o afinar el detector |
| 7 | `tests/unit/proveedores/scope.test.ts` «la pantalla de proveedores vive solo donde la declara QC-44…» | ídem con `(private)/integraciones/proveedor-ia/page.tsx` | ídem |

Además: **desviación de §8 en la E2E** (ver T8). Y `e2e/permisos.spec.ts:258-263` usa todavía
`private-user-trigger`, que ya no existe: probablemente está rojo en `dev` (no corrido, fuera de alcance).

## T0 — sincronización

- `git fetch origin dev && git merge origin/dev` → merge `cb1a4407`, sin conflictos. Trae QC-221.
- Migración nueva de QC-221: `prisma migrate status` → «Database schema is up to date!» (ya aplicada a la
  base local compartida).
- `./init.sh` tras el merge: `== init OK ==` (exit 0; guardias 56 archivos, 744 passed | 11 skipped).
- Líneas re-medidas (coinciden con design §0):
  - hallazgo 8: `integration-routes.test.ts:138-151` (R14), `:154-186` (bloque R15);
    `module-shape.test.ts:196-215` (R9).
  - hallazgo 10 / §7.2: `app-sidebar.test.tsx:560-572`; `private-nav-clientes.test.ts:89-91`;
    `private-nav-configuracion.test.ts:76`; `private-nav-usuarios.test.ts:102` y `:104-111`.

## Archivos tocados

- M `lib/shared/navigation/private-nav.ts` (4 `*_LABEL`, `'puzzle'`, grupo al final)
- M `lib/shared/navigation/nav-icons.ts` (`puzzle: Puzzle`)
- M `lib/shared/routes.ts` (tres constantes al final de `PRIVATE_ROUTE_PREFIXES`; borrado el comentario de QC-221)
- A `app/(private)/integraciones/components/integration-placeholder.tsx`
- A `app/(private)/integraciones/components/index.ts`
- A `app/(private)/integraciones/{proveedor-ia,inventarios,whatsapp}/page.tsx`
- A `tests/unit/integraciones-ui/private-nav-integraciones.test.ts`
- A `tests/unit/integraciones-ui/integration-pages.test.tsx`
- M `tests/unit/integraciones/integration-routes.test.ts` (§7.3; sin `AVISO_DE_ENMIENDA`)
- M `tests/unit/integraciones/module-shape.test.ts` (§7.3; R9 → R17 + anticegado)
- M `tests/unit/app-sidebar.test.tsx` (:560-573, 11 items)
- M `tests/unit/clientes-ui/private-nav-clientes.test.ts` (:89, penúltimo + último el grupo)
- M `tests/unit/configuracion-ui/private-nav-configuracion.test.ts` (:76, 3 items)
- M `tests/unit/configuracion-ui/private-nav-usuarios.test.ts` (3 items en orden; casos renombrados)
- A `e2e/integraciones.spec.ts`
- T10: `guard-nav-permisos-declarados`, `guard-pantallas-exigen-permiso`, `private-layout-menu`,
  `private-nav-unidades`, `inventario/scope`, `proveedores/scope` (ver `## T10`)
- M `tests/guards/guard-identificador-de-request.test.ts` (T11: +10 líneas, solo la entrada
  `'integraciones.spec.ts'` y su comentario, entre `grupos-de-trabajo` e `inventario`; sin excepción,
  `hallazgosDeE2e` intacto)
- Fuera de código: `specs/QC-222-menu-de-integraciones/tasks.md` (checks), esta bitácora.

No tocados: `components/private/app-sidebar.tsx`, `components/ui/**`, `lib/modules/**`,
`lib/composition/**`, `db/**`, `middleware.ts`, `route-guard-middleware.ts`, `package.json` (R7, R22).

## Mapa R<n> -> test

| R | Test |
|---|---|
| R1 | `private-nav-integraciones.test.ts` «R1: hay exactamente un NavGroup…», «R1: sus hijos son exactamente tres NavLink…», «R1: ningun otro item del menu apunta a /integraciones ni debajo» |
| R2 | ídem «R2: $testId declara integraciones.modificar y su page.tsx exige ese mismo y solo ese» |
| R3 | ídem «R3: el grupo pertenece a la seccion Configuración», «R3: el icono tiene fila en NAV_ICONS y se resuelve a Puzzle de lucide-react» |
| R4 | ídem «R4: con los permisos del Administrador aparece el grupo con sus tres hijos en orden» |
| R5 | ídem «R5: con los permisos de %s no sale nada del grupo en lo que se serializa» (Operador, Empacador, Maestro, Adm. acondicionamiento) + ancla |
| R6 | ídem «R6: el aterrizaje de %s es el mismo con y sin el grupo», «R6: sin el grupo, el menu es elemento a elemento los diez items previos», «R6: el grupo es el ultimo item del array» |
| R7 | revisión del diff (lista de no tocados arriba) |
| R8 | `integration-routes.test.ts` «R8, R16: las paginas de app/ cuya URL empieza por integraciones son exactamente las tres, por sus segmentos» |
| R9 | `integration-pages.test.tsx` «R9: INTEGRATION_EMPTY_MESSAGE es el texto acordado», «R9: $ruta con el permiso muestra la etiqueta del menu como titulo y el estado vacio» |
| R10 | ídem «R10: $ruta no pinta formulario, campo, selector ni boton», «R10: $ruta no declara params ni searchParams y solo importa lo de la pagina cascaron» |
| R11 | ídem «R11: $ruta exige integraciones.modificar una sola vez y como primera sentencia» |
| R12 | ídem «R12: $ruta con sesion sin el permiso responde notFound y no pinta nada» + E2E R20 (404 en navegador) |
| R13 | `integration-pages.test.tsx` «R13: $ruta sin sesion redirige al login…» + `integration-routes.test.ts` «R13: sin sesion, el borde redirige al login cada una de las tres rutas con los prefijos reales» |
| R14 | `integration-routes.test.ts` «R14, R16: los prefijos privados bajo /integraciones son exactamente las tres constantes…» + guardias (`guard-rutas-privadas-cubiertas` 7/7 verde; `guard-pantallas-exigen-permiso` verde tras T10, con las tres rutas como entradas de la lista) |
| R15 | `integration-routes.test.ts` «R15: /integraciones/inventarios no cae bajo /inventario con una lista de prefijos sin las tres rutas…» |
| R16 | ídem (a) prefijos, (b) «R16: los enlaces del menu privado bajo /integraciones son exactamente las tres constantes», (c) páginas |
| R17 | `module-shape.test.ts` «R17: el codigo del permiso solo aparece en el catalogo, en db/migrations/, en las tres paginas…», «R17: el barrido ve el codigo del permiso en cada una de las cuatro rutas exactas admitidas», «R17: la regla admite… y rechaza un archivo vecino» |
| R18 | `integration-routes.test.ts` «R14: ninguna de las tres URL aparece como literal en otro archivo de produccion…» (QC-221, sin cambios, verde) |
| R19 | `e2e/integraciones.spec.ts` «R19: el Administrador ve el grupo, lo despliega, abre cada integracion…, y cada ruta por URL responde 200» |
| R20 | ídem «R20: el rol '<rol>' no recibe el grupo… responde 404…» × Operador, Empacador, Adm. acondicionamiento |
| R21 | ídem «R21: el unico rol del seed con el permiso de integraciones es el Administrador…» + estructura (roles reales, Maestro excluido con motivo) |
| R22 | revisión del diff + `guard-dependencias-aprobadas` (sin cambios en `package.json`) |

## T8 — E2E: desviación de design §8 (a aprobar)

§8 pide abrir `private-user-trigger` por teclado y ver `private-logout`. `private-user-trigger` ya no existe
(`components/private/nav-user.tsx:22`, enmienda 2026-09-07: el cierre de sesión pasó al encabezado). La
primera corrida dio 6 rojos `element(s) not found` en ese paso, y todo lo anterior estaba en verde. El
spec afirma en su lugar que `private-logout` es visible y se puede enfocar con el teclado (`focus()` +
`toBeFocused()`), sin pulsarlo.

## Salida de los tests

- `pnpm run typecheck`: verde.
- `pnpm run lint`: 0 errors, 7 warnings que ya estaban (`documentos/confirm-catalog-import`, `pedidos/order-service`).
- `pnpm exec vitest run tests/unit/integraciones tests/unit/integraciones-ui`: 4 archivos, 81 tests, todos verdes.
- `pnpm exec vitest run guard-rutas-privadas-cubiertas`: 7/7 verde.
- `pnpm exec vitest run guard-e2e-landing`: 1 archivo, 16 tests verdes.
- `pnpm exec vitest related --run lib/shared/routes.ts`: 322 archivos (9 rojos); 4926 tests: 9 failed | 4872 passed | 45 skipped.
  - 3 están en el baseline: `recetas/scope.test.ts`, `recetas/module-contract.test.ts` y `navegacion/pantallas-exigen-permiso.test.tsx`.
  - 6 son los del bloqueo, filas 2–7. La fila 1 está en `app-sidebar.test.tsx`.
- Reproducción del implementer (2026-10-08):
  ```
  × la pantalla del catalogo vive solo donde la declara QC-22, y en ningun otro sitio
  × la pantalla de proveedores vive solo donde la declara QC-44, y en ningun otro sitio
  × el barrido encuentra exactamente las veintiuna pantallas privadas de hoy
  × ancla: el recorrido encuentra hoy los diez enlaces reales del menu
  × hay exactamente UNA seccion Configuración y lleva exactamente DOS items
  × renderiza una entrada por cada item de PRIVATE_NAV_ITEMS y en su orden
  × ancla: el menu real tiene los diez items que este test vigila
  ```
- `pnpm exec playwright test e2e/integraciones.spec.ts` (2.ª corrida, local, base sembrada):
  ```
  ✓  1 [chromium] › e2e\integraciones.spec.ts:193:7 › R21: el unico rol del seed con el permiso de integraciones es el Administrador, y hay roles sin el que recorrer (19ms)
  ✓  6 [webkit]   › e2e\integraciones.spec.ts:193:7 › R21: ... (18ms)
  ✓  2 [chromium] › e2e\integraciones.spec.ts:239:9 › R20: el rol 'Empacador' ... (42.0s)
  ✓  3 [chromium] › e2e\integraciones.spec.ts:239:9 › R20: el rol 'Operador' ... (41.7s)
  ✓  4 [chromium] › e2e\integraciones.spec.ts:239:9 › R20: el rol 'Administrador de acondicionamiento' ... (41.5s)
  ✓  7 [webkit]   › e2e\integraciones.spec.ts:239:9 › R20: el rol 'Operador' ... (41.2s)
  ✓  5 [chromium] › e2e\integraciones.spec.ts:205:7 › R19: el Administrador ve el grupo, ... responde 200 (43.4s)
  ✓  8 [webkit]   › e2e\integraciones.spec.ts:205:7 › R19: ... (41.5s)
  ✓  9 [webkit]   › e2e\integraciones.spec.ts:239:9 › R20: el rol 'Administrador de acondicionamiento' ... (5.6s)
  ✓ 10 [webkit]   › e2e\integraciones.spec.ts:239:9 › R20: el rol 'Empacador' ... (6.0s)
  10 passed (1.0m)
  ```
- (anterior) `./init.sh` no se corrió entonces por el bloqueo.

## T10 — enmienda E1/E2 (2026-10-08)

- E1 (frontend_dev): `app-sidebar.test.tsx:240-241` (`'nav-integraciones'` tras `'nav-unidades'`);
  `private-layout-menu.test.tsx:115-116,336,362-364` (11 items, «once»);
  `guard-nav-permisos-declarados.test.ts:106,112-114,119-121` (13, «trece», tres `nav-integraciones-*`);
  `private-nav-unidades.test.ts:78-79,92-94` (3, «TRES»); `guard-pantallas-exigen-permiso.test.ts:254-257,268-270,286`
  (las tres rutas como **entradas** de `RUTAS_ESPERADAS_HOY`, 24, «veinticuatro»). No hay excepción nueva ni `toContain`.
- E2 (backend_dev): `inventario/scope.test.ts:65-71,217-241,292-317` y `proveedores/scope.test.ts:26-31,260-283,290-313`.
  La carpeta sale de las constantes, con un `expect` de primer segmento común. Hay un `!relPath.startsWith` más
  en `fueraDeSuCarpeta`, un comentario fechado y una defensa con la lista exacta: solo la `page.tsx` esperada,
  y su fuente no es del catálogo ni de proveedores. `git diff -U0`: ningún hunk toca `screenPattern =` ni `PATRON_PROVEEDORES =`.
- E3: `e2e/integraciones.spec.ts:278-285` ya cumplía §8 enmendado (`private-logout` visible + `toBeFocused()`). Sin cambios.
- `pnpm exec vitest related --run <los 7 archivos de T10>`: `Test Files 7 passed (7)`, `Tests 68 passed (68)`.
- `pnpm exec vitest run guard`: `Test Files 1 failed | 55 passed (56)`, `Tests 1 failed | 743 passed | 11 skipped (755)`.
  El rojo es `guard-identificador-de-request.test.ts:893` (bloqueo 1 de arriba):
  ```
  - []
  + [ "e2e/integraciones.spec.ts: archivo nuevo en e2e/. QC-71 difirio el E2E con motivo (R21): ..." ]
  ```

## T9 — `./init.sh` (rápido), 2026-10-08

Sin corte por memoria: tardó unos 10 min y salió rojo en `test:rapido`.
- Candado, cupo, specs, perfil, Prisma, migraciones (80): ✓. `typecheck`: ✓. `lint`: ✓ (0 errors, 7 warnings que ya estaban).
- `test:rapido` (`vitest related` de 23 archivos del diff):
  ```
  Test Files  3 failed | 321 passed (324)
       Tests  3 failed | 4919 passed | 45 skipped (4967)
  [test:rapido] 3 rojo(s) heredado(s) del baseline excluidos de esta seleccion; el CI los compara.
  ✗ 'pnpm run test:rapido' fallo
  ```
  Los 3 rojos son los del baseline (`recetas/scope`, `recetas/module-contract`, `navegacion/pantallas-exigen-permiso`),
  aunque se pasaron como `--exclude` (bloqueo 2). init.sh se detuvo aquí y no corrió la fase de guardias.
  Corrida aparte, la de guardias da 1 rojo (bloqueo 1).
- Revisión del diff para R7/R22: sin cambios en `components/private/app-sidebar.tsx`, `components/ui/**`, `lib/modules/**`,
  `lib/composition/**`, `db/**`, `middleware.ts`, `route-guard-middleware.ts` ni `package.json`.

## T11 + T9 — gate local aprobado (`design.md > 14`), 2026-10-08

T11 (backend_dev): entrada `'integraciones.spec.ts'` + comentario con el patrón de las altas previas (QC-222 R21,
recorrido que ejercita, diferimiento de QC-71 R21 INTACTO). Comprobado con grep que `e2e/integraciones.spec.ts`
no lee ni afirma nada sobre el identificador de petición ni `reference`. `git diff --stat`: 1 archivo, +10/-0.

T9, sin `./init.sh` (no cierra en Windows: `scripts/test-rapido.mjs --exclude`). Logs en el scratchpad de la sesión.
- `pnpm exec vitest run guard` (todas las guardias):
  ```
  Test Files  56 passed (56)
       Tests  744 passed | 11 skipped (755)
  ```
- `pnpm exec vitest related --run <22 .ts/.tsx del diff contra origin/dev, sin e2e/>`:
  ```
  Test Files  3 failed | 321 passed (324)
       Tests  3 failed | 4919 passed | 45 skipped (4967)
  FAIL tests/unit/recetas/module-contract.test.ts
  FAIL tests/unit/recetas/scope.test.ts
  FAIL tests/unit/navegacion/pantallas-exigen-permiso.test.tsx
  ```
  Los 3 están en `tests/baseline-rojos.json`: no son fallos de QC-222. Ningún otro rojo.
- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: exit 0, 0 errors, 7 warnings (ya estaban).
- Revisión del diff (R7, R22): `git diff --name-only origin/dev...HEAD` no toca `components/private/app-sidebar.tsx`,
  `components/ui/**`, `lib/modules/**`, `lib/composition/**`, `db/**`, `middleware.ts`, `route-guard-middleware.ts`,
  `package.json` ni `e2e/permisos.spec.ts`. Todo lo tocado está en `tasks.md > Archivos esperados`.
- Gate final: check `gate-completo` de CI (lo lleva el leader).
