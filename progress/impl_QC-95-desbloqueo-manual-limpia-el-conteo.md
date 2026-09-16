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

> **Mapa reemplazado el 2026-09-15.** La re-review
> (`progress/review_QC-95-desbloqueo-manual-limpia-el-conteo-2026-09-15.md`, B2-B4, m3 y m5)
> demostró que el mapa original era falso en R5, R6, R7, R8, R9 y R10:
> - R5 citaba un `it` tautológico, borrado en `394a6d7`.
> - R6 citaba un test que sigue verde con el literal que R6 prohíbe.
> - A R7 le faltaba `authorization.test.ts`.
> - R8 citaba guardias que se saltan fuera de su rama.
> - R9 y R10 se apoyaban en «git status», que no es un test.
>
> La segunda review (`progress/review_QC-95-guardia-r45-de-qc-66.md`, B-N1) pidió dejar aquí el
> mapa real. Las diez filas de abajo apuntan a tests que existen y pasan. El arreglo, las
> mutaciones que muerden y la verificación están en `progress/impl_QC-95-guardia-r45-de-qc-66.md`.
> El resto de esta bitácora es la entrega original y no se ha tocado; su «Salida real de
> verificación» es de entonces.

| R | Test |
| --- | --- |
| R1 | `tests/unit/identity/usuarios/set-user-account-status-lock.test.ts` «R1 — destino `active`: el puerto recibe `lockState` IGUAL a `clearedLockState()`» + `tests/integration/identity/session-stamp-writes.int.test.ts` «R1/R3: mover a `active` limpia los tres contadores en la misma escritura» |
| R2 | `set-user-account-status-lock.test.ts` «R2 — destino `blocked`: `lockState` va `null` y no se escribe ningun contador» + `tests/unit/identity/usuarios/set-user-account-status-cleared-lock-state.test.ts` «R6/R2 — destino `blocked`: `clearedLockState()` NO se llama y `lockState` es `null`» + `tests/unit/identity/usuarios/user-admin-prisma-lock-state.test.ts` «R2/R3 — destino `blocked` con `lockState` null: el `data` lleva `accountStatus` y NINGUNO de los tres contadores» + `session-stamp-writes.int.test.ts` «R2: mover a `blocked` NO toca los contadores, aunque se escriba el estado» |
| R3 | `user-admin-prisma-lock-state.test.ts` «R3 — destino `active`/`pending`/`inactive` con `clearedLockState()`: un solo `updateMany` y su `data` lleva a la vez `accountStatus` y los tres contadores» y «R3 — los valores de los contadores salen de `lockState`, no de un literal del adaptador» + `session-stamp-writes.int.test.ts` «R1/R3: …», «R3: si la transaccion aborta por `last_administrator`, ni el estado ni los tres contadores cambian» y «R3: un objetivo de otra empresa (`not_found`) conserva sus tres contadores» |
| R4 | `set-user-account-status-lock.test.ts` «R4 — destino `pending`: idem (la decision es por el destino, no por el estado actual)», y `findAliveInCompany` no se llama en R1, R2 ni R4 + `set-user-account-status-cleared-lock-state.test.ts` «R6 — destino `inactive`: …» |
| R5 | `set-user-account-status-lock.test.ts` «R5 — `blocked` -> `active` por el caso de uso, y un fallo de login registra `failedAttempts = 1` sin rebloquear», con su control «control: la MISMA fila, sin pasar por el caso de uso, el login la trata como bloqueada»; lo complementa `tests/unit/identity/verify-credentials.test.ts:1051` «tras clearedLockState el siguiente fallo cuenta como el primero y no rebloquea» |
| R6 | `set-user-account-status-cleared-lock-state.test.ts` «R6 — destino `active`: se llama a `clearedLockState()` una vez y el puerto recibe ESE MISMO objeto» (tambien con `pending` e `inactive`) + «R6/R2 — destino `blocked`: …»; en el adaptador, `tests/unit/identity/usuarios/scope.test.ts` exige que el spread lea de `input.lockState` y no escriba literales |
| R7 | `tests/unit/identity/usuarios/authorization.test.ts`, fila `setUserAccountStatus`: «R1 — cada caso de uso avanza con EXACTAMENTE el codigo de su fila y con ningun otro», «R3 — solo `usuarios.consultar` no abre ninguna de las cuatro escrituras» y «R1 — el permiso se comprueba ANTES de zod: …» + `tests/unit/identity/usuarios/admin-guards.test.ts` «R21 — rechaza setUserAccountStatus con `self_operation` y no modifica ninguna fila» y «R22 — mover el estado del ultimo administrador activo se traduce a `last_administrator`» |
| R8 | `tests/guards/guard-qc95-alcance-del-pr-70.test.ts` «R8: el PR #70 no modifica la politica de bloqueo por intentos, el estado efectivo, el login ni la resolucion de sesion» y «R8: cada archivo vigilado por R8 existe en el arbol del merge f777c56 (una ruta mal escrita tira la guardia en vez de medir aire)», con las anclas (1)-(3) y los sinteticos «R8: cada archivo del bloqueo por intentos, del estado efectivo, del login y de la sesion es hallazgo por separado» y «un rango sintetico con archivos prohibidos: la auditoria completa los detecta en R8, R9 y R10» |
| R9 | `tests/guards/guard-qc95-alcance-del-pr-70.test.ts` «R9: el PR #70 no toca `db/schema.prisma`, `db/migrations/`, `package.json` ni `pnpm-lock.yaml`», con los sinteticos «R9: `db/schema.prisma`, una migracion, `package.json` y `pnpm-lock.yaml` son hallazgo cada uno por separado» y «un commit ausente en un clon SUPERFICIAL lanza con `git fetch --unshallow`, nunca salta» |
| R10 | `tests/guards/guard-qc95-alcance-del-pr-70.test.ts` «R10: el PR #70 no trae nada bajo `app/` ni `components/`», con el sintetico «R10: una pagina bajo `app/` y un componente bajo `components/` son hallazgo» |

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
