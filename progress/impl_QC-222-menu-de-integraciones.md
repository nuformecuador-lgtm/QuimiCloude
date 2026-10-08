# QC-222 — impl (frontend_dev: T2, T3, T4, T7)

## Archivos
- M `lib/shared/navigation/private-nav.ts` (4 `*_LABEL`, `'puzzle'`, grupo al final)
- M `lib/shared/navigation/nav-icons.ts` (`puzzle: Puzzle`)
- A `app/(private)/integraciones/components/integration-placeholder.tsx`
- A `app/(private)/integraciones/components/index.ts`
- A `app/(private)/integraciones/{proveedor-ia,inventarios,whatsapp}/page.tsx`
- A `tests/unit/integraciones-ui/private-nav-integraciones.test.ts`
- A `tests/unit/integraciones-ui/integration-pages.test.tsx`
- M `tests/unit/app-sidebar.test.tsx` (:560-573, 11 items, `nav-integraciones` al final)
- M `tests/unit/clientes-ui/private-nav-clientes.test.ts` (:89, penúltimo + último el grupo)
- M `tests/unit/configuracion-ui/private-nav-configuracion.test.ts` (:76, 3 items)
- M `tests/unit/configuracion-ui/private-nav-usuarios.test.ts` (:93-111, 3 items en orden; describe y casos renombrados)

## Mapa R -> test
- R1: `private-nav-integraciones.test.ts` > «R1: hay exactamente un NavGroup…», «R1: sus hijos son exactamente tres NavLink…», «R1: ningun otro item del menu apunta a /integraciones ni debajo»
- R2: «R2: $testId declara integraciones.modificar y su page.tsx exige ese mismo y solo ese»
- R3: «R3: el grupo pertenece a la seccion Configuración», «R3: el icono tiene fila en NAV_ICONS y se resuelve a Puzzle de lucide-react»
- R4: «R4: con los permisos del Administrador aparece el grupo con sus tres hijos en orden»
- R5: «R5: con los permisos de %s no sale nada del grupo en lo que se serializa» (Operador, Empacador, Maestro, Administrador de acondicionamiento; ancla aparte)
- R6: «R6: el aterrizaje de %s es el mismo con y sin el grupo», «R6: sin el grupo, el menu es elemento a elemento los diez items previos», «R6: el grupo es el ultimo item del array»
- R9: `integration-pages.test.tsx` > «R9: INTEGRATION_EMPTY_MESSAGE es el texto acordado», «R9: $ruta con el permiso muestra la etiqueta del menu como titulo y el estado vacio»
- R10: «R10: $ruta no pinta formulario, campo, selector ni boton», «R10: $ruta no declara params ni searchParams y solo importa lo de la pagina cascaron»
- R11: «R11: $ruta exige integraciones.modificar una sola vez y como primera sentencia»
- R12: «R12: $ruta con sesion sin el permiso responde notFound y no pinta nada»
- R13 (página): «R13: $ruta sin sesion redirige al login con la marca de sesion terminada»

## Salida
- `pnpm run typecheck`: verde (sin salida de tsc).
- `pnpm run lint`: 0 errors, 7 warnings (preexistentes, archivos no tocados).
- `pnpm exec vitest run tests/unit/integraciones-ui`: Test Files 2 passed (2), Tests 40 passed (40).
- `pnpm exec vitest related --run <13 archivos tocados>`: Test Files 6 failed | 85 passed (91); Tests 7 failed | 1400 passed | 20 skipped (1427).
  - Esperados (T6): `tests/unit/integraciones/integration-routes.test.ts` R15 x2.
  - Preexistente, ajeno: `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx` «'/pedidos' se sirve con el permiso» (`listRecipesAction` mockeado como `vi.fn()` sin valor; `app/(private)/pedidos/page.tsx:96` lee `.status` de `undefined`).
  - BLOQUEO, fuera de §7.2 y de «Archivos esperados»: cuatro tests más fijan la forma del menú y se ponen rojos por el grupo:
    - `tests/unit/app-sidebar.test.tsx:229-242` (orden en el DOM; falta `nav-integraciones` tras `nav-unidades`)
    - `tests/unit/navegacion/private-layout-menu.test.tsx:343-360` (lista exacta de 10 testId)
    - `tests/guards/guard-nav-permisos-declarados.test.ts:112-124` (ancla: 10 enlaces; ahora 13)
    - `tests/unit/configuracion-ui/private-nav-unidades.test.ts:79,92` (Configuración con 2 items)

## Veredicto
T2, T3, T4 y T7 hechos según design; bloqueado a la espera de que el spec añada a §7.2 los cuatro tests de arriba.
