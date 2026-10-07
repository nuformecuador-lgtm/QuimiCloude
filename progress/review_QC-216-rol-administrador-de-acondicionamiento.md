# QC-216 — rol-administrador-de-acondicionamiento · review

> Reviewer, vuelta 1 (revision completa), 2026-10-06. Rama
> `feature/QC-216-rol-administrador-de-acondicionamiento`, tip `b01b714e`, diff `origin/dev...HEAD`
> (28 archivos). `.int` contra base efimera copiada de la plantilla `qct_tpl_98ed93a270b2`
> (la crea `_global-setup.ts`; `.env` del worktree en `QuimiCloude_QC216`). MCP del grafo no usado:
> revision por git, Grep y Read.

## Verificacion ejecutada

| Que | Resultado |
|---|---|
| typecheck, lint | verdes segun el gate del leader; no repetidos |
| `vitest run` de los unit tocados + `seed-initial-access` (14 archivos) | 253 passed, 7 skipped, 0 rojos |
| `vitest run guard` | 51 archivos, 695 passed, 11 skipped |
| `.int`: `conditioning-role-migration`, `identity-seed`, `role-catalog`, `user-crud`, `session-user`, `packer-role-migration` | 6 archivos, 117/117 |
| `git diff --stat origin/dev...HEAD -- e2e package.json pnpm-lock.yaml db/schema.prisma app components hooks middleware.ts lib/shared lib/modules/asignaciones lib/modules/inventario scripts seed-initial-access.ts` | vacio |
| Barrido de lineas `+` de comentario (`//`, `/*`, ` *`, `--`) en `lib/`, `db/`, `tests/` | 0 citas a `QC-<n>`, `R<n>`, `design.md` o «decision cerrada» |
| `./init.sh` completo y E2E | no corridos (regla del gate: leader) |

## Checklist

### Especificacion y tasks
- [x] requirements EARS R1-R28; design con 7 alternativas descartadas (§8); tasks.
- [ ] Tasks: T1-T14 `[x]`; **T15 abierta** (gate completo, observacion manual del selector). Es del
      leader; la feature no pasa a `done` sin cerrarla. No es hallazgo de esta vuelta.

### Trazabilidad (R -> test), comprobada sobre el diff
- [x] R1, R2, R3 (estatico), R17 -> `tests/unit/identity/roles/acondicionamiento-rol.test.ts`
      (barridos con sinteticos de tres comillas y simetricos en comentario).
- [x] R4, R5, R6 (+ simetrico con cita sintetica), R8, R9, R10 -> bloque `QC-216` de
      `tests/unit/identity/permissions.test.ts`.
- [x] R7 -> `guard-permisos-no-administrables` (preexistente, verde) + caso `R7, R21` del estatico de
      la migracion (solo tres `INSERT`).
- [x] R11 -> `tests/guards/guard-autorizacion-por-permiso.test.ts`: patrones del literal y de
      `ROLE_ACONDICIONAMIENTO`, ancla tensada, sinteticos que disparan y simetrico en comentario.
- [x] R12 -> `tests/unit/navegacion/menu-acondicionamiento.test.ts`.
- [x] R13 -> `tests/unit/identity/require-page-permission.test.ts`: el codigo de cada `page.tsx` se
      lee de su fuente y se valida contra `PERMISSIONS`.
- [x] R14, R15, R16 -> `tests/unit/asignaciones/acondicionamiento-authorization.test.ts`: actor desde
      `SEED_ROLE_PERMISSIONS`, puertos `Proxy` que registran acceso y explotan al llamarse, con caso
      de sensibilidad positivo.
- [x] R18 -> `role-catalog.int` · R19, R3 (dos empresas) -> `user-crud.int` · R20 -> `session-user.int`.
- [x] R21, R22, R25 -> `conditioning-role-migration.int` (SQL leido del archivo; 23503 con usuario
      del rol y snapshot identico) + estatico `tests/unit/identity/schema/conditioning-role-migration.test.ts`
      (R21, R22, R24, R25 con mutaciones en memoria).
- [x] R23, R26, R3, R9 (base) -> `identity-seed.int` (casos `QC-216` y bucle `QC-161 R9, QC-216 R26`).
- [x] R27, R28 -> revision (diff vacio en `e2e/`, `package.json`, `db/schema.prisma`) +
      `guard-dependencias-aprobadas` y el estatico sin DDL.
