# QC-177 — review (F2.5, vuelta 1)

Revisado: `e19bac55..8603e94b` (commits `b2253536` y `8603e94b`) contra
`specs/QC-177-rojos-heredados-de-tabla-y-filtro-de-usuarios/` (D4-D7, aprobadas el 2026-10-08),
`CHECKPOINTS.md`, `docs/checkpoints-proyecto.md` y `docs/perfil-agentes.md > reviewer`.

## Verificación ejecutada por el reviewer

| Comando | Resultado |
|---|---|
| `pnpm run typecheck` | exit 0 |
| `pnpm run lint` | 0 errores, 7 avisos previos, en archivos que el diff no toca |
| `pnpm exec vitest run` sobre los 5 archivos del alcance + `list-responsible-candidates`, `data-table-scroll` y `product-display-name` | 8/8 archivos, 209 passed, 3 skipped. Los skips son previos (`ctx.skip` en `account-status-scope.test.ts:458/468`); el diff no añade ningún `.skip`, `.todo` ni `.only` |
| `pnpm exec vitest run guard` | 53/53 archivos, 717 passed, 11 skipped |
| `vitest related` sobre los archivos de producción | El barrel de `identity` arrastra casi toda la suite. Me fío de la salida del implementer: 3 rojos, todos en el baseline (QC-180, D33) |
| E2E | No corrido: la base local no tiene 3 migraciones de `dev` (lo indica el leader) |

## Checklist

### Trazabilidad (R → test)
- [x] R1, R2, R3: `data-table-scroll.test.tsx`, que no cambia y está en verde.
- [x] R4: `usuarios-viewport` R21 ×2. Se quitó la aserción «sin `overflow-hidden`» y se añadieron dos: `textContent === usuario.email` y `toContain('text-ellipsis')`. Se mantienen la celda dentro del contenedor, visible, sin `hidden` y sin scroll del documento. Verde.
- [x] R5: `unidades-viewport` R27 ×2, con el mismo cambio. La frase completa se compara de forma exacta. Verde.
- [x] R6, R7: `product-page.test.tsx` (R18), sin tocarlo y en verde; también `product-display-name.test.ts`. La regla `productDisplayName(name, productUnitLabel(product, units))` es la misma que `nameCell` de `a543c84d^` (comprobado con `git show`).
- [~] R8: `e2e/inventario.spec.ts` R26 ahora exige `{nombre: productDisplayName(X, kg.label), existencia}` y lo mismo para L, tras el alta y tras el segundo lote. `kg.label = symbol ?? name` coincide con `productUnitLabel`. El test es correcto y es más estricto que antes. **Falta la evidencia en verde**, por la base local sin migraciones. No es un defecto del código.
- [x] R9, R10: `recipe-page.test.tsx` R21, sin tocarlo y en verde. Solo se quita `defaultPinned: 'right'`; `pinnable: false` se queda.
- [x] R11: `list-responsible-candidates.test.ts:104` sigue afirmando `{ accountStatus: ['active'] }` en el puerto, y está en verde.
- [x] R12, R13: `account-status-scope.test.ts` está en verde sin tocar `SITIOS_PERMITIDOS`. `list-responsible-candidates.ts` ya no nombra el estado ni en el código ni en el comentario. `ACTIVE_ACCOUNTS_ONLY` vive en `people-directory.ts` y en `identity/index.ts`, los dos ya en la lista.
- [~] R14: las 5 entradas se borraron de `tests/baseline-rojos.json` y no se añadió ninguna (el diff solo borra). Queda pendiente `gate-completo` en CI.
- [x] R15: en los dos viewports solo cambian los casos R21/R27, y solo en lo que permite D4. Los otros 3 archivos no se tocan.
- [x] R16: hay enmiendas fechadas 2026-10-08 que citan QC-177 en QC-67 (D4), QC-39 (D4), QC-55 (D4) y QC-145 §3.6 (D7, línea 288).
- [x] R17: el diff no toca `package.json`, el lockfile, `schema.prisma` ni migraciones.
- [x] `progress/impl_QC-177-*.md` contiene el mapa R → test.

