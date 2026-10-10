# review QC-218 — acondicionar-con-equipo

Reviewer, 2026-10-09. Worktree `.worktrees/QC-218-acondicionar-con-equipo`. Diff revisado:
`7b900b81..b866ee50` (39301f95, f15aed9b, 55737b84, d86d5618, a20b35d8, 11dde9a7, b866ee50).
MCP del grafo no consultado: revisión por Grep/Read y `git diff`.

## Verificación ejecutada por el reviewer

`./init.sh` no se corrió (OOM en local; el gate es `gate-completo` en CI, decisión humana).
`vitest related` se sustituyó por corridas por carpeta.

| Comando | Resultado |
|---|---|
| `pnpm typecheck` | `tsc --noEmit`, exit 0 |
| `pnpm lint` | 0 errores, 7 avisos, todos en archivos ajenos (`confirm-catalog-import.test.ts`, `order-service.test.ts`) |
| `vitest run tests/guards tests/unit/asignaciones tests/unit/asignaciones-ui tests/unit/errores tests/unit/shared tests/unit/recetas-ui tests/unit/identity tests/unit/composition` | 294 archivos, 5168 tests en verde, 38 omitidos |
| `vitest run` de los otros tests que escanean `e2e/` (scope/alcance de unidades, recetas, proveedores, pedidos, inventario, documentos, clientes, grupos, login-skin, e2e-helpers) | 190 en verde, 1 rojo: `tests/unit/recetas/scope.test.ts`, que está en `tests/baseline-rojos.json` |
| `vitest run tests/integration/asignaciones` + `identity/assignment-directory` + `pedidos/company-scope` + `pedidos/order-conditioning`, con `DATABASE_URL` del `.env` raíz | 26 archivos, 204 tests en verde, 0 omitidos |

E2E (Playwright): no los corrió el reviewer. La salida local está en la bitácora (2 passed y 8 passed). Los repite el CI.

## Checklist

### Especificación
- [x] `requirements.md` con R1–R36 en EARS.
- [x] `design.md`: § 8 tiene siete alternativas descartadas.
- [x] `tasks.md`: T1–T18 en `[x]`. T18 da `./init.sh` por cumplido, sustituido por la decisión humana: ver m6.
- [x] `design.md` abre con `## Lo que ya existe`, con contenido. El diff no re-crea nada de esa lista:
  - `CountdownTimer` se reutiliza tal cual;
  - `canBeResponsible` y `MAX_CANDIDATES` se importan;
  - la copia de `uniqueIdList` está justificada en § 3.1;
  - el selector calca la forma visual, como justifica § 8 alt. 4.

### Equipo
- [x] La rama se publicó con `wt.sh new`. El reviewer no verifica el assignee: es del leader.

### Trazabilidad
- [x] La bitácora trae el mapa `R<n> -> test` de R1–R36.
- [x] Cada R tiene al menos un test con aserciones reales. Comprobados a mano:
  - R12, R22, R24 y R29 en `start-conditioning-team.int.test.ts`, que cubre rollback real, carrera real, «Mis asignados», responsables intactos y `order_conditioning_taken`;
  - R23 y R32 en `conditioning-team-constraints.int.test.ts`, con SQLSTATE 23503/23514/23505, RLS forzada y DOWN leído del archivo;
  - R14 en `conditioning-team-repository.int.test.ts`;
  - R33 y R34 en `e2e/acondicionar-con-equipo.spec.ts`;
  - R35 en `e2e/acondicionamiento.spec.ts` (l. 432–433).
- [x] R4 se apoya en tests preexistentes de columnas, como pide T15. Ver m4.

### Calidad de código
- [x] Typecheck y lint, sin errores.
- [ ] `gate-completo` en CI: **pendiente**, es condición de merge (no la verifica este review).
- [x] Flujo crítico (permisos): hay E2E Playwright que lo cubre, y su salida local está en la bitácora.
- [x] Sin dependencias nuevas: `package.json` y `pnpm-lock.yaml` fuera del diff (R36).

