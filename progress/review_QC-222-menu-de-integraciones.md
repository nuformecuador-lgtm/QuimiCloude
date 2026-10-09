# Review QC-222 — menu-de-integraciones

> Reviewer, 2026-10-08. Rama `feature/QC-222-menu-de-integraciones`, diff `origin/dev...HEAD` (HEAD `a91f3c0c`).
> Spec: R1–R22; enmiendas E1–E4 (`design.md > 14`), aprobadas por el humano el 2026-10-08; tasks T0, T2–T11.
> Grafo MCP: no se usó. Diff pequeño, revisado entero con git, Grep y Read.

## Verificación ejecutada por el reviewer

| Comando | Resultado |
|---|---|
| `pnpm run typecheck` | verde (exit 0) |
| `pnpm run lint` | 0 errores, 7 warnings que ya existían en archivos ajenos (`pedidos/order-service.test.ts`, etc.) |
| `pnpm exec vitest run guard` | **56/56 archivos**, 744 pasan, 11 skipped |
| `pnpm exec vitest run` sobre los tests tocados o nuevos (`integraciones-ui`, `integraciones`, `app-sidebar`, `private-nav-clientes`, `configuracion-ui`, `private-layout-menu`, `inventario/scope`, `proveedores/scope`) | **70/70 archivos**, 1115 pasan, 31 skipped (int sin BD) |
| Rojos de `vitest related` en la bitácora | 3: `recetas/scope.test.ts`, `recetas/module-contract.test.ts` y `navegacion/pantallas-exigen-permiso.test.tsx`. Los tres están en `tests/baseline-rojos.json` (líneas 4, 8 y 12), así que no son hallazgo |
| E2E | No la corrí (la corre el CI). La salida local de la bitácora da 10/10 en Chromium y WebKit |

## Checklist

### Especificación
- [x] `requirements.md` con EARS R1–R22 y la tabla de decisiones D1–D18.
- [x] `design.md` con alternativas descartadas (§10, nueve).
- [x] `tasks.md`: T0, T2–T11 marcadas `[x]`. No hay T1, que se eliminó en F1.4 y queda documentado.
- [x] `design.md` abre con `## Lo que ya existe`, con la búsqueda hecha. El diff no re-crea nada de esa lista: reutiliza el permiso y las constantes de QC-221, y no toca `AppSidebar` ni el filtrado. El estado vacío copia el patrón de marcado y no crea una primitiva.

### Trazabilidad (cada R → test real)
- [x] R1, R2, R3, R4, R5 y R6 → `tests/unit/integraciones-ui/private-nav-integraciones.test.ts`:
  - R2 lee el permiso de la fuente de cada `page.tsx`;
  - R3 afirma `NAV_ICONS.puzzle === Puzzle` y la sección `NAV_SECTION_CONFIGURATION`;
  - R5 deriva los roles sin el permiso de `SEED_ROLE_PERMISSIONS`, con un ancla que incluye a `ROLE_MAESTRO`, y comprueba el `JSON.stringify` de lo filtrado;
  - R6 compara el aterrizaje de cada rol de semilla con el grupo y sin él, y la lista elemento a elemento de los 10 items previos.
- [x] R7 → revisión del diff (ver «Alcance»).
- [x] R8, R13 (borde), R14, R15 y R16 → `tests/unit/integraciones/integration-routes.test.ts`, el bloque invertido «tienen pantalla», con lista exacta. R15 usa una lista de prefijos **sin** las tres rutas.
- [x] R9, R10, R11, R12 y R13 (página) → `tests/unit/integraciones-ui/integration-pages.test.tsx`:
  - render real de las tres páginas, con la sesión mockeada;
  - el literal del texto vacío queda anclado;
  - las páginas no tienen `form/input/select/textarea/button/a`;
  - los imports son la lista exacta;
  - `requirePagePermission('integraciones.modificar')` aparece una sola vez y es la primera sentencia;
  - `notFound` cuando falta el permiso y `redirect(LOGIN_ROUTE_SESSION_ENDED)` cuando no hay sesión.
- [x] R17 → `tests/unit/integraciones/module-shape.test.ts`: lista exacta de las cuatro rutas, un caso que impide que el barrido pase a ciegas y ejemplos negativos vecinos.
- [x] R18 → el R14 de QC-221 en `integration-routes.test.ts`, sin cambios y en verde.
- [x] R19, R20 y R21 → `e2e/integraciones.spec.ts`.
- [x] R22 → revisión del diff y `guard-dependencias-aprobadas` en verde. `package.json` no se toca.
- [x] `progress/impl_QC-222-menu-de-integraciones.md` contiene el mapa `R<n> -> test`.

### Tests tensados, nunca relajados (E1, E2 y E4)
- [x] `app-sidebar.test.tsx`: el orden del DOM y la lista de 10→11 siguen siendo exactos, con `nav-integraciones` al final.
- [x] `private-layout-menu.test.tsx`: ancla de 10→11 y lista exacta.
- [x] `guard-nav-permisos-declarados.test.ts`: ancla de 10→13 y lista ordenada exacta. No hay `toContain`.
- [x] `guard-pantallas-exigen-permiso.test.ts`: `RUTAS_ESPERADAS_HOY` pasa de 21 a 24. Las tres rutas entran como **entradas** de la lista, no como excepciones.
- [x] `private-nav-clientes`, `-configuracion`, `-unidades` y `-usuarios`: cifras y posiciones exactas a la forma nueva. El orden de Configuración es exactamente `[PRESENTATIONS_ROUTE, UNITS_ROUTE, INTEGRATIONS_LABEL]`.
- [x] `inventario/scope.test.ts` y `proveedores/scope.test.ts` (§7.5):
  - las regex `screenPattern` y `PATRON_PROVEEDORES` no se tocan;
  - la carpeta sale del primer segmento de las constantes, y un `expect` comprueba que las tres lo comparten;
  - la exclusión es un `!startsWith` más, con comentario fechado que no cita `QC-`/`R`;
  - como defensa, lo que casa bajo la carpeta es **exactamente** la `page.tsx` esperada, y su fuente no contiene piezas del catálogo ni de proveedores.
