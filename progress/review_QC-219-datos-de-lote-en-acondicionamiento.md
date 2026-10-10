# QC-219 · datos-de-lote-en-acondicionamiento · review

## Vuelta 1 (diff `c1ad6385..6841dcf9`, merge-base con `origin/dev`)

**Veredicto: OK.** No hay bloqueantes. Quedan 6 menores, que no frenan el merge.

### Checklist

**Especificación (CHECKPOINTS.md)**
- [x] `requirements.md` con R1–R30 en EARS. R29 está enmendada el 2026-10-09 (`54cbf3c7`).
- [x] `design.md` con 6 alternativas descartadas (§ 8).
- [x] T1–T17 marcadas `[x]`. T18 queda `[ ]`: es el cierre del leader (`docs/architecture.md`, `./init.sh`). Es lo esperado en esta fase y no es hallazgo.
- [x] `design.md` abre con `## Lo que ya existe`. El diff no re-crea nada de esa lista:
  - se reutilizan `lotSchema`, ahora exportado como `typedLotSchema`, `esDiaDeCalendario` dentro de `civilDateSchema`, `batch_duplicate_lot`, `batch_not_found`, `ConditionedOrdersTable`, sus columnas, `assignmentViewHref`, `listHref` y `EmptyState`;
  - `findBatchesOfOrder` se calca, como dice el design.

**Trazabilidad**
- [x] Cada R1–R30 tiene un test real que la afirma. Comprobé el contenido de los tests, no solo los nombres:
  - R7: 18 casos `it.each`.
  - R13: todos los roles sin el permiso.
  - R14: los estados `TERMINADO` y `ENTREGADO` ajenos o sin quien acondiciona, más 7 estados no corregibles.
  - R11: dos tests de integración, uno con `Promise.all` y otro con `pg.Client` reteniendo.
  - R24: UP, `CHECK` con `23514` y DOWN contra Postgres.
  - R28: E2E con la base comparada antes y después de cada rechazo.
- [x] El mapa `R → test` está en `progress/impl_…md`.

**Calidad de código**
- [x] `pnpm run typecheck` → exit 0.
- [x] `pnpm run lint` → 0 errores. Hay 7 warnings, todos en archivos ajenos sin tocar (`confirm-catalog-import.test.ts`, `order-service.test.ts`).
- [ ] `gate-completo` en CI: pendiente del PR. No es verificable aquí.
- [x] El flujo crítico (movimientos de inventario y permisos) tiene E2E Playwright. Su salida está en la bitácora.
- [x] Sin dependencias nuevas: `package.json` no aparece en el diff (R30).

**Seguridad y configuración**
- [x] Sin secretos ni webhooks. Nada que cambie entre entornos queda hardcodeado.

**Verificación final**
- [ ] `./init.sh`: no se corre en esta máquina (OOM). Lo sustituyen las corridas por carpeta de abajo y el CI.

**docs/checkpoints-proyecto.md**
- [x] Multiplataforma:
  - campos en `text-base` y `min-h-11`;
  - `type="date"` nativo;
  - `Label` asociada a cada campo y `<legend>` por bloque;
  - botón con `touch`;
  - una columna en móvil y tres en `md:`;
  - nada depende de `:hover`.
- [x] Tabla nueva: no hay. `product_batches` ya tiene `ENABLE` y `FORCE` RLS desde `20260909120000` (design § 1.1), y el `CHECK` va a mano.
- [x] Migración `20261009120000_product_batches_production_date`:
  - tiene `down.sql` (`DROP CONSTRAINT` y después `DROP COLUMN`);
  - tiene el `CHECK product_batches_production_date_requires_expiry`;
  - está en `MIGRACIONES_ESPERADAS`;
  - su test de integración está en `aislamiento.json > transaccion`.
- [x] Los permisos se validan en `domain/`, con `requirePermission` en la primera línea de guardar y de «Entregados», y tienen tests (R13, R26).
- [x] El acceso a datos pasa solo por un adaptador driven de Prisma. No se usa el cliente de Supabase.
- [x] Hexagonal:
  - el dominio de `asignaciones` importa solo los contratos `@/lib/modules/inventario` y `@/lib/modules/pedidos`;
  - el adaptador nuevo lo cablea `lib/composition`;
  - el `'use server'` no se reexporta desde el barrel;
  - `ProductBatch` sigue con `/// @module inventario`.
