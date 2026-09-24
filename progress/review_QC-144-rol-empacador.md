# review QC-144 — rol-empacador

> Reviewer · F2.2 · rama `feature/QC-144-rol-empacador` · worktree `.worktrees/QC-144-rol-empacador`
> Base `c802c645` · HEAD revisado `8c41c923` (código idéntico a `aaff8cf0`; los dos commits
> posteriores solo tocan `progress/` y `tasks.md`). Spec con la enmienda D10 del 2026-09-22.

## Veredicto: **OK** (aprobado)

0 bloqueantes · 7 menores.

## Checklist

| # | Punto | Estado |
|---|---|---|
| 1 | Trazabilidad R1..R27 -> test concreto que existe, asevera algo y pasa | OK (ver tabla abajo; R24 y R26 por verificación de diff, como fija `design.md > 6`) |
| 2 | Tasks T1..T16 marcadas `[x]` | OK |
| 3 | `CHECKPOINTS.md` | OK, con las notas de abajo |
| 4 | Verificación ejecutable propia | typecheck + lint verdes; suite completa 612/613 archivos verdes; el único rojo es ajeno y pasa aislado (menor 1) |
| 5 | Calidad y seguridad | OK: sin tablas nuevas (no aplica RLS), sin webhooks, sin secretos, sin hardcode de entorno; la autorización sigue siendo por permiso en el servicio |
| 6 | Multiplataforma | No aplica: el diff no toca `app/`, `components/` ni `e2e/` |
| 7 | Dependencias | No aplica: `package.json` y lockfile sin cambios (R26) |
| 8 | Aislamiento por empresa | No aplica al esquema: `db/schema.prisma` sin cambios. `roles` es global por decisión D1 (R3, probado) y la lista de asignados sigue filtrada por empresa (R14, probado con otra empresa) |
| 9 | Comentarios en líneas añadidas/modificadas de producción (`lib/`, `db/`) | OK: ninguna cita a `QC-<n>`, `R<n>`, `design.md` ni «decisión cerrada». Comprobado con grep sobre las líneas `+` del diff y leyendo cada hunk |

### Checkpoints

- Especificación: requirements EARS R1–R27, design con 7 alternativas descartadas, tasks todas `[x]`. OK.
- Trazabilidad: el mapa `R<n> -> test` está en `progress/impl_QC-144-rol-empacador.md` y lo comprobé en el código. OK.
- typecheck / lint / tests: ver punto 4 y menor 1.
- E2E en flujo crítico (permisos): no hay; la decisión cerrada D8 lo difiere a QC-145, con precedente QC-94 -> QC-67 y aprobado por el humano. **QC-145 tiene que traer el E2E como Empacador y como Operador.**
- Datos y seguridad: la migración trae `down.sql`; `db:rollback` probado por el implementer en local, y R21 probado contra Postgres real (sin usuarios revierte limpio; con un usuario Empacador falla con `23503` y no borra nada). OK.
- Módulos hexagonales: solo cambian `identity/domain/{roles,permissions}.ts` (dominio puro) y el barrel. OK.
- Pendientes del leader (no son de la rama): entrada en `progress/history.md` y desmontar el worktree.

## Verificación ejecutada por el reviewer

- `./init.sh` completo sobre `8c41c923`: typecheck y lint verdes; vitest **612 archivos verdes, 1 rojo**:
  `tests/integration/infra/ciclo-de-vida-de-la-base.int.test.ts` (2 casos de R7 con timeout de 20 s,
  en una corrida de 580 s). No está en `tests/baseline-rojos.json`. Aislado,
  `pnpm exec vitest run tests/integration/infra/ciclo-de-vida-de-la-base.int.test.ts` sale **5/5 verde
  en 10 s**. La rama no toca `tests/integration/infra/` ni nada de lo que ejercita ese test. La corrida
  completa del implementer sobre `aaff8cf0` salió verde (exit 0).
- Todos los tests de la rama salen verdes en la corrida completa: `empacador-rol` (10),
  `packer-role-migration` unit (13), `empacador-authorization` (10), `menu-empacador` (4),
  `guard-permisos-no-administrables` (15), `guard-autorizacion-por-permiso` (13), `identity-seed.int` (15),
  `user-crud.int` (41), `assigned-orders.int` (7), `packer-role-migration.int` (4), `role-catalog.int` (7).
- Comprobé que la rama no toca `db/schema.prisma`, `package.json`, `pnpm-lock.yaml`, `e2e/`, `app/`,
  `components/`, `middleware.ts`, `lib/shared/`, `lib/modules/asignaciones/`, `lib/modules/inventario/`
  ni `scripts/`.

## Trazabilidad comprobada

