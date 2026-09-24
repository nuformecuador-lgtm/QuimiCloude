# QC-142 — permiso-propio-de-documentos · tasks.md

> Worktree `.worktrees/QC-142-permiso-propio-de-documentos`, rama
> `feature/QC-142-permiso-propio-de-documentos`. Un commit por task
> (`feat(QC-142): …` / `test(QC-142): …` / `chore(QC-142): …`).

## Reglas de ejecución (valen para todas las tasks)

- **Base propia.** La migración, los tests de integración y el E2E corren contra una base propia
  **`QuimiCloude_QC142`**, montada para este worktree (`docs/worktrees.md`). **Nunca** contra la
  base que apunta el `.env` de la raíz. Antes de correr nada que toque Postgres, comprueba que
  `DATABASE_URL` y `DIRECT_URL` del entorno del proceso nombran `QuimiCloude_QC142`.
- **Un solo E2E a la vez en la máquina.** Antes de `pnpm run e2e`, comprueba que ningún otro
  worktree tiene Playwright o `next dev` de E2E corriendo; si lo hay, espera. Nunca dos a la vez.
- **Comentarios.** En producción (`lib/`, `db/`) ningún comentario cita ficha, `R<n>`, `D<n>`,
  `design.md` ni «decisión cerrada»; bloques ≤ ~5 líneas; se limpian solo las líneas que toca la
  rama. En tests, `R<n>` va en el nombre del caso.
- **Ningún número total** del catálogo ni de asignaciones del seed en ningún test nuevo o tocado
  (R3).
- Cierre de tanda: `./init.sh --rapido`. Cierre de feature y antes del PR: `./init.sh` completo.

## Tasks

### T1 — Catálogo y seed

- [ ] Añadir `documentos.consultar` y `documentos.modificar` al final de `PERMISSIONS`, con las
  descripciones de `design.md > 2.1`; añadirlos al final del conjunto del Administrador en
  `SEED_ROLE_PERMISSIONS`. Reescribir la línea que afirma «dieciocho permisos» y añadir el párrafo
  de enmienda (≤ 5 líneas, sin citas).
- **Archivos:** `lib/modules/identity/domain/permissions.ts`.
- **Depende de:** nada.
- **Hecho cuando:** `pnpm run typecheck` pasa; el párrafo nuevo no casa con
  `/QC-\d+|\bR\d+\b|design\.md|decisi[oó]n cerrada/i`.

### T2 — La constante del módulo documentos

- [ ] `DOCUMENT_UPLOAD_PERMISSION` pasa a `'documentos.modificar'`; JSDoc de la constante reescrito
  corto (permiso de escritura propio del módulo), sin la frase «el catálogo es cerrado y no se
  amplía» ni la justificación por proveedores.
- **Archivos:** `lib/modules/documentos/domain/actor.ts`.
- **Depende de:** T1 (el literal tiene que existir en `PermissionCode` para compilar).
- **Hecho cuando:** typecheck pasa; `rg "proveedores\." lib/modules/documentos` no devuelve nada.

### T3 [P] — Migración de datos con su `down`

- [ ] Crear `migration.sql` y `down.sql` según `design.md > 3.1` y `> 3.2`, escritos a mano, con
  cabecera corta sin citas.
- [ ] Añadir `'20260924130000_documents_permissions'` al final de `MIGRACIONES_ESPERADAS`.
- **Archivos:** `db/migrations/20260924130000_documents_permissions/migration.sql`,
  `db/migrations/20260924130000_documents_permissions/down.sql`,
  `tests/guards/guard-identificador-de-request.test.ts`.
- **Depende de:** T1 (las descripciones del SQL copian las del catálogo).
- **Hecho cuando:** sobre `QuimiCloude_QC142`, `pnpm run db:migrate` aplica; `pnpm run db:rollback`
  revierte y deja `_prisma_migrations` coherente; volver a aplicar funciona. Ningún nombre de
  migración duplica uno de `dev`.

### T4 [P] — Test estático de la migración (R4, R9, R10, R11, R21)