### Seguridad y configuración
- [x] Sin secretos ni webhooks.
- [x] Nada dependiente de entorno quedó en el código. `CONDITIONING_WAIT_SECONDS = 5` es regla de negocio (D6), no configuración.

### Datos y seguridad (checkpoints-proyecto)
- [x] `order_conditioning_team_members` tiene `company_id` NOT NULL y FK compuestas con `company_id` hacia `orders`, `users` y `work_groups`.
- [x] Las consultas filtran por empresa:
  - `listByOrderInCompany`;
  - `listSnapshotsAliveInCompany`, que filtra por `company_id` en grupos y en miembros;
  - los snapshots y refs de `identity`.
- [x] Hay tests del cruce entre empresas:
  - la base, en constraints int R23;
  - la lectura, en repository int «filtra por empresa y por pedido»;
  - los grupos, en assignment-directory int «solo grupos vivos de la empresa»;
  - `work_group_not_found` y `user_not_found`, en unit R16.
- [x] Los permisos se validan en `domain/`. La primera línea es `requirePermission`:
  - en `start-conditioning`, `list-conditioning-team-candidates` y `get-conditioning-order`;
  - lo prueban los tests R19 y R30, la fachada y `acondicionamiento-rol.test.ts` (R31).
- [x] RLS `ENABLE` + `FORCE` (R32), con su test.
- [x] Acceso a datos solo por adaptadores `driven` Prisma.
- [x] Migración versionada y reversible:
  - UP: `CREATE TABLE`, 3 índices, 2 `CHECK`, 3 FK sobre la tabla hija y RLS; no ejecuta DDL sobre tablas existentes ni deja `DROP CONSTRAINT` de drift;
  - DOWN: `DROP TABLE` sin CASCADE, que revierte exactamente;
  - la bitácora documenta UP → `db:rollback` → UP sobre la base local;
  - cumple `docs/architecture.md` (l. 312, 447, 593–620, 761–767).

### Módulos hexagonales
- [x] `domain/` y `ports/` solo importan `zod` y los contratos `@/lib/modules/identity` y `@/lib/modules/pedidos`.
- [x] El adaptador `driving` (`order-conditioning-actions.ts`) pide todo a `lib/composition`, y no se reexporta desde el barrel.
- [x] `lib/shared/routes.ts` solo gana una constante.
- [x] El modelo lleva `/// @module asignaciones`.
- [x] La lógica vive en `domain/`; la Server Action solo traduce `FormData` y errores.

### Permisos y UI
- [x] La página protege con `requirePagePermission`; los componentes reciben todo por props; las mutaciones van por Server Actions.
- [x] Multiplataforma (regla 6), sin hallazgos:
  - `max-h-[100dvh]` con scroll;
  - `min-h-11 min-w-11` en botones y casillas;
  - búsqueda en `text-base`;
  - sin `:hover`, sin `100vh` y sin librería nueva.
- [x] Ningún archivo decide por nombre de rol. «Administrador» se decide por `canBeResponsible` (N1).

### Comentarios (regla 9)
- [x] Ninguna línea añadida en `app/`, `lib/` ni `db/` cita `QC-<n>`, `R<n>`, `D<n>`, `design.md` ni «decisión cerrada». Lo comprobó un grep sobre las líneas `+` del diff.

### Listas cerradas que censan `e2e/` (lección de QC-217)
- [x] `E2E_ESPERADOS` (`guard-identificador-de-request.test.ts`): tiene alta para `acondicionar-con-equipo.spec.ts`, y también para la migración nueva.
- [x] `data-table-alcance`: el spec nuevo no menciona `data-table` (0 apariciones), así que no le corresponde alta. El test, en verde.
- [x] El resto de tests que escanean `e2e/` está en verde con el árbol completo, salvo el rojo de baseline:
  - las guardias `guard-dobles-e2e`, `guard-e2e-landing`, `guard-autorizacion-por-permiso` y `guard-arquitectura-modulos`, entre otras;
  - los `scope` y `alcance` por módulo.