- [x] Mapa R -> test en la bitacora (repartido por tandas; ver m2).

### Calidad de codigo
- [x] typecheck, lint (gate del leader). `pnpm test` completo: lo cierra el `./init.sh` del leader.
- [x] Flujo critico de permisos: sin E2E por decision humana (D6, diferido a QC-217). No es hallazgo.
- [x] UI / multiplataforma: no toca `app/`, `components/` ni `hooks/`. No aplica.
- [x] Dependencias: `package.json` sin cambios.

### Datos y seguridad
- [x] Ningun modelo ni tabla nueva; `roles`, `permissions`, `role_permissions` ya con RLS forzada.
      Rol global (sin empresa), como el resto de roles: correcto segun `architecture.md > Dominio`.
- [x] Autorizacion por permiso: ningun archivo de produccion usa `ROLE_ACONDICIONAMIENTO` salvo el
      catalogo (`permissions.ts`, clave del seed) y el barril; la guardia lo vigila.
- [x] Migracion versionada y reversible: `migration.sql` (3 `INSERT ... ON CONFLICT DO NOTHING`) y
      `down.sql` (4 `DELETE` acotados, asignaciones primero, sin `CASCADE`).
- [x] **Drift**: ni una sentencia DDL en el UP ni en el DOWN (`DROP`, `ALTER`, `CREATE` = 0;
      comprobado a mano y por `schemaStatements`). Como `db/schema.prisma` no cambia, todo lo que
      Prisma genero era drift: no falta nada propio. Lo que si es propio (rol, permiso, dos
      asignaciones) esta y coincide con las constantes (test estatico).
- [x] Seed idempotente: `seedInitialAccess` sin cambios; R23 probado contra Postgres (segunda corrida
      sin cambios).
- [x] Sin secretos ni contexto hardcodeado; sin webhooks.

### Modulos hexagonales
- [x] Solo cambia dominio puro de `identity` (`roles.ts`, `permissions.ts`) y el barril.

### Comentarios
- [x] Lineas anadidas o modificadas en produccion (`lib/`, `db/`): sin citas. La `(R5)` de
      `permissions.ts` y el `QC-74 T1` de `index.ts` son preexistentes y la rama no los toca.

### Fuera de `tasks.md`
- [x] `tests/guards/guard-identificador-de-request.test.ts`: alta de `20261006234105_conditioning_role`
      en `MIGRACIONES_ESPERADAS`, al final y en orden. La guardia la exige a toda migracion nueva.
      Correcto.
- [x] `tests/integration/aislamiento.json`: alta de `identity/conditioning-role-migration.int.test.ts`
      en `transaccion`, en orden alfabetico. Correcto: cada `it` corre en `inRolledBackTransaction`
      y lo que se espera que falle va bajo `SAVEPOINT`. `guard-aislamiento-integracion` verde.

### Fuera de alcance
- [x] El diff no toca `seed-initial-access.ts`, `scripts/`, `db/schema.prisma`, `package.json`,
      `app/`, `components/`, `hooks/`, `middleware.ts`, `lib/shared/`, `lib/modules/asignaciones/`,
      `lib/modules/inventario/` ni `e2e/`. `canBeResponsible` intacto (N6).

## Hallazgos

### m1 — menor · cabeceras SQL largas
`db/migrations/20261006234105_conditioning_role/migration.sql:1-14` (14 lineas) y `down.sql:1-12`
(12 lineas) pasan del ~5 de `docs/conventions.md > Comentarios`, y parte repite lo que el SQL ya
dice («Sin `INSERT`, `UPDATE`, `ALTER`, `DROP` ni `CASCADE`», «solo escribe filas en...»). Los
porques reales (drift borrado, orden por FK `RESTRICT`, fallo con `23503`) caben en menos.

### m2 — menor · mapa R -> test repartido
T15 pide el mapa R1-R28 completo; en la bitacora esta en tres mapas parciales mas la consolidacion
de R27/R28. Esta completo, pero no en una tabla unica. Lo puede consolidar el leader al cerrar T15.

## Pendiente del leader (no son hallazgos)
- T15: `./init.sh` completo y observacion manual del selector de usuarios.
- Borrar `QuimiCloude_QC216` y restaurar `.env` desde `.env.bak-QuimiCloude` al cerrar.
- `depends_on` de QC-215 -> QC-216 (N7).

## Veredicto

**OK** — 0 bloqueantes, 2 menores (m1, m2).