| R | Test | Nota |
|---|---|---|
| R1 | `tests/unit/identity/roles/empacador-rol.test.ts` › `R1 — …` (3 casos) | fila, descripción, los otros dos intactos, exactamente tres |
| R2 | `empacador-rol.test.ts` › `R2 — …` | barrido real (superconjunto de `lib/`, `app/` y `middleware.ts`) + sintético con tres tipos de comilla + simétrico |
| R3 | `empacador-rol.test.ts` › `R3 — …`; `identity-seed.int` (una sola fila Empacador tras cada corrida); `user-crud.int` › `QC-144 R3 — …` | global, y asignable en dos empresas |
| R4 | `tests/unit/identity/permissions.test.ts` › `QC-144 R4` | `toContainEqual` con los cuatro campos |
| R5 | `permissions.test.ts` › `QC-144 R5` + recuentos 15 -> 16 en los unitarios y guardias de `design.md > 5` | ninguno se relajó a `toContain` ni a `toBeGreaterThan` |
| R6 | `permissions.test.ts` › `R6: …` (2 casos) | lee el fuente real: ≤5 líneas, «enmienda», `lib/modules/`, sin citas, y la frase del recuento tampoco |
| R7 | `guard-permisos-no-administrables` (barrido de producción) + `packer-role-migration.test.ts` › `(R7, R17)` | reforzado por R27 |
| R8 | `permissions.test.ts` › `QC-144 R8` (exacto y en negativo); `seed-initial-access.test.ts`; `identity-seed.int` › R25 | |
| R9 | `permissions.test.ts` › `QC-144 R9` | `toEqual` contra la lista copiada a mano |
| R10 | `permissions.test.ts` › `QC-144 R10` | |
| R11 | `guard-autorizacion-por-permiso.test.ts` › `QC-144 R11` (3 casos) + ancla tensada | literal, constante, comentario que no dispara |
| R12 | `tests/unit/asignaciones/empacador-authorization.test.ts` › `QC-144 R12` (4 casos) | actor construido con `SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]` |
| R13 | `empacador-authorization.test.ts` › `QC-144 R13` (6 casos) | con dobles que explotan si se tocan; cubre `inventario.consultar`, `inventario.modificar` y `asignaciones.modificar` |
| R14 | `tests/integration/asignaciones/assigned-orders.int.test.ts` › `(integracion, R14)` | contra Postgres real: otro responsable y otra empresa excluidos |
| R15 | `tests/unit/navegacion/menu-empacador.test.ts` › `R15 — …` (4 casos) | incluye el simétrico con el Operador |
| R16 | `empacador-rol.test.ts` › `R16 — …` | ver menor 4 |
| R17 | `tests/integration/identity/packer-role-migration.int.test.ts` › `R17: …` + estáticos | SQL leído del archivo |
| R18 | `packer-role-migration.int` › `R18: …` + estático `(R18)` | `updated_at` incluido |
| R19 | `identity-seed.int` › «la primera corrida sobre base vacia crea los tres roles…» y «si solo falta el rol Operador…» | ver menor 5 |
| R20 | `packer-role-migration.test.ts` › `R20, R26: …` | con caso de sensibilidad |
| R21 | `packer-role-migration.int` › `R21: …` (2 casos) + estático `(R21)` | |
| R22 | `role-catalog.int` › `R22 — …` + caso preexistente del Administrador | |
| R23 | `user-crud.int` › `QC-144 R23 — …` (4 casos) | por el caso de uso completo de `lib/composition` |
| R24 | diff sin `e2e/` | comprobado |
| R25 | `identity-seed.int` › `R25 — …` | recorre cada rol de `SEED_ROLES` |
| R26 | diff sin `package.json` ni `db/schema.prisma` + `guard-dependencias-aprobadas` + estático sin DDL | comprobado |
| R27 | `guard-permisos-no-administrables` › `R27: …` (3 casos) + comentarios que no disparan + anclas tensadas (seed escribe en las tres tablas, `model Role {`) | barre `lib/`, `app/`, `components/`, `hooks/` y la raíz |

## Los puntos que el implementer dejó a juicio del reviewer

1. **Citas a fichas ajenas (QC-74, QC-66, QC-86, QC-19, QC-88) quitadas al reenvolver párrafos.**
   Correcto. `docs/conventions.md > Comentarios`: «al tocar un archivo se limpian los comentarios de
   las líneas que toca la rama». Solo se limpiaron líneas que la rama ya modificaba; las líneas
   preexistentes intactas (p. ej. `permissions.ts:2-4`, el `(R1)` de la línea siguiente al recuento,
   `// QC-74 T1` de `index.ts`) se dejaron como estaban. No es un hallazgo.
2. **Frase del Empacador en párrafo propio en el JSDoc de `SEED_ROLE_PERMISSIONS`.** Correcto: evita
   modificar la línea preexistente con `(R6)` y el párrafo nuevo no lleva citas. Lo mismo vale para el
   reenvolvido de la frase del recuento en `permissions.ts`, que deja una línea corta para no tocar la
   siguiente, que sí tiene cita. Es un detalle estético, no un hallazgo.
