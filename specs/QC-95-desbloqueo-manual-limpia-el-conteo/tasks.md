# QC-95 — desbloqueo-manual-limpia-el-conteo · tasks.md

> Zona: `backend` · Complejidad: `low`. Feature mínima: tres archivos de producción, sin
> migración, sin dependencia, sin UI. Cada task es pequeña y termina con un criterio de «hecho»
> verificable. Marca `[P]` lo paralelizable.

## Orden de trabajo

| Task | Depende de |
| --- | --- |
| T1. Puerto | — |
| T2. Adaptador | T1 |
| T3. Caso de uso (dominio) | T1 |
| T4. Tests del caso de uso | T3 |
| T5. Comentarios obsoletos + grep | T2, T3 |
| T6. Guardia de alcance + gate completo | T1–T5 |

---

### T1. El puerto gana el campo `lockState`

- [x] **T1 hecha** (comprobado 2026-09-15): `lockState: AccountLockState | null` en la variante
  `account_status` de `GuardedChange` (`user-admin-repository.ts:137`) con su JSDoc (131-136);
  `tsc --noEmit` exit 0 en el worktree.

- En `lib/modules/identity/ports/user-admin-repository.ts`: la variante `account_status` de
  `GuardedChange` gana `lockState: AccountLockState | null` (importando `AccountLockState` de
  `../domain/account-lock`).
- **Hecho:** `pnpm typecheck` en verde y el campo aparece en la firma del tipo `account_status`
  del `GuardedChange`, con su JSDoc breve.

---

### T2. El adaptador escribe los contadores en la misma escritura (R1, R3)

- [x] **T2 hecha** (cerrada 2026-09-15, commit `394a6d7`, menor m4 de la re-review): el «Hecho»
  que faltaba lo da `tests/unit/identity/usuarios/user-admin-prisma-lock-state.test.ts`, que
  prueba un unico `updateMany` con `accountStatus` y los tres contadores en el MISMO `data`
  cuando `lockState` no es `null`, y sin ninguno cuando es `null`. Cae si los contadores van en
  un segundo `updateMany`. El aborto (`last_administrator`, `not_found`) con los contadores
  intactos esta en `session-stamp-writes.int.test.ts`.

- En `lib/modules/identity/adapters/driven/persistence/user-admin-prisma.ts`, dentro de
  `applyGuardedChange`, el `data` del `updateMany` de la variante `account_status` añade
  `failedLoginAttempts`, `lockLevel` y `lockedUntil` tomados de `input.lockState` **solo cuando
  `input.lockState !== null`**; cuando es `null`, las tres columnas no aparecen (R2).
- Actualizar el JSDoc de la función (la nota «R45… limpiar es de QC-78» pasa a «QC-95, que
  enmienda R45»).
- **Hecho:** test del adaptador (donde el repo ya los tenga; si no, uno nuevo con Prisma fake o
  contra la base de test) demuestra que el `data` del `updateMany` lleva los tres contadores **en
  el mismo objeto** que `accountStatus` cuando `lockState` no es `null`, y que no los lleva cuando
  es `null`.

---

### T3. El caso de uso decide por el destino y llama a `clearedLockState` (R1, R2, R4, R6)

- [x] **T3 hecha** (comprobado 2026-09-15): `set-user-account-status.ts:69` calcula `lockState`
  con `clearedLockState()` y lo pasa al puerto; el archivo no contiene `failedAttempts`,
  `lockLevel`, `lockedUntil` ni ningun literal cero/cero/null (grep vacio); `tsc --noEmit` exit 0.

- En `lib/modules/identity/domain/set-user-account-status.ts`: importar `clearedLockState` de
  `./effective-account-status` por ruta relativa.
- Calcular `const lockState = parsed.data.accountStatus === 'blocked' ? null : clearedLockState();`
  y pasarlo en el objeto de `applyGuardedChange`.
- Actualizar el JSDoc del caso de uso (misma nota obsoleta → QC-95).
- **Hecho:** `pnpm typecheck` en verde; el caso de uso pasa `lockState` al puerto y la única
  fuente de «cero, cero, null» es `clearedLockState()` (no hay literal en el archivo).

---

### T4. Tests del caso de uso (R1, R2, R4, R5)

