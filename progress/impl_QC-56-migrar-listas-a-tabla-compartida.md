# QC-56 — migrar-listas-a-tabla-compartida · bitacora de implementacion

> Implementer · F2.1 · worktree `.worktrees/QC-56-migrar-listas-a-tabla-compartida`, rama
> `feature/QC-56-migrar-listas-a-tabla-compartida` (base `2415e55`). Spec aprobado el 2026-09-15.
> Esta bitacora se va completando por tandas; el gate (`./init.sh --rapido` / completo) lo corre el leader.

## Estado por tarea

| Task | Estado | Notas |
|---|---|---|
| T0 | hecha (venia del spec) | |
| T1–T14 | en curso | autorizadas por el leader sin base (2026-09-15) |
| T15, T16, T17 | **PENDIENTES — bloqueadas por la base** | ver «Bloqueo de la base» |
| T18 | pendiente | |

## Bloqueo de la base (2026-09-15)

**Pasos hechos, con su codigo de salida real:**

1. `pnpm install --frozen-lockfile` → exit 0; `pnpm-lock.yaml` y `package.json` sin cambios.
2. `pnpm exec prisma generate` → exit 0.
3. `pnpm exec next typegen` → exit 0.
4. Nombre `QuimiCloude_QC56` comprobado libre contra `pg_database`. En el `.env` del worktree
   (git-ignorado) se cambio **solo** el nombre de base de `DATABASE_URL` y `DIRECT_URL`.
5. `pnpm exec prisma migrate deploy` → exit 1 en `20260911130000_inventory_company_scope` con el
   error esperado de QC-49 («hay 0 empresa(s) en la tabla»).
6. `pnpm run db:seed` → **exit 1, fallo DISTINTO al previsto**:

```
Invalid `db.user.create()` invocation in
lib/modules/identity/adapters/driven/persistence/initial-access-repository-prisma.ts:127:39
The column `existe` does not exist in the current database.
```

**Diagnostico.** `existe` es Prisma leyendo mal el mensaje de Postgres en castellano. El cliente
generado ya incluye `users.sessions_valid_from`, que anade
`db/migrations/20260912103000_session_revocation/migration.sql:28`, una migracion **posterior** a
QC-49 (tambien lo es `20260911155021_credential_setup_tokens`). Como `migrate deploy` se detiene en
QC-49, esa columna no existe y el seed no puede crear el usuario inicial. La receta
«migrar → seed → `migrate resolve --rolled-back` → migrar» (`progress/current.md`) ya no funciona
sobre base vacia en esta rama. No se encontro otra receta en `scripts/`.

**Estado en que quedo la base (comprobado tras el fallo):**
- `QuimiCloude_QC56` existe, con migraciones aplicadas hasta `20260911120000_presentation_unit`.
- `20260911130000_inventory_company_scope` queda **fallida** (sin terminar, sin `rolled_back`): no
  se llego a ejecutar `resolve`.
- `companies`, `users` y `roles` con 0 filas (el seed no dejo nada a medias).

**Decision del leader (2026-09-15):** no se toca esa base ni el `.env`; el leader investiga como
montarla. T15–T17 quedan pendientes hasta entonces.