- [x] La lógica de negocio está en `domain/`. La action solo traduce el `FormData` y el error.
- [x] Las páginas validan permisos en el servidor, y el formulario recibe los datos por props.

**Reglas del proyecto (perfil-agentes > reviewer)**
- [x] 5. Capas separadas, sin hardcode de contexto: la empresa sale siempre del actor, y hay test de ello.
- [x] 6. Multiplataforma: ver arriba.
- [x] 7. Dependencias: ninguna.
- [x] 8. Aislamiento por empresa:
  - `listOfOrder` filtra por empresa en el asiento y en el lote;
  - `writeFinishedBatchLabels` hace `SELECT … FOR UPDATE` con `company_id`, y el `update` usa `where { id, companyId }`;
  - el test de integración R12 intenta escribir un lote de otra empresa y recibe `batch_not_found`.
- [x] 9. Comentarios: en las líneas añadidas de `app/`, `lib/`, `db/` y `scripts/` no hay ninguna cita a `QC-<n>`, `R<n>`, `D<n>`, `design.md` ni «decisión cerrada». Las citas solo aparecen en `e2e/` y `tests/`, que no son producción.

**Listas cerradas**
- [x] `data-table-alcance`: 32 → 33, con la entrada ordenada y una nota fechada.
- [x] `E2E_ESPERADOS` y `MIGRACIONES_ESPERADAS`: dadas de alta con su motivo.
- [x] `catalogo.test.ts`: 76 → 79. `conditioning-batch-data-codes.test.ts` prueba los 5 códigos y su `batchId`.
- [x] `guard-piezas-base`: en verde dentro de `tests/guards`.
- [x] `guard-libro-de-inventario`: `CAMINOS_SIN_ASIENTO = ['writeFinishedBatchLabels']`. Más abajo explico por qué la excepción está justificada.
- [x] `qc91-alcance`: `UPDATES_PERMITIDOS` con los dos nombres exactos, más pruebas por mutación (un `update` en una tercera función y `stock:`, `increment` o `decrement` dan rojo).
- [x] `qc121-alcance`: `writeFinishedBatchLabels` en `EXCEPCIONES_SIN_RECALCULO`, con nota fechada, y el censo pasa de 6 a 7.

**Por qué la excepción de `writeFinishedBatchLabels` está justificada (R27, design § 2.2 y § 7)**
- No cambia la existencia, así que no hay movimiento de cantidad que asentar ni `products.stock` que recalcular.
- La excepción va por nombre exacto.
- Dos guardias independientes exigen que su cuerpo no escriba `stock` ni use `increment`/`decrement`.
- Cualquier otro `productBatch.update` sigue dando rojo, y eso tiene su prueba por mutación.
- La trazabilidad del cambio queda en `updated_by` y `updated_at`.
- La aprobó el humano con el spec (§ 9, enmienda QC-92 R26/R28).

**seed-demo**
- [x] `scripts/seed-demo/gateway.ts > saveDemoBatchData` escribe los datos antes de Terminar, y solo en las líneas sin datos, así que es idempotente.
- [x] `seed-demo.int.test.ts` pasa en verde. Comprueba que cada pedido queda en su estado objetivo, `TERMINADO` incluido, y que dos corridas dejan los mismos conteos.
- [x] El lote `DEMO-PT-<provisional>` hereda la unicidad del provisional.

### Hallazgos

Ninguno es BLOQUEANTE.

1. **menor — El texto del skeleton de «Entregados» no es el suyo.** `page.tsx` reutiliza `ConditioningOrdersSkeleton list="acondicionados"`, así que el lector de pantalla anuncia «Cargando pedidos terminados…» mientras carga «Entregados». Basta una tercera entrada en `SKELETON_SHAPE` de `conditioning-orders-skeleton.tsx`, con «Cargando pedidos entregados…». Solo afecta a un texto sr-only transitorio; la tabla final es correcta.

2. **menor — Una línea sin lote se deshabilita sin explicación.** Esa línea (`batchId: null`) es un `<fieldset disabled>` sin ningún texto. Por R17 bloquea Terminar («Faltan los datos de lote de 1 línea.»), y el acondicionador no tiene cómo resolverlo desde la pantalla. El comportamiento cumple el spec: R17 y D15 no definen ningún texto, y el implementer hizo bien en no inventarlo. Es un hueco del spec. Propongo una ficha o pregunta al humano con el texto y la salida para ese caso. Hoy solo ocurre con pedidos de datos anteriores, sin asiento `production`.

