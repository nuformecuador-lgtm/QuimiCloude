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

- En `lib/modules/identity/ports/user-admin-repository.ts`: la variante `account_status` de
  `GuardedChange` gana `lockState: AccountLockState | null` (importando `AccountLockState` de
  `../domain/account-lock`).
- **Hecho:** `pnpm typecheck` en verde y el campo aparece en la firma del tipo `account_status`
  del `GuardedChange`, con su JSDoc breve.

---

### T2. El adaptador escribe los contadores en la misma escritura (R1, R3)

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

- En `lib/modules/identity/domain/set-user-account-status.ts`: importar `clearedLockState` de
  `./effective-account-status` por ruta relativa.
- Calcular `const lockState = parsed.data.accountStatus === 'blocked' ? null : clearedLockState();`
  y pasarlo en el objeto de `applyGuardedChange`.
- Actualizar el JSDoc del caso de uso (misma nota obsoleta → QC-95).
- **Hecho:** `pnpm typecheck` en verde; el caso de uso pasa `lockState` al puerto y la única
  fuente de «cero, cero, null» es `clearedLockState()` (no hay literal en el archivo).

---

### T4. Tests del caso de uso (R1, R2, R4, R5)

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

- `grep -rn "R45\|es de QC-78\|limpiar" lib/modules/identity/` para localizar TODAS las notas
  que decían «no se toca / es de QC-78» y dejarlas actualizadas a «QC-95 enmienda R45: se limpia
  al salir de `blocked`». No debe quedar ninguna nota que afirme lo contrario de lo que el código
  ahora hace.
- **Hecho:** `grep` no devuelve ninguna nota obsoleta sin actualizar.

---

### T6. Guardias de alcance y gate completo

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