# review QC-223 — entregar-producto-terminado (F2.2, vuelta 1)

- Rama `feature/QC-223-entregar-producto-terminado`, HEAD `87b615cf`, diff contra `origin/dev`
  (92 archivos).
- Revisado contra: `specs/QC-223-entregar-producto-terminado/{requirements,design,tasks}.md`,
  `progress/impl_QC-223-entregar-producto-terminado.md`, `CHECKPOINTS.md`,
  `docs/checkpoints-proyecto.md` y `docs/perfil-agentes.md > reviewer`.
- No corrí `./init.sh` (decisión del humano: la máquina local se queda sin memoria). El gate es
  CI run 37946598295 del PR #178. Cuando revisé, `estatico` (typecheck y lint) y `vitest` shard
  1/3 estaban en verde; los shards 2/3 y 3/3 y el E2E seguían en curso.
- No usé el MCP del grafo. Trabajé con Grep, Read y git.

## Veredicto: **APROBADO** (OK)

No hay hallazgos bloqueantes. Hay tres hallazgos menores. La aprobación queda condicionada a que
`gate-completo` del run 37946598295 termine en verde (CHECKPOINTS > Verificación final).

## Verificación ejecutable (salida real, en el worktree)

| Qué | Resultado |
|---|---|
| Unit de la feature: `deliver-order`, `get-order-delivery`, `order-delivery`, `order-delivery-append-only`, `order-actions-delivery`, `tests/unit/pedidos-ui`, `finished-goods-dispatch*`, `batch-history`, las dos migraciones, `search-order-customer-options` | `Test Files 55 passed (55)`, `Tests 955 passed, 3 skipped` |
| `.int` de la feature: `pedidos/order-delivery*` (4), `deliverable-batches`, `finished-goods-dispatch`, `ledger-cuadre`, `delivery-permission-migration` | `Test Files 8 passed (8)`, `Tests 50 passed (50)` |
| Guardias (`vitest run guard`) | `Test Files 55 passed (55)`, `Tests 747 passed, 11 skipped` |
| `order-delivery.int` junto con `session-once-per-request-render` | `Test Files 2 passed (2)`, `Tests 19 passed (19)` |
| Typecheck y lint | No los corrí en local. El job `estatico` de CI está en verde. |
| `git diff origin/dev...HEAD -- package.json pnpm-lock.yaml` | vacío (R40) |

## Checklist

### Especificación
- [x] `requirements.md` tiene R1–R40 en EARS.
- [x] `design.md` tiene alternativas descartadas (§9: A1 `inventario` dueño, A2 módulo `entregas`).
- [x] `tasks.md`: 13 tasks `[x]` y ninguna `[ ]`.
- [x] `design.md` abre con `## Lo que ya existe` y no está vacía. El diff reutiliza las piezas
  listadas y no recrea ninguna: `withOrderTransaction`, `lockAliveById`, `setStatus`,
  `findPresentationLinesForFinish`, `requireAliveCustomer`, `OrderCustomerPicker` (con
  `purpose: 'deliver'`), `writeMovement` y `recalculateProductStock`.

### Trazabilidad
- [x] `progress/impl_...md` contiene el mapa R1–R40 → test.
- [x] Comprobé con un script que cada caso citado en el mapa existe en su archivo: no falta
  ninguno. Ningún test nuevo usa `.skip`, `.only` ni `.todo`. Los `ctx.skip` que hay
  (`qc75-convenciones`, `data-table-alcance`) son de casos que dependen de que exista el rango git.
- [x] Leí los tests de R2, R5, R17, R21, R22, R25–R30: hacen aserciones reales, no están vacíos.
  R28 se prueba con concurrencia real contra Postgres (`order-delivery-concurrency.int`).
- [x] R40: no hay diff en `package.json` y `guard-dependencias-aprobadas` está en verde.

### Equipo
- [x] La rama se publicó con el candado (`progress/features/QC-223.md`). El assignee de Jira
  no lo verifiqué: no está en disco.

### Calidad de código
- [x] Typecheck y lint: el job `estatico` de CI está en verde.
- [ ] `gate-completo`: en curso (run 37946598295).
- [x] Flujo crítico (movimiento de inventario): el E2E de Playwright
  `e2e/entregar-producto-terminado.spec.ts` existe y su salida local está en el log de impl
  (l. 492).
- [x] Sin dependencias nuevas.

### Seguridad y configuración
- [x] No hay secretos ni valores de entorno escritos en el código.
- [x] No hay webhooks.

### Datos y seguridad (checkpoints-proyecto)
- [x] `order_deliveries` y `order_delivery_lines` llevan `company_id` y FK compuestas con
  `company_id` hacia el pedido, el cliente, el lote, la línea del reparto y el usuario.
  `inventory_movements.order_delivery_id` también es compuesta.
- [x] RLS `ENABLE` y `FORCE` en las dos tablas nuevas.
- [x] El permiso `entregas.modificar` se valida en `domain/`: `deliver-order.ts:171`,
  `get-order-delivery.ts:61` y `search-order-customer-options.ts:46`. Lo hace antes de validar la
  entrada y tiene tests (R2, R3).
- [x] Todas las consultas filtran por la empresa del actor. Hay tests del rechazo cruzado: R5,
  R17, R19, R21, R31, y `sumDeliveredPackages` con el ámbito de B.
- [x] Las tres migraciones tienen su `down.sql`, y hay un test del ciclo
  (`order-deliveries-migration.test.ts`, `delivery-permission-migration.*`).
- [x] El acceso a datos pasa solo por adaptadores `driven` de Prisma, sin cliente de Supabase.

### Módulos hexagonales
- [x] `domain/` y `ports/` no importan framework ni Prisma. `pedidos` consume `inventario` y
  `clientes` solo por su barrel. `checkDelivery` sale de `./order-delivery` por la decisión del
  ciclo.
- [x] Las Server Actions (`order-actions.ts`) solo llaman a la fachada de `lib/composition`; la
  lógica está en `domain/`.
- [x] Los barrels no reexportan ningún `'use server'`.
- [x] Los modelos nuevos llevan `/// @module pedidos`.

### Permisos y UI
- [x] La acción «Entregar» se pinta solo con `canDeliver`, que resuelve el servidor
  (`order-list-section.tsx`), y solo en `TERMINADO` (`order-row-actions.tsx`). Una sola lectura
  de la sesión.
- [x] Mutaciones por Server Actions.
- [x] Multiplataforma: el input de envases tiene `min-h-11 text-base` y `inputMode="numeric"`.
  Los botones del pie usan `TOUCH_TARGET`. El sheet usa `safe-area-inset-bottom`. No hay `100vh`
  ni hover como única vía de activación. Los `text-xs` del diff son etiquetas `<dt>`, no inputs.

### Reglas del proyecto (perfil-agentes > reviewer)
- [x] 5 Calidad y seguridad: RLS, capas separadas, sin hardcode de contexto.
- [x] 6 Multiplataforma: ver arriba.
- [x] 7 Dependencias: ninguna nueva.
- [x] 8 Aislamiento por empresa: ver arriba.
- [x] 9 Comentarios: ninguna línea añadida en `app/`, `lib/`, `db/` o `components/` cita
  `QC-<n>`, `R<n>`, `design.md` ni «decisión cerrada».

## Hallazgos

### Bloqueantes
Ninguno.

### Menores

1. **menor — un doble envío concurrente con la misma clave que completa el pedido responde
   `action_not_allowed` y no `already_registered`.**
   `lib/modules/pedidos/domain/deliver-order.ts:87-89` frente a `:97-107`.
   - Las dos peticiones pasan la lectura previa de la clave (`:180`) antes de que la primera
     confirme.
   - La primera deja el pedido `ENTREGADO`. La segunda, al conseguir el bloqueo, ve `ENTREGADO`
     y lanza `ActionNotAllowedError` en `:89` sin llegar al `create` que detecta la clave
     duplicada.
   - No se escribe nada de más: R29 y R30 se cumplen en lo que queda escrito.
   - El sheet muestra un error aunque la entrega quedó registrada. Al reintentar, con el mismo
     borrador y la misma clave, responde `already_registered` y se cierra, así que se corrige
     solo.
   - El orden «la clave antes que el estado» que decidió el humano se cumple fuera de la
     transacción, pero no dentro de ella.
   - Sugerencia, para esta ficha o para una de deuda: dentro de la transacción, ante un estado
     que no es `TERMINADO`, volver a mirar la clave antes de responder `action_not_allowed`.
   - Ningún test cubre este caso: `order-delivery-concurrency.int` usa claves distintas.

2. **menor — R22 y el diseño no coinciden en el `customerId` sin forma de uuid.**
   - R22 dice que «un identificador sin forma de uuid» es `invalid_input`.
   - `deliver-order.ts:43` acepta `customerId: z.string()` y deja la forma a
     `requireAliveCustomer`, que responde `customer_not_found` (`order-customer.ts:48`).
   - Es lo que fija `design.md:280`, y el test «R21: un cliente sin forma de uuid es
     customer_not_found» lo prueba. No falla ningún requisito de cara al usuario, pero
     requirements y design se contradicen.
   - Conviene anotar la excepción en `requirements.md` (R22) en la próxima enmienda.

3. **menor — el `Cierre` de `progress/features/QC-223.md` está vacío** («—»). Le corresponde a
   F3, después del merge. Lo anoto porque CHECKPOINTS lo exige para `done`, no porque bloquee
   F2.2.

## Riesgo de CI: `order-delivery.int` R5 y `session-once-per-request-render`

Busqué estado compartido en la base o problemas de aislamiento entre tests. **No encontré
ninguno.**

- **Empresas efímeras.** `tests/helpers/order-delivery-seed.ts` crea empresas, usuarios, roles,
  tipos de documento y unidades con `randomUUID`. Cada caso las borra en un `finally`, en orden
  de FK.
- **Contador de secuencia.** El contador de módulo `secuencia = 800_000` se reinicia en cada
  archivo. Aun así no puede chocar, porque el único es `(company_id, order_year, order_sequence)`
  (`db/schema.prisma:732`) y cada empresa es nueva.
- **Sin conteos globales.** Los conteos de `escritoPorEntregas` y las aserciones de R5 son por
  `companyId` o por id, no globales.
- **Proyectos distintos.** Los `.int` corren con `fileParallelism: false`.
  `session-once-per-request-render` es del proyecto `ui` (jsdom), así que no comparte base con
  `order-delivery.int`.
- **La sesión se lee una vez.** El diff no toca ese test. `order-list-section.tsx` sigue leyendo
  la sesión una sola vez, ahora en `loadRowPermissions`, y saca de esa lectura los dos permisos.
- **Juntos pasan.** Los dos archivos juntos pasan en local (`Tests 19 passed (19)`). Solo
  fallaron dentro de un `vitest related` de unos 700 archivos.

**Conclusión:** son flakes de saturación (`docs/verification.md > Los flakes de saturacion`,
plazo de 20 s). No es una fuga de estado.

Riesgo residual, menor y sin hallazgo: `crearEscenario()` corre fuera del `try`. Si falla a
mitad, deja filas huérfanas de una empresa efímera. No contaminan a otros tests porque todo va
acotado por `companyId`.

Si CI los da en rojo:
- volver a lanzar el shard;
- si se repite, mirar si el error es de plazo (`Test timed out`) antes de tratarlo como
  regresión.