3. **aceptable — La etiqueta «Entregado».** El estado necesita una etiqueta. «Entregado» es coherente con «Terminado», «Entregados» y el vocabulario del dominio, y no inventa significado. No es hallazgo.

4. **aceptable — `deliveredConditionedOrdersHref`.** Delega en el `listHref` existente, igual que `conditionedOrdersHref`. No duplica la construcción de `?vista=`, y las pestañas y la vuelta usan `assignmentViewHref`. No es hallazgo.

5. **aceptable — El testid del E2E se construye con el prefijo.** El archivo ya usa literales locales (`TAB_*_TESTID`, `ASSIGNMENT_VIEW_TAB_TESTID_PREFIX`) y no importa la constante del componente. Componer con el prefijo mantiene el diff dentro de la única aserción que permite R29. No es hallazgo.

6. **menor — `civilDayUtc` re-escribe un helper.** `save-conditioning-batch-data.ts > civilDayUtc` copia `fechaCivilUtc` de `create-product.ts` (y `toCivilDate` del adaptador hace lo mismo). Ya existe `lib/shared/ui/date-civil.ts`, pero el dominio no puede importar `shared`, y el design dice «se calca». Lo dejo anotado como deuda de módulo, no de esta feature.

7. **menor — La segunda mitad de R25 solo se prueba de forma indirecta.** Lo de que un `TERMINADO` o `ENTREGADO` previo «queda sin datos y sin cambios» se apoya en el test R24 («el UP no cambia ninguna fila») y en que ningún camino escribe sin petición. No hay un test que lo nombre. Es suficiente, pero un caso de integración con un `TERMINADO` sin datos que sigue igual tras la migración lo haría explícito.

8. **menor — `ConditioningOrdersEmpty` no se amplía.** La sección «Entregados» usa `EmptyState` directamente y reutiliza los textos y testids de página pasada de `conditioning-orders-empty.tsx`. No duplica UI, porque `EmptyState` es la pieza compartida, pero deja dos formas de pintar el vacío en la misma carpeta. Es cosmético.

Otras comprobaciones, sin hallazgo:
- No hay `TOUCH_TARGET` local nuevo: el de `conditioning-order-screen.tsx` ya existía y no se toca, y `conditioning-actions.tsx` usa `touchTarget` de `lib/shared/ui`.
- No hay comparaciones nuevas con `UNEXPECTED_ERROR_CODE`.
- `EmptyState` y `assignmentViewHref` se reutilizan.

### Comandos corridos (en el worktree)

| Comando | Resultado |
|---|---|
| `git fetch` y `git merge-base HEAD origin/dev` | `c1ad6385`, 19 commits, 72 archivos |
| `pnpm run typecheck` | exit 0 |
| `pnpm run lint` | `✖ 7 problems (0 errors, 7 warnings)`, todos ajenos |
| `pnpm exec vitest run tests/guards` | 54 archivos, 741 passed, 9 skipped |
| `pnpm exec vitest run tests/unit/asignaciones tests/unit/asignaciones-ui tests/unit/errores tests/unit/composition tests/unit/identity/roles` | 103 archivos, 2006 passed, 4 skipped |
| `pnpm exec vitest run tests/unit/inventario tests/unit/shared tests/unit/scripts` | 137 archivos, 2037 passed, 7 skipped |
| `.int`: `finished-batch-labels`, `product-batch-production-date-migration`, `finish-conditioning-batch-data`, `finished-orders` y `scripts/seed-demo`, con el `DATABASE_URL` del `.env` raíz | 5 archivos, 21 passed |
| `.int`: `tests/integration/asignaciones` y `inventario/order-batches` | 25 archivos, 168 passed |
| `pnpm exec playwright test e2e/datos-de-lote-en-acondicionamiento.spec.ts --project=chromium` | 1 passed (43.1s) |

No corrí `./init.sh` ni `vitest related` (restricción de esta máquina). Tampoco corrí los E2E de `acondicionamiento.spec.ts` ni `acondicionar-con-equipo.spec.ts`: la bitácora los da en verde (8/8 y 2/2), y en `acondicionamiento.spec.ts` revisé el diff, que es solo la aserción enmendada por R29. El MCP del grafo no se usó: este worktree no está indexado (design, «Lo que ya existe»), así que la exploración fue con Grep/Read.