- [ ] Predicados puros exportados sobre el SQL real y sobre una copia mutada en memoria: el UP son
  exactamente tres `INSERT` con `ON CONFLICT ... DO NOTHING` y cero DDL; códigos, módulos, acciones
  y descripciones importados de `PERMISSIONS` coinciden con el SQL; la herencia filtra por
  `proveedores.modificar` y solo inserta `documentos.modificar`; el Administrador se resuelve por
  nombre; el DOWN son dos `DELETE` acotados a los dos códigos, asignaciones primero, sin `CASCADE`.
  Carpeta localizada por patrón `/_documents_permissions$/`.
- **Archivos:** `tests/unit/identity/schema/documents-permissions-migration.test.ts` (nuevo).
- **Depende de:** T3.
- **Hecho cuando:** verde sobre el SQL real y cada mutación pone rojo su predicado.

### T5 — Test de integración de la migración (R4-R10)

- [ ] Patrón de `packer-role-migration.int.test.ts`: cada caso en transacción revertida; «antes de
  la migración» simulado borrando las dos filas y sus asignaciones; SQL leído del archivo.
  Casos: UP crea las dos filas iguales al catálogo (R4); Administrador con las dos (R5); rol
  efímero con `proveedores.modificar` gana solo `documentos.modificar` (R6, R7); rol efímero sin
  él y Operador/Empacador sin ninguna (R7); ninguna asignación previa desaparece (R8); UP dos veces
  y UP tras seed sin error ni duplicados (R9); DOWN retira todo `documentos.*` de cualquier rol y
  deja idénticas las demás filas de `permissions`, `role_permissions` y `roles` (R10).
- **Archivos:** `tests/integration/identity/documents-permissions-migration.int.test.ts` (nuevo).
- **Depende de:** T3.
- **Hecho cuando:** verde contra `QuimiCloude_QC142` con la migración aplicada; nunca contra la
  base del `.env`.

### T6 [P] — Tests del catálogo y del seed sin total fijo (R1, R2, R12, R13)

- [ ] Aplicar la regla de `design.md > 5` a los sitios 3, 4, 10 y 11 de `design.md > 1.3`; casos
  nuevos con `R<n>` en el nombre: las dos entradas con `toContainEqual` (R1); «previo + dos, ningún
  otro `documentos.*`» (R2); Administrador incluye las dos, Operador y Empacador exactos (R12);
  seed sobre base vacía y sembrada deja a cada rol su conjunto derivado de
  `SEED_ROLE_PERMISSIONS`, segunda corrida sin cambios (R13).
- **Archivos:** `tests/unit/identity/permissions.test.ts`,
  `tests/unit/navegacion/qc75-convenciones.test.ts`,
  `tests/unit/identity/seed/seed-initial-access.test.ts`,
  `tests/integration/identity/identity-seed.int.test.ts`.
- **Depende de:** T1.
- **Hecho cuando:** los cuatro verdes (el de integración sobre `QuimiCloude_QC142`) y ninguno
  contiene un total literal.

### T7 [P] — Anclas de guardias y de alcance de otras fichas sin total fijo (R3)

- [ ] Aplicar la regla de `design.md > 5` a los sitios 1, 2, 6, 7, 8 y 9 de `design.md > 1.3`.
- **Archivos:** `tests/guards/guard-permisos-sembrados.test.ts`,
  `tests/guards/guard-nav-permisos-declarados.test.ts`,
  `tests/unit/identity/roles/scope.test.ts`, `tests/unit/identity/grupos/scope.test.ts`,
  `tests/unit/asignaciones/schema/order-assignments-migration.test.ts`,
  `tests/unit/pedidos/qc145-estado-solo-planta.test.ts`.
- **Depende de:** T1.
- **Hecho cuando:** todos verdes y cada ancla sigue fallando si `PERMISSIONS` se vacía (compruébalo
  mutando en local, sin commitear).

### T8 — Test que hace cumplir R3

- [ ] Predicado puro exportado que detecta un total literal del catálogo o del seed en un fuente
  de test (fuera de comentarios), con casos sintéticos que disparan y simétricos que no; barrido
  real de `tests/` y `e2e/` en verde.