### Archivos compartidos con QC-223 y QC-222
- [x] `a20b35d8` (`schema.prisma`, `composition/index.ts`, `error-catalog.ts`, `error-codes.ts` y la guardia del identificador) y `11dde9a7` (`routes.ts`) son **solo adiciones**: 66 inserciones y 0 borrados por `--numstat`.
- [x] Ningún otro commit del rango toca esos seis archivos.

## Hallazgos

Ninguno BLOQUEANTE.

- **m1 (menor). Título y comentario desfasados en `e2e/acondicionamiento.spec.ts`.**
  - Qué contradice la aserción nueva de R35:
    - el título del test (l. 375) dice «abre el detalle sin botones»;
    - el comentario de la l. 420 dice «ningún botón»;
    - las l. 5 y 125 siguen hablando de «detalle de solo lectura».
  - R35 prohíbe cambiar otras **aserciones**, no el texto. Se pueden alinear con «el único botón es Acondicionar» sin violar R35.
  - No bloquea: no altera lo que el test verifica.
- **m2 (menor). FK nueva sobre `orders` y `tests/integration/pedidos/company-scope.int.test.ts`.**
  - El cambio es correcto y necesario: añade `order_conditioning_team_members_order_id_company_id_fkey` a `drop/restoreForeignKeysDependingOnOrdersCompanyKey`, con el mismo patrón que QC-82, y el test pasa.
  - Riesgo de coordinación: cualquier feature en vuelo que añada otra FK hacia `orders(id, company_id)` tendrá que sumar la suya a la misma lista. Al sincronizar (F2.3), la segunda en mergear la une.
- **m3 (menor). Archivos fuera de «Archivos esperados».**
  - Son nueve, todos justificados en la bitácora: dobles de tipo, censos cerrados (`aislamiento.json`, `recipe-route-contract`, `session-once-per-request-actions`), el catálogo de errores, el helper de transacción y `finished-orders.int` por la entrada nueva de comenzar.
  - Todos son de `tests/`, sin aserciones relajadas: `finished-orders.int` solo cambia la llamada.
  - `tasks.md > Archivos esperados` no se actualizó con ellos.
- **m4 (menor). R4 sin test nuevo.** Lo cubren los tests de columnas existentes:
  - `conditioning-orders-columns.test.tsx`, por el conjunto exacto de columnas y porque el único enlace es el número;
  - `finished-orders-columns.test.tsx`, por «ninguna columna es una acción».

  Basta como verificación, pero ningún test nombra R4. Un caso explícito «ninguna fila tiene botón» en esas suites lo haría trazable sin interpretación.
- **m5 (menor). Desviación de T4 / `design.md` § 2.4.**
  - El design dice que las funciones exportadas delegan en la fábrica; el código hace lo contrario: la fábrica delega en ellas, con un `db` opcional.
  - El efecto es el mismo: una sola implementación, y la escritura va sobre `tx`.
  - El motivo es válido: `qc145-estado-solo-planta.test.ts` fija esos nombres.
  - El «Hecho» de T4 en `tasks.md` describe lo diseñado, no lo hecho.
- **m6 (menor).** T18 está en `[x]` sin `./init.sh`, por decisión humana; el gate efectivo es `gate-completo` en CI. Además cita `progress/impl_QC-218.md`, pero el archivo real es `progress/impl_QC-218-acondicionar-con-equipo.md`.
- **m7 (menor, aceptado).** Los commits de tanda (39301f95…d86d5618) no compilan aislados. Desde `a20b35d8` sí compila. Es una decisión aceptada.
- **m8 (menor, informativo).** `origin/dev` avanzó (QC-222, QC-233, QC-219 docs) y no es ancestro de HEAD.
  - Solapan en archivos: `lib/shared/routes.ts`, `tests/guards/guard-identificador-de-request.test.ts`, `tests/integration/aislamiento.json` y `tests/unit/recetas-ui/recipe-route-contract.test.ts`. Se resuelven en F2.3.
  - Ninguna migración de `dev` es posterior a `20261008150000`, así que no hace falta subir el timestamp.

## Veredicto

**OK**

Condición de merge, que no es hallazgo del review: `gate-completo` en verde en el PR, después de sincronizar con `dev`.