- [x] `guard-identificador-de-request.test.ts`: `'integraciones.spec.ts'` entra en `E2E_ESPERADOS` como entrada con nombre y con comentario. No se tocan `hallazgosDeE2e` ni ningún otro caso (E4).

### Alcance (R7, R22)
- [x] El diff (`--stat origin/dev...HEAD`) no toca `components/private/app-sidebar.tsx`, `components/ui/**`, `lib/modules/**`, `lib/composition/**`, `db/**`, `middleware.ts`, `route-guard-middleware.ts`, `package.json` ni `pnpm-lock.yaml`.
- [x] En `private-nav.ts` solo se añaden las 4 etiquetas, `'puzzle'` en `NavIconName` y el item al final del array. Los tipos `NavLink`, `NavGroup` y `NavItem` no cambian, y tampoco `filterNavItemsByPermissions`, `groupNavItemsBySection` ni `firstVisibleNavHref`.
- [x] Los archivos tocados coinciden con `tasks.md > Archivos esperados`. Los de `progress/` y `specs/` son del proceso.

### Puntos pedidos por el leader
- [x] Las páginas cortan con `requirePagePermission('integraciones.modificar')` como primera sentencia y con un único código, en las tres.
- [x] Las 3 rutas están en `PRIVATE_ROUTE_PREFIXES`, al final y por su constante. No hay `/integraciones` suelto. Se borró el comentario obsoleto de QC-221.
- [x] En el menú, el `NavGroup` va en `NAV_SECTION_CONFIGURATION` con `icon: 'puzzle'`, y `NAV_ICONS.puzzle = Puzzle` de `lucide-react`. Cada hijo declara `permission: 'integraciones.modificar'`, y el grupo no lleva permiso propio.
- [x] La E2E coincide con §8 enmendado:
  - entra por `loginAndLand`, y el único `waitForURL` sigue a un clic de menú;
  - usa los prefijos `qc222_e2e_` y `qc222_e2e_empresa_`, un `RUN_ID` por worker, la empresa con `normalizeCompanyName`, el hash real y `accountStatus: 'active'`;
  - limpia por edad (1 h) y borra en `afterAll` por `RUN_ID`, primero los usuarios y luego la empresa;
  - usa los roles reales del seed; si falta uno, falla nombrando el seed;
  - los roles con el permiso salen de `SEED_ROLE_PERMISSIONS`, con un ancla `[ROLE_ADMINISTRADOR]`;
  - los roles sin el permiso son el resto, menos `ROLE_MAESTRO`, excluido por nombre y con su motivo;
  - R19 (Administrador): visibilidad, desplegado, los tres clics con título y estado vacío, y 200 por URL;
  - R20, por rol: `toHaveCount(0)` sobre el grupo y los hijos, 404 con `private-not-found`, sin «permiso/rol/autoriz» en el texto, y `private-logout` visible y con `toBeFocused()` (E3);
  - `test.setTimeout(180_000)`;
  - `guard-e2e-landing` está en verde.

### Calidad, seguridad y proyecto
- [x] Typecheck y lint en verde, según la verificación de arriba.
- [x] Sin secretos ni hardcode de entorno. No hay webhooks, tablas, migraciones ni RLS que revisar (§2).
- [x] Flujo crítico (permisos) con E2E de Playwright y su salida local en la bitácora.
- [x] Multiplataforma (punto 6): no hay controles nuevos ni `100vh`, `:hover` o inputs. No hace falta excepción.
- [x] Dependencias (punto 7): ninguna nueva.
- [x] Aislamiento por empresa (punto 8): no aplica, porque no hay modelos ni consultas de operación.
- [x] Comentarios (punto 9): ninguna línea nueva de producción cita `QC-<n>`, `R<n>`, `design.md` ni «decisión cerrada». Las páginas no llevan comentarios.
- [x] Permisos: las páginas validan en el servidor con `requirePagePermission`, que lee la sesión. El placeholder no hace fetch.
- [ ] `gate-completo` en CI: pendiente del PR. Es el gate final aprobado en §14.
- [ ] `progress/features/QC-222.md > Cierre` y el desmontaje del worktree le tocan al leader después del merge. No son de esta revisión.

## Hallazgos

1. **menor**: el comentario del alta en `E2E_ESPERADOS` (`tests/guards/guard-identificador-de-request.test.ts`) cita «QC-222 R21». La regla transversal del diseño prohíbe esas citas también en tests, pero E4 pidió expresamente nombrar «por qué entra (QC-222 R21)», que es el patrón de las altas previas de esa lista. El punto 9 del reviewer solo aplica a producción. No requiere acción.
2. **menor**: en R20, «recibe el foco por teclado» se comprueba con `locator.focus()` y `toBeFocused()`, no con una pulsación real de `Tab`. Es literalmente lo que fija el texto enmendado de §8 (E3), así que no es desviación. Lo dejo anotado porque comprueba que el control es enfocable, no la ruta de tabulación.
3. **menor, fuera de alcance**: la bitácora señala que `e2e/permisos.spec.ts:258-263` sigue usando `private-user-trigger`, que ya no existe. Ese spec probablemente está rojo en `dev`. No lo introduce esta feature. Conviene abrir una ficha si el E2E de CI lo confirma.

No hay hallazgos bloqueantes.

## Veredicto

**OK**