### Especificación
- [x] Están `requirements.md` (EARS R1-R17), `design.md` con alternativas descartadas (§6) y `tasks.md`.
- [x] `design.md` abre con `## Lo que ya existe`. El diff no re-crea nada: reutiliza `productDisplayName`, `productUnitLabel`, `PeopleRefFilters` y `exactProductNameCellText`, que se movió a un helper compartido.
- [~] `tasks.md`: todo está en `[x]` salvo T7 «`./init.sh` en verde. Se pide el gate completo de CI». Depende de los dos bloqueos externos de abajo.

### Calidad de código
- [x] Typecheck y lint en verde.
- [ ] `gate-completo` en CI: pendiente del PR.
- [~] Flujo crítico (movimientos de inventario): el E2E existe y es de Playwright, pero su salida en verde falta. Ver R8.
- [x] Dependencias: ninguna.

### Seguridad, configuración y datos
- [x] No hay secretos, webhooks, tablas, RLS ni migraciones. No hay nada hardcodeado que dependa del entorno.
- [x] Ninguna consulta de datos cambia. El filtro de empresa de `listAliveInCompany` sigue igual.

### Módulos hexagonales
- [x] `asignaciones/domain` importa de `@/lib/modules/identity` (contrato público) y no de una ruta profunda. `ACTIVE_ACCOUNTS_ONLY` es un valor puro de dominio. Las guardias están en verde, incluida `guard-qc87-no-reimplementado`.

### Reglas del proyecto (perfil-agentes > reviewer)
- [x] 5. Calidad y seguridad: no aplica nada nuevo y las capas siguen separadas.
- [x] 6. Multiplataforma: el cambio de UI es solo texto de celda y quitar el fijado. No hay `100vh`, ni `:hover` como única vía, ni targets menores de 44 px. R10 sigue afirmando `min-h-11`/`min-w-11`.
- [x] 7. Dependencias: ninguna.
- [x] 8. Aislamiento por empresa: no aplica.
- [x] 9. Comentarios de producción: en las líneas añadidas o modificadas (`list-responsible-candidates.ts` y `people-directory.ts`) ningún comentario cita QC, R, `design.md` ni «decisión cerrada».

## Hallazgos

1. **menor**: `e2e/helpers/product-name-cell.ts:3`. El comentario cita `product-columns.tsx > nameCell`, que ya no existe: la celda es inline en `buildProductColumns`. Es un comentario obsoleto en un archivo nuevo. Basta con citar solo `productDisplayName`. El propio implementer lo marcó.
2. **menor (fuera de la lista de archivos esperados)**: el diff toca `e2e/producto-terminado.spec.ts` y crea `e2e/helpers/product-name-cell.ts`. El design no los preveía; es la extracción del patrón `exactProductNameCellText` que §«Lo que ya existe» mandaba reutilizar. Quita dos copias (`producto-terminado` y `inventario-importar`) sin cambiar el comportamiento. Se acepta; queda anotado para el candado de archivos.
3. **pendiente de evidencia (no es defecto)**: falta el E2E de R8 en verde (Chromium y WebKit) con la base local migrada. Antes de cerrar hay que correr `pnpm exec playwright test e2e/inventario.spec.ts e2e/insumo-por-unidad.spec.ts e2e/inventario-importar.spec.ts e2e/aislamiento-inventario.spec.ts` y pegar la salida en `progress/impl_QC-177-*.md`.
4. **pendiente externo (no es defecto)**: `./init.sh` rápido falla solo en validate-features, por QC-156 y QC-167, features de otra persona. typecheck, lint, las guardias y los tests del alcance se verificaron a mano en verde. T7 sigue en `[ ]` hasta que `init.sh` y `gate-completo` den verde.

Bloqueantes: 0. Menores: 2. Pendientes de evidencia o externos: 2.

## Veredicto

**OK**. No hay bloqueantes en el código ni en el spec. El cierre a `done` queda condicionado a:
(a) el E2E de R8 en verde con la base migrada y su salida en la bitácora;
(b) `gate-completo` en verde en CI (R14);
(c) T7 marcada `[x]`.
Si (a) sale rojo por una aserción nueva, se reabre la revisión.