3. **Migración escrita a mano.** Es equivalente a lo que generaría `prisma migrate dev --create-only`:
   `db/schema.prisma` no cambia, así que Prisma generaría un archivo sin DDL, y el contenido de datos
   sigue literalmente `design.md > 3.1` y el precedente `20260910120000_user_permissions_catalog`
   (`updated_at` explícito, `ON CONFLICT ... DO NOTHING`, subselect por nombre, `CROSS JOIN VALUES`).
   Las columnas coinciden con `20260806122638_users_and_roles` (`roles.id` con default
   `gen_random_uuid()`, `updated_at` sin default). El `down.sql` cumple R21: cuatro `DELETE` acotados
   en el orden de §3.3, sin `CASCADE`, y el `23503` de `users_role_id_fkey` hace fallar la transacción
   entera de `scripts/db-rollback.ts`; los dos casos están probados contra Postgres real. Ver los
   menores 2 y 3 por lo que se dice alrededor de esto.
4. **Dos archivos fuera de `tasks.md`.** Los dos los exigen guardias existentes:
   `MIGRACIONES_ESPERADAS` de `guard-identificador-de-request` es una lista cerrada, y
   `guard-aislamiento-integracion` exige declarar todo archivo de integración nuevo. El cambio es
   mínimo y sigue el patrón de siempre. Aceptados; ver menor 6.

## Hallazgos

Ninguno es BLOQUEANTE.

1. **menor — Rojo ajeno en mi corrida del gate completo.**
   `tests/integration/infra/ciclo-de-vida-de-la-base.int.test.ts` hizo timeout en 2 casos (20 s) con
   la máquina cargada; aislado pasa 5/5, no está en el baseline y la rama no lo toca. No lo cuento
   contra la rama: la corrida completa del implementer sobre el mismo código salió verde. Pero la regla
   5 exige `./init.sh` completo verde antes del PR: el leader tiene que volver a correrlo, y si el
   timeout se repite en `dev`, abrir una ficha de flake en vez de meterlo en el baseline en silencio.
2. **menor — Afirmación falsa en la bitácora (y en `design.md > 6`):** «la no-divergencia
   schema/migraciones la comprueba el gate completo». `init.sh` no corre `prisma migrate diff` ni
   `migrate status`. Aquí no cambia nada, porque la rama no toca `db/schema.prisma` y la migración no
   tiene DDL (lo fija el test estático), pero la bitácora no debería apoyarse en una comprobación que
   no existe.
3. **menor — Comentario de `db/migrations/20260922120000_packer_role/migration.sql`:** «Escrita a mano
   porque `migrate dev` exigia un reset completo de la base por drift de checksum en migraciones
   anteriores». Habla del estado de una base local concreta, no de algo del repo. Quien lo lea puede
   creer que las migraciones del repo tienen drift. Sobra; el dato ya está en la bitácora.
4. **menor — El caso simétrico de R16 es débil.** El fixture `// QC-145 exigira terminados.consultar aqui`
   no lleva comillas, así que daría `false` aunque `stripComments` no hiciera nada. No demuestra que
   un comentario con el literal entrecomillado no dispare, al contrario que el simétrico de R2, que sí
   lo hace.
5. **menor — R19 no aparece en el nombre de ningún caso.** Está cubierto por dos casos de
   `identity-seed.int.test.ts` con nombre descriptivo, y el mapa de la bitácora los señala, pero la
   convención pide el `R<n>` en el nombre del caso como enlace de trazabilidad.
6. **menor — La lista de archivos declarados de `tasks.md` no se actualizó** con
   `tests/guards/guard-identificador-de-request.test.ts` y `tests/integration/aislamiento.json`. La
   usa el leader para validar conflictos; QC-142, que también trae migración, chocará de forma
   textual (trivial) en `MIGRACIONES_ESPERADAS`.
7. **menor — Comentarios de tests en líneas de la rama:** `permissions.test.ts` sigue diciendo «La
   decision 2 del humano (2026-09-07) prohibe el comodin…» en una línea que la rama modificó (es una
   cita de decisión con otras palabras). Las cabeceras nuevas de `empacador-authorization.test.ts`
   (9 líneas) y `empacador-rol.test.ts` (6 líneas) superan las ~5 líneas. Los reenvolvidos de
   `tests/unit/identity/roles/scope.test.ts` («quince despues, dieciseis mas tarde») se leen raros.
   Son tests, no producción.

## Qué hacer

Nada bloquea el merge. Antes del PR, el leader vuelve a correr `./init.sh` completo (menor 1). Los
menores 2–7 pueden entrar en un commit `chore` de la misma rama si el leader quiere, o quedar anotados;
ninguno cambia comportamiento.