- **Archivos:** `tests/unit/identity/catalogo-sin-total-fijo.test.ts` (nuevo).
- **Depende de:** T6, T7.
- **Hecho cuando:** verde sobre el árbol; rojo si se reintroduce `expect(PERMISSIONS.length).toBe(20)`
  en un fuente sintético.

### T9 [P] — Autorización del módulo documentos (R14-R18)

- [ ] Reescribir el bloque «el permiso exigido sale del catálogo cerrado» de `authorization.test.ts`:
  la constante es `documentos.modificar`, está en el catálogo, el Administrador la tiene y Operador
  y Empacador no (leído de `SEED_ROLE_PERMISSIONS`), sin total (R12, R14); el literal sigue escrito
  una vez en el módulo y ningún fuente del módulo compara nombres de rol (R17).
- [ ] En los tres unit de caso de uso: actor con `proveedores.modificar` + `proveedores.consultar`
  sin `documentos.modificar` → `UnauthorizedError` y ningún puerto tocado (R15); actor con solo
  `documentos.consultar` → rechazo (R15); actor con solo `documentos.modificar` → autorizado (R16);
  la primera comprobación es el permiso, antes del esquema (R14).
- [ ] En `read-document.test.ts`: actor sin ningún permiso lee y descarga una ruta de su empresa
  (R18).
- **Archivos:** `tests/unit/documentos/authorization.test.ts`,
  `tests/unit/documentos/issue-upload-links.test.ts`,
  `tests/unit/documentos/enqueue-batch.test.ts`,
  `tests/unit/documentos/get-batch-status.test.ts`,
  `tests/unit/documentos/read-document.test.ts`.
- **Depende de:** T2.
- **Hecho cuando:** los cinco verdes; revertir T2 en local pone rojo al menos un caso de R15 y uno
  de R16.

### T10 — E2E de documentos (R19, R20)

- [ ] Comentario de las líneas 133-135 corregido (el Administrador sube por `documentos.modificar`).
- [ ] Caso nuevo según `design.md > 6`: rol efímero `qc107_e2e_…` con `proveedores.consultar` y
  `proveedores.modificar`, usuario activo en la misma empresa, intento de subida → error
  `data-code="unauthorized"`, cero `PUT` interceptados, conteo de tandas de la empresa igual antes y
  después. Limpieza en `afterAll` (usuario → asignaciones del rol → rol) y de huérfanos por prefijo.
  Nombre del caso con `R20` de esta ficha, distinguible del `(R20)` de QC-107.
- **Archivos:** `e2e/documentos.spec.ts`.
- **Depende de:** T2, T3 (la base del E2E necesita la migración y el seed aplicados).
- **Hecho cuando:** `pnpm run e2e -- documentos` verde en Chromium y WebKit contra
  `QuimiCloude_QC142` sembrada, con **un solo E2E corriendo en la máquina**; el caso R19 existente
  sigue verde sin cambiar su cuerpo.

### T11 — Cierre

- [ ] `progress/impl_QC-142-permiso-propio-de-documentos.md` con el mapa `R<n> -> test` de
  `design.md > 7` (R1-R21, ninguno sin test).
- [ ] `./init.sh` completo en verde, con la base `QuimiCloude_QC142`.
- [ ] Sin cambios en `package.json`, `pnpm-lock.yaml`, `db/schema.prisma` ni `docs/dependencias.md`
  (R21): `git diff --stat dev...HEAD` no los lista.
- **Archivos:** `progress/impl_QC-142-permiso-propio-de-documentos.md`.
- **Depende de:** T1-T10.
- **Hecho cuando:** gate completo verde y mapa completo.

## Grafo

```
T1 ──┬── T2 ── T9 [P]
     │     └──────────┐
     ├── T3 [P] ─┬── T4 [P]
     │           ├── T5
     │           └── T10 (tras T2 y T3)
     ├── T6 [P] ─┐
     └── T7 [P] ─┴── T8
T1..T10 ── T11
```

Paralelizables tras T1: T2, T3, T6, T7. Tras T3: T4 y T5. T9 tras T2. T5 y T10 tocan Postgres:
no los corras a la vez que otro proceso de E2E sobre la misma máquina.
