# QC-95 — desbloqueo-manual-limpia-el-conteo · design.md

> Zona: `backend` · Complejidad: `low` · depends_on: `null` ·
> Rama: `feature/QC-95-desbloqueo-manual-limpia-el-conteo`
>
> Cubre `requirements.md` R1–R10. Módulo `identity`, arquitectura hexagonal de
> `docs/architecture.md`. **Sin migración, sin `db/`, sin `package.json`**, sin pantalla. Es la
> ficha más pequeña de la épica a propósito: una cláusula de R45 de QC-66 que cambia, y nada más.

## 0. El agujero, en una frase

`applyGuardedChange` (el adaptador de `setUserAccountStatus`) cambia `account_status` pero **no
toca** los tres contadores de bloqueo. Cuando se pasa de `blocked` a `active`, un `locked_until`
todavía futuro que dejó la política de intentos **sobrevive**, y QC-78 R11 traduce «`active` con
`locked_until` futuro» a estado efectivo `blocked`: la fila dice `active`, la persona no entra.
QC-78 entregó `clearedLockState()` —cero, cero, `null`— como el mecanismo y **nadie lo llama**
(grep confirmado en la descripción de la ficha: MAYOR-2 del reviewer de QC-66).

## 1. Qué cambia, y dónde

El cambio toca exactamente **tres archivos de producción** y ningún otro:

| Archivo | Qué se hace |
| --- | --- |
| `lib/modules/identity/domain/set-user-account-status.ts` | El caso de uso importa `clearedLockState` de `./effective-account-status` (relativa, mismo `domain/`; el barrel no se toca), calcula `lockState` y lo pasa en el `GuardedChange` (R1, R2, R4, R6). |
| `lib/modules/identity/ports/user-admin-repository.ts` | La variante `account_status` de `GuardedChange` gana el campo `lockState: AccountLockState \| null`; el JSDoc que decía «R45… limpiar al salir de `blocked` es de QC-78» pasa a decir que QC-95 lo aplica aquí. |
| `lib/modules/identity/adapters/driven/persistence/user-admin-prisma.ts` | `applyGuardedChange` escribe los tres contadores en el **mismo `updateMany`** que cambia el estado, solo cuando `lockState` no es `null` (R3); su JSDoc actualiza la misma nota. |

`lib/composition/index.ts` **no se toca**: `createSetUserAccountStatus({ users })` conserva su
firma y el adaptador sigue cumpliendo el puerto estructuralmente. `lib/modules/identity/index.ts`
**no se toca**: `clearedLockState` se consume por ruta relativa dentro del dominio, no por el
barrel. `db/schema.prisma`, `db/migrations/`, `package.json` y `app/` **no se tocan** (R9, R10).

## 2. La decisión clave: se limpia por el DESTINO, no por leer el estado actual

**R4 exige que la decisión use solo el destino** (limpia si y solo si el destino no es `blocked`).
Por qué es correcto y no un atajo:

- Los tres contadores **solo los escribe el camino de login** (QC-78). Para cualquier destino no
  bloqueado, un contador/plazo sobrante es siempre un error: si `locked_until` quedara vivo, la
  cuenta quedaría efectivamente `blocked` (R11). Por eso **limpiar para todo destino ≠ `blocked`
  es siempre seguro e idempotente**, y cubre de sobra el caso literal «salir de `blocked`».
- No exige una **lectura** del estado actual del objetivo, que hoy `applyGuardedChange` no hace.
  Evita sumar una consulta y, sobre todo, evita decidir con un dato leído fuera de la transacción
  (una carrera con otro cambio de estado). La decisión vive entera en el dato de entrada.
- No interfiere con la guarda del último administrador: `leavesTheSet` en el adaptador se calcula
  con `input.accountStatus` y no cambia.

Casos comprobados a mano:

| Destino | ¿Limpia? | Efecto |
| --- | --- | --- |
| `active` | Sí | El desbloqueo real: se retira el `locked_until` futuro → el estado efectivo pasa a `active` (R5). |
| `pending` / `inactive` | Sí | Inofensivo: esos estados no usan los contadores (QC-78 R6), y limpiar no cambia nada. |
| `blocked` | **No** | Pasar a `blocked` no limpia (R2): el bloqueo administrativo no lleva plazo y no hay nada que retirar. |

## 3. La escritura, atómica (R3)

El puerto `GuardedChange` gana el campo, y el adaptador lo escribe **en el mismo `updateMany`**
que ya cambia `account_status`, `account_status_changed_at`, `account_status_changed_by` y el
sello de sesión (`sessionStamp`). Cuando `lockState` es `null`, las tres columnas **no aparecen**
en el `data` — así no se pisan contadores en los destinos que no limpian (R2) y la marca de cambio
de estado no arrastra una escritura de más. Todo ocurre dentro del `$transaction` con el bloqueo
de `lockActiveAdministratorIds` que ya existe (QC-66 R22, R23): si la transacción aborta por
`last_administrator`, no se escribió ni el estado ni la limpieza.

```ts
// adaptador — dentro del $transaction existente
data: input.kind === 'delete'
  ? { ...sessionStamp, deletedAt: input.now, updatedAt: input.now }
  : {
      ...sessionStamp,
      accountStatus: input.accountStatus,
      accountStatusChangedAt: input.now,
      accountStatusChangedBy: input.changedBy,
      updatedAt: input.now,
      // QC-95 R1, R3: los tres contadores, solo cuando el destino no es `blocked`.
      ...(input.lockState === null ? {} : {
        failedLoginAttempts: input.lockState.failedAttempts,
        lockLevel: input.lockState.lockLevel,
        lockedUntil: input.lockState.lockedUntil,
      }),
    },
```

El dominio decide y el puerto solo persiste, igual que en QC-78 (`accountStatusAfterAttempt`): la
regla de negocio vive en el caso de uso, y el adaptador es un `UPDATE` condicional sin lógica.

## 4. El caso de uso (R1, R2, R4, R6)

`set-user-account-status.ts` calcula el campo antes de llamar al puerto:

```ts
import { clearedLockState } from './effective-account-status'; // QC-95 R6 — la UNICA fuente de «cero, cero, null»

// …
const lockState = parsed.data.accountStatus === 'blocked' ? null : clearedLockState(); // R2/R4

const outcome = await deps.users.applyGuardedChange({
  kind: 'account_status',
  companyId: actor.companyId,
  id,
  adminRoleName: ROLE_ADMINISTRADOR,
  accountStatus: parsed.data.accountStatus,
  changedBy: actor.id,
  now: now(),
  lockState, // QC-95 R1
});
```

Nada más cambia: la autorización (R7), las guardas y el esquema `setAccountStatusSchema` quedan
igual. El `if (id === actor.id)` y la traducción de `not_found` / `last_administrator` no se tocan.

### Alternativa descartada — decidir leyendo el estado actual del objetivo

«Limpiar solo si el estado actual es `blocked`» es la lectura literal de «al salir de `blocked`».
Descartada por tres motivos: (a) obliga a leer el estado actual del objetivo, una consulta que
`applyGuardedChange` hoy no hace; (b) esa lectura —si se hace fuera de la transacción— decide con
un dato que otra operación pudo cambiar, una carrera que esta ficha no necesita; y (c) es **más
débil**, no más fuerte: excluiría limpiar cuando un `locked_until` futuro sobrevive en una fila
`active` (el caso R11), que es exactamente el agujero. Limpiar por destino es estrictamente más
seguro y más simple. Queda anotado como decisión, cubierta por **R4**.

### Alternativa descartada — exportar `clearedLockState` por el barrel para llamarlo desde fuera

No hace falta: el llamante es otro archivo del mismo `domain/`, y entre archivos del dominio se
importa por ruta relativa. Exportarlo por `lib/modules/identity/index.ts` solo añadiría superficie
pública sin consumidor (y ese archivo lo declaran otras fichas de la épica). Se descarta (R6).

## 5. Puertos, rutas, datos, dependencias, UI

- **Puertos**: un campo nuevo en `GuardedChange`; el puerto importa el tipo `AccountLockState`
  de `../domain/account-lock` (ya lo hace con `UserAccountStatus` de `../domain/account-status`).
- **Rutas y endpoints**: ninguno. La Server Action `setUserAccountStatusAction` no cambia.
- **Modelo de datos**: sin cambios; las tres columnas ya existen desde QC-19 (R9).
- **RLS**: nada que declarar, no hay tabla nueva ni cambio de filas del catálogo.
- **Dependencias de terceros**: ninguna (R9). `package.json` no cambia.
- **UI**: ninguna (R10); la regla multiplataforma no aplica.

## 6. Verificación (esbozo del mapa `R<n> → test`)

El mapa definitivo lo escribe el implementer en `progress/impl_QC-95-desbloqueo-manual-limpia-el-conteo.md`.
Aquí queda dónde vive cada familia:

| Requisitos | Dónde se prueban |
| --- | --- |
| R1, R2, R4, R6 | Nuevo o ampliado en `tests/unit/identity/usuarios/` — el caso de uso con puertos falsos: destino ≠ `blocked` → `applyGuardedChange` recibe `lockState` igual a `clearedLockState()`; destino `blocked` → `lockState: null`; el puerto no se llama con un literal. |
| R3 (una sola escritura, condicional) | El adaptador `user-admin-prisma.ts`: el `data` del `updateMany` incluye los tres contadores solo cuando `lockState` no es `null`, y en el MISMO objeto que `accountStatus`. Integración contra Postgres real donde el repo ya la tenga. |
| R5 (el desbloqueo surte efecto) | `tests/unit/identity/verify-credentials.test.ts` ya cubre que tras `clearedLockState` el siguiente fallo cuenta como el primero (caso existente, línea ~1051); se amplía o se referencia para el camino administrativo. |
| R7 | `tests/unit/identity/usuarios/admin-guards.test.ts` — sin cambios de expectativa; se verifica que sigue verde. |
| R8 | Guardias de alcance de QC-19/QC-78 (`qc78-alcance.test.ts`, `account-status-scope.test.ts`): se verifica que siguen mudas/verdes en esta rama (son por-ficha). |
| R9, R10 | Guardia de alcance de esta ficha: sin diff en `db/`, sin diff en `package.json`, sin archivos en `app/`/`components/`. |

Los tests existentes de `admin-guards.test.ts` que inspeccionan `applyGuardedChange.mock.calls`
(solo `adminRoleName` y el conteo de llamadas) **no cambian de significado** al añadir `lockState`.
Los dobles usan `satisfies UserAdminRepository` / `as unknown as`, así que tipan sin tocarlos.

Nivel de gate: `./init.sh --rapido` por tanda; `./init.sh` completo para cerrar y **antes del PR**.

## 7. Riesgos y costes aceptados

1. **El comentario «R45… es de QC-78» queda obsoleto** en tres sitios (caso de uso, puerto,
   adaptador) y dice exactamente lo contrario de lo que ahora hace la operación. Se actualiza en
   la misma tanda con las palabras «QC-95, que enmienda R45 de QC-66» para que nadie reintroduzca
   el agujero por leer el comentario viejo. Riesgo de que se deje uno sin tocar: mitigado por el
   `grep` de la task.
2. **Limpiar en destinos que no salen literalmente de `blocked`** (p. ej. `pending → active`) es
   un efecto aceptado y seguro (sección 2). Si algún día hiciera falta no limpiar ahí, se
   reabre R4; hoy no hay ningún destino no bloqueado que deba conservar contadores.