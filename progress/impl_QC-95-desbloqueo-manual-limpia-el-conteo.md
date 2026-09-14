# Implementación — QC-95 · desbloqueo-manual-limpia-el-conteo

> Zona `backend` · complejidad `low` · worktree `.worktrees/QC-95-desbloqueo-manual-limpia-el-conteo`
> Ramas: `feature/QC-95-desbloqueo-manual-limpia-el-conteo` desde `dev`.
> Verificado como subagente (`backend_dev`): solo typecheck, lint y `vitest run` sobre los
> archivos relacionados; **no** se corrió la suite completa (`./init.sh` lo hace el leader).

## Resumen

`applyGuardedChange` (adaptador de `setUserAccountStatus`) ahora limpia los tres contadores de
bloqueo (`failed_login_attempts`, `lock_level`, `locked_until`) **en la misma escritura** que
mueve `account_status`, pero **solo** cuando el destino no es `blocked` (R1, R2, R3). La decisión
es por el destino (R4), el estado limpio sale de `clearedLockState()` como única fuente (R6), y
al salir de `blocked` el siguiente fallo de login cuenta como el primero (R5, cubierto por la vía
del login existente + el test de R1). Sin migración, sin dependencia, sin UI (R9, R10).

## Archivos de producción

1. **`lib/modules/identity/ports/user-admin-repository.ts`** — la variante `account_status` de
   `GuardedChange` gana el campo `lockState: AccountLockState | null` (import relativo de
   `../domain/account-lock`), con JSDoc que enmienda R45 de QC-66; la nota de `NewUser` y la
   variante `account_status` se actualizan. La variante `delete` no cambia.
2. **`lib/modules/identity/adapters/driven/persistence/user-admin-prisma.ts`** — el `data` del
   `updateMany` de la rama `account_status` esparce los tres contadores de `input.lockState` **solo
   cuando no es `null`** (R2); JSDoc de la función y punto 5 de la cabecera actualizados.
3. **`lib/modules/identity/domain/set-user-account-status.ts`** — importa `clearedLockState` de
   `./effective-account-status` (relativa, mismo `domain/`), calcula
   `lockState = destino === 'blocked' ? null : clearedLockState()` y lo pasa al puerto; JSDoc
   actualizado. La autorización, las guardas y el esquema no se tocan.

## Archivos de test

- **Nuevo** `tests/unit/identity/usuarios/set-user-account-status-lock.test.ts` — caso de uso con
  dobles: destino `active`/`pending` → `lockState` igual a `clearedLockState()`; destino `blocked`
  → `null`; `findAliveInCompany` no se llama (R4). Cubre R1, R2, R4, R6 y referencia R5.
- **Extendido** `tests/integration/identity/session-stamp-writes.int.test.ts` — dos casos contra
  Postgres real: mover a `active` deja la fila en (0, 0, null) + `accountStatus: 'active'` en la
  misma escritura (R1, R3); mover a `blocked` con `lockState: null` deja los contadores intactos
  (R2). Se añadió el import de `clearedLockState`.
- **Ajustados por el campo requerido** `tests/integration/identity/last-administrator.int.test.ts`
  y `tests/integration/identity/user-crud.int.test.ts` — sus llamadas directas a
  `applyGuardedChange` (variante `account_status`) ya no compilaban al hacer `lockState`
  obligatorio; se les añadió el argumento con la semántica de QC-95 (destino `blocked` → `null`,
  resto → `clearedLockState()`). Cambios puramente de compilación, sin tocar expectativas.

## Mapa `R<n> → test`

| R | Dónde se prueba |
| --- | --- |
| R1 | `set-user-account-status-lock.test.ts` (destino `active` → `clearedLockState()`) + `session-stamp-writes.int.test.ts` (fila queda en 0,0,null) |
| R2 | `set-user-account-status-lock.test.ts` (destino `blocked` → `null`) + `session-stamp-writes.int.test.ts` (contadores intactos) |
| R3 | `session-stamp-writes.int.test.ts` (misma escritura, fila releída tras la operación) |
| R4 | `set-user-account-status-lock.test.ts` (destino `pending` idem; sin `findAliveInCompany`) |
| R5 | `verify-credentials.test.ts` (~línea 1051, vía login) + test de R1 (comentario de referencia) |
| R6 | `set-user-account-status-lock.test.ts` compara contra `clearedLockState()`, no contra literal |
| R7 | `admin-guards.test.ts` — verde sin cambios de expectativa |
| R8 | guardias por-ficha `qc78-alcance.test.ts`, `account-status-scope.test.ts`, `credential-policy-contract.test.ts` — mudas/verdes |
| R9 | guardias: sin diff en `db/` ni `package.json` (verificado por grep de git status) |
| R10 | guardias: sin archivos en `app/` ni `components/` (verificado por git status) |

## Salida real de verificación

### `pnpm run typecheck` (vía `tsc --noEmit` con el node_modules del repo principal)
```
1 error: app/layout.tsx(43,56): error TS2304: Cannot find name 'LayoutProps'.
```
**Ambiental, no de esta rama**: `LayoutProps` se genera en `.next/types/routes.d.ts`, que no
existe en un worktree sin build. El repo principal (`dev`) con `.next` genera **0 errores** y
`app/layout.tsx` no está modificado en esta rama (`git status` limpio para él). Ningún error de
código de QC-95: los 3 archivos de producción y todos los tests compilan limpio.

### `pnpm run lint` (vía `eslint`)
```
Sin salida, exit 0 (limpio).
```

### Tests relacionados (`vitest run <archivos>`, con `DATABASE_URL`/`DIRECT_URL` del `.env` principal)
```
Test Files  7 passed (7)
     Tests  113 passed | 7 skipped (120)
```
Los 7 skipped son las guardias por-ficha que quedan mudas correctamente en esta rama
(`qc78-alcance` y `account-status-scope` saltan porque no son las ramas de QC-78/QC-65).

## Notas de alcance

- `lib/composition/index.ts`, `lib/modules/identity/index.ts`, `domain/account-lock.ts`,
  `domain/effective-account-status.ts` (la función `clearedLockState` ya existía), `app/`,
  `components/`, `e2e/`, `lib/shared/**`, `db/schema.prisma`, `db/migrations/` y `package.json`
  no se tocaron.
- Comentarios obsoletos: `grep -rn "R45\|es de QC-78\|limpiar" lib/modules/identity/` confirma
  que los 3 archivos de producción de esta feature quedan actualizados a «QC-95 enmienda R45».
  Las notas en archivos ajenos (`user-input.ts`, `user-view.ts`, `update-user.ts`,
  `user-actions.ts`, `session-revocation-prisma.ts`) se dejan intactas por instrucción de la task.

## Veredicto

Feature implementada: el desbloqueo administrativo limpia los contadores al salir de `blocked`
en la misma escritura, con los tests unitarios y de integración en verde.