- [x] **T4 hecha** (completada 2026-09-15, commit `394a6d7`, B2 y m3 de la re-review):
  `set-user-account-status-lock.test.ts` cubre R1, R2 y R4, y R5 con un encadenado real
  (caso de uso -> `verify-credentials`) en lugar del caso tautologico.
  `set-user-account-status-cleared-lock-state.test.ts` cubre R6 con un doble centinela y `toBe`.
  `admin-guards.test.ts` sigue verde sin cambios de expectativa. Corrida con `vitest run` sobre los
  archivos tocados, sus relacionados y las guardias que leen disco: 13 archivos, 279 verdes y
  12 skipped (de rama, ajenos).

- En `tests/unit/identity/usuarios/` (ampliando `admin-guards.test.ts` o un archivo nuevo
  `set-user-account-status-lock.test.ts`), con dobles del puerto:
  1. destino `active` → `applyGuardedChange` recibe `lockState` **igual a `clearedLockState()`**
     (comparación referencial de valor `{ failedAttempts: 0, lockLevel: 0, lockedUntil: null }`,
     no un literal esparcido).
  2. destino `pending` → idem (R4: la decisión es por destino, no por estado actual).
  3. destino `blocked` → `lockState` es `null` (R2).
  4. R5: encadenar el caso de uso con el login — tras mover `blocked → active`, el siguiente
     fallo de `verify-credentials` cuenta como el primero (reutiliza el caso existente de
     `verify-credentials.test.ts` ~línea 1051). Si el encadenado es incómodo, se referencia el
     caso existente en un comentario y se cubre con el test de R1 + el ya existente.
- Verificar que los tests de `admin-guards.test.ts` (guardas R21/R22/R24) siguen **verdes sin
  cambios** de expectativa (los dobles solo inspeccionan `adminRoleName` y el conteo).
- **Hecho:** `pnpm exec vitest related --run` sobre los archivos tocados, en verde.

---

### T5. Comentarios obsoletos y grep de control

- [x] **T5 hecha** (cerrada 2026-09-15, commit `fdea487`, menor m1 de la re-review): se
  reescribieron las dos notas que seguian obsoletas (`user-input.ts:20-23`, `user-view.ts:15-17`).
  El grep de la task, ampliado con `no (los )?lee(n)? ni (los )?escribe`, ya no devuelve ninguna
  nota que contradiga el codigo; cada linea restante esta justificada en
  `progress/impl_QC-95-guardia-r45-de-qc-66.md`.

- `grep -rn "R45\|es de QC-78\|limpiar" lib/modules/identity/` para localizar TODAS las notas
  que decían «no se toca / es de QC-78» y dejarlas actualizadas a «QC-95 enmienda R45: se limpia
  al salir de `blocked`». No debe quedar ninguna nota que afirme lo contrario de lo que el código
  ahora hace.
- **Hecho:** `grep` no devuelve ninguna nota obsoleta sin actualizar.

---

### T6. Guardias de alcance y gate completo

- [ ] **T6 NO cerrada** (2026-09-15): falta su «Hecho», `./init.sh` completo en verde, que corre
  el leader. El resto esta hecho:
  - B1 retensa la unica guardia que enumeraba escritores de los contadores (`usuarios/scope.test.ts`, commit `fdea487`).
  - Se crea la guardia de alcance de la ficha, `tests/guards/guard-qc95-alcance-del-pr-70.test.ts` (R8, R9, R10; commit `16249df`).
  - `vitest run guard` sale verde: 40 archivos, 426 casos.
  - El mapa `R<n> -> test` esta en `progress/impl_QC-95-guardia-r45-de-qc-66.md`.

- Verificar que las guardias por-ficha de QC-19/QC-78/QC-65 (`qc78-alcance.test.ts`,
  `account-status-scope.test.ts`, `credential-policy-contract.test.ts`) quedan **mudas/verdes**
  en esta rama (son por-ficha) o, si alguna enumera escritores de las columnas de bloqueo de
  forma global, añadir `user-admin-prisma.ts` a su lista autorizada **sin relajarla**.
- Dejar constancia del mapa `R<n> -> test` en `progress/impl_QC-95-desbloqueo-manual-limpia-el-conteo.md`.
- **Hecho:** `./init.sh --rapido` verde por tanda y **`./init.sh` completo verde** al cerrar y
  antes del PR (lo corre el leader, no el subagente).

---

## Declaración de conflicto de archivos para el leader

Producción: `lib/modules/identity/domain/set-user-account-status.ts`,
`lib/modules/identity/ports/user-admin-repository.ts`,
`lib/modules/identity/adapters/driven/persistence/user-admin-prisma.ts`.
**No se tocan:** `db/schema.prisma`, `db/migrations/`, `package.json`, `lib/composition/`,
`lib/modules/identity/index.ts`, `app/`, `components/`, `e2e/`, `lib/shared/**`.