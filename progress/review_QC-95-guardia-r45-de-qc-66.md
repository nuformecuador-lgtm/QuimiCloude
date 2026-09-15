# Review — QC-95 · arreglo de la re-review (segunda vuelta F2.2) · 2026-09-15

> Zona `backend` · complejidad `low` · worktree `.worktrees/QC-95-guardia-r45-de-qc-66`, rama
> `feature/QC-95-guardia-r45-de-qc-66`, HEAD `04277dc` (lleva `origin/dev` = `a271eec`, PR #71).
> Commits del arreglo: `fdea487`, `16249df`, `394a6d7`, `a39cc79`. Comparado contra `origin/dev`.
> Informe que se revisa: `progress/review_QC-95-desbloqueo-manual-limpia-el-conteo-2026-09-15.md`
> (RECHAZADO, B1-B5 y m1-m8). Bitácora del arreglo: `progress/impl_QC-95-guardia-r45-de-qc-66.md`.
>
> **Decisiones humanas del 2026-09-15, no hallazgos:**
> - PR aparte a `dev`.
> - R8-R10 anclados al rango inmutable del PR #70, que falla y nunca salta.
> - m2, m6, m7 y m8 fuera a propósito.
>
> **No se corrió `./init.sh`** (lo corre el leader).

## Veredicto

**RECHAZADO.** 1 bloqueante, 2 menores.

Los cinco bloqueantes de la re-review están cerrados en código y tests, y **lo he comprobado
mutando, no leyendo** (sección 3). m1, m3, m4 y m5 también. Lo que falla es el registro de la
trazabilidad:
- El mapa `R<n> -> test` que lee el checkpoint y lee `check-trazabilidad.mjs` es el de
  `progress/impl_QC-95-desbloqueo-manual-limpia-el-conteo.md`, rastreado en `dev` y sin tocar en
  esta rama.
- Ese mapa sigue citando «verificado por git status» para R9 y R10, guardias que se saltan para
  R8, un `it` ya borrado para R5 y, para R6, el test que la re-review demostró que no lo verifica.
- El mapa correcto vive en un archivo que ningún script lee (B-N1).

---

## 1. Trazabilidad, requisito a requisito (R1-R10)

Todo lo de esta tabla lo he ejecutado yo en el worktree.
- **Batería unitaria + guardias que leen disco:** 14 archivos, 298 verdes y 12 skipped.
  - Los 12 skipped son casos de rama de QC-65, QC-66 y QC-78, con su motivo «NO ha comprobado
    nada». **Ninguno es de la guardia nueva.**
- **Integración** contra Postgres efímero: 3 archivos, 69/69.
- **Mutaciones:** sección 3.

| R | Test citado (bitácora del arreglo) | ¿Existe y pasa? | ¿Verifica el requisito? |
| --- | --- | --- | --- |
| R1 | `set-user-account-status-lock.test.ts` «R1 — destino `active`…» + `session-stamp-writes.int.test.ts` «R1/R3: mover a `active` limpia los tres contadores…» | Sí / sí | **Sí.** Mutación «`lockState` siempre `null`» en el caso de uso → R1 ROJO. La integración relee la fila en (0, 0, null). |
| R2 | `set-user-account-status-lock.test.ts` «R2 — destino `blocked`…» + `set-user-account-status-cleared-lock-state.test.ts` «R6/R2 — destino `blocked`…» + `user-admin-prisma-lock-state.test.ts` «R2/R3 — destino `blocked`…» + int «R2: mover a `blocked` NO toca los contadores…» | Sí / sí | **Sí.** Afirmado en tres niveles: el puerto recibe `null`, el doble no se llama y el `data` no lleva ninguna clave de contador. La fila conserva los contadores. No lo muté yo; la bitácora registra la mutación B2-2 (llamar también para `blocked` → ROJO) y el test leído la respalda (`not.toHaveBeenCalled`). |
| R3 | `user-admin-prisma-lock-state.test.ts` «R3 — destino `%s`… un solo `updateMany`…» y «R3 — los valores… salen de `lockState`…» + int «R1/R3», «R3: si la transaccion aborta por `last_administrator`…», «R3: un objetivo de otra empresa (`not_found`)…» | Sí / sí (int: 4/4 de QC-95) | **Sí.** Cierra m4. El unitario afirma `toHaveBeenCalledTimes(1)` sobre `tx.user.updateMany` y los cuatro campos en el mismo `data`, también con valores 2/1/2031 que no son un literal del adaptador. Los dos casos de aborto releen `accountStatus` y los tres contadores intactos. La mutación «segundo `updateMany`» es de la bitácora (m4a), no reproducida por mí; con el `toHaveBeenCalledTimes(1)` leído es inevitable que caiga. |
| R4 | `set-user-account-status-lock.test.ts` «R4 — destino `pending`…» (+ `findAliveInCompany` no llamado) + `set-user-account-status-cleared-lock-state.test.ts` «R6 — destino `inactive`…» | Sí / sí | **Sí.** Mutación «`lockState` siempre `null`» → R4 ROJO. Que no lee el estado actual lo ata `findAliveInCompany` no llamado. |
| R5 | `set-user-account-status-lock.test.ts` «R5 — `blocked` -> `active` por el caso de uso, y un fallo de login registra `failedAttempts = 1` sin rebloquear» + su «control: la MISMA fila…» | Sí / sí | **Sí, encadenado de verdad** (cierra m3). Caso de uso real → fila en memoria → `createVerifyCredentials` real. Mutación «`lockState` siempre `null`» → R5 ROJO y el control sigue VERDE, así que cae por la razón correcta. El `it` tautológico ya no existe. |
| R6 | `set-user-account-status-cleared-lock-state.test.ts` «R6 — destino `active`/`pending`/`inactive`: se llama a `clearedLockState()` una vez y el puerto recibe ESE MISMO objeto» + «R6/R2 — destino `blocked`» | Sí / sí | **Sí** (cierra B2). Mutación del literal `{ failedAttempts: 0, lockLevel: 0, lockedUntil: null }` en `set-user-account-status.ts:69`: los 3 casos caen («expected vi.fn() to be called 1 times, but got 0 times»). **Contraprueba** en la misma corrida: el R1 de `set-user-account-status-lock.test.ts` sigue VERDE con esa mutación, que era el agujero. Mutación `{ ...clearedLockState() }` → 3 ROJOS por `Object.is`. Además, `scope.test.ts` R45 también cae con el literal. |
| R7 | `authorization.test.ts`, fila `setUserAccountStatus` (línea 252) + `admin-guards.test.ts` «R21…», «R22…» | Sí / sí | **Sí** (cierra m5). Tests de QC-66 preexistentes, verdes en la batería; la fila existe en `authorization.test.ts:252`. No muté la autorización: el arreglo no toca producción fuera de dos comentarios. |
| R8 | `tests/guards/guard-qc95-alcance-del-pr-70.test.ts` «R8: el PR #70 no modifica la politica de bloqueo…» + «R8: cada archivo vigilado por R8 existe en disco…» + sintéticos | Sí / sí (19/19, 0 skipped) | **Sí** (cierra B3). El rango es el del PR #70 (sección 3.3). Mutación de SHA inexistente → caso R8 ROJO con «NO se han comprobado». Que el detector de R8 muerde lo prueban los sintéticos, que pasan por la misma `auditarRangoDelPr` con git inyectado. Ningún rango real disponible toca rutas de R8, así que no pude morderlo con git real; es una limitación inevitable, no un defecto. Rutas juzgadas en 3.3; menor m-A. |
| R9 | mismo archivo, «R9: el PR #70 no toca `db/schema.prisma`, `db/migrations/`, `package.json` ni `pnpm-lock.yaml`» + sintéticos | Sí / sí | **Sí** (cierra B4). SHA inexistente → R9 ROJO, sin salto. Sintéticos por ruta prohibida. La mordida con git real (rango de QC-65) es de la bitácora y no la reproduje; el detector es el mismo que el de R10, que sí mordí con git real. |
| R10 | mismo archivo, «R10: el PR #70 no trae nada bajo `app/` ni `components/`» + sintético | Sí / sí | **Sí** (cierra B4). Mutación del rango a `f777c56..a271eec` (PR #71, trae UI): R10 ROJO y nombra los 8 archivos de `app/(private)/configuracion/usuarios/`. Caen también las anclas (2) y (3). Con el SHA inexistente, R10 ROJO. |

**Resumen:** los diez requisitos tienen un test que existe, pasa y los verifica. **Pero el mapa
canónico no cita esos tests** (B-N1).

---

## 2. Checklist

### Encargo del leader
- [x] **B1:** `scope.test.ts` verde.
  - La excepción está en un solo sitio (`ARCHIVO_DE_LA_EXCEPCION_QC95`, `hallazgosDeLaExcepcionQC95`).
  - El fragmento se exige una vez y dentro de `applyGuardedChange`.
  - Los sintéticos (a)-(f) pasan, junto con los de huérfana y archivo real.
  - Mutaciones sobre el adaptador real, las tres ROJAS:
    - `lockedUntil: true` en `USER_ROW_SELECT` → «`lockedUntil` fuera del unico spread condicional autorizado»;
    - literal en el spread → 0 apariciones + 3 grafías;
    - spread sin condición (`input.lockState && {…}`) → 0 apariciones + 3 grafías.
- [x] **B2:** mutado el caso de uso, ROJO y restaurado. `git diff` vacío.
- [x] **B3/B4:** la guardia falla ruidosamente con un SHA inexistente (6 casos ROJOS, 0 skipped) y
  con un rango que trae archivos prohibidos (R10 ROJO). Restaurada, `git diff` vacío. Rango y rutas
  juzgados en 3.3.
- [~] **B5:** cada `[x]` (T1-T5) cumple su «Hecho» (sección 4). T6 queda `[ ]` a la espera del
  gate completo, que es lo honesto, pero su segundo punto (el mapa en la bitácora canónica) no
  está hecho: B-N1.
- [x] **m1, m3, m4 y m5 cerrados.**
  - Producción: solo los dos comentarios de m1 (`git diff origin/dev...HEAD -- lib/` = `user-input.ts`
    y `user-view.ts`, solo JSDoc).
  - Sin `package.json`, `db/`, `app/` ni `components/`.
- [ ] **Trazabilidad R1-R10 → test real:** los tests existen y verifican (sección 1). El mapa que
  lee el checkpoint no los cita: **B-N1**.
- [x] **Typecheck, lint, unitarios afectados, guardias de disco e integración:** todo verde
  (sección 5).

### `CHECKPOINTS.md`
- **Especificación**
  - [x] `requirements.md` EARS R1-R10 · `design.md` con dos alternativas descartadas.
  - [ ] `tasks.md` todas `[x]`: T6 `[ ]`. Pendiente del gate del leader y de B-N1.
- **Trazabilidad**
  - [x] Cada `R<n>` tiene un test que lo verifica.
  - [ ] `progress/impl_<feature>.md` contiene el mapa: el que lleva el nombre de la feature tiene
    un mapa **falso** en R5, R6, R8, R9 y R10 (B-N1).
- **Calidad de código**
  - [x] `tsc --noEmit` exit 0.
  - [x] `eslint` exit 0 sobre los 8 archivos tocados.
  - [x] Tests afectados verdes.
  - [~] `pnpm test` completo: no corrido (lo corre el leader).
  - [~] E2E del flujo crítico: m7, fuera por decisión humana.
  - [x] UI: no aplica.
  - [x] Dependencias: ninguna.
- **Datos y seguridad**
  - [x] Sin tabla ni modelo nuevo.
  - [x] El rechazo cruzado de `applyGuardedChange` tiene test nuevo: int «R3: un objetivo de otra
    empresa (`not_found`) conserva sus tres contadores».
  - [x] Sin RLS nueva, sin secretos, sin webhooks, sin migraciones.
- **Módulos hexagonales**
  - [x] Sin cambios de producción fuera de comentarios.
  - [x] Los tests importan por la ruta del módulo.
- **Permisos / Configuración**
  - [x] No aplica; nada hardcodeado.
- **Verificación final**
  - [ ] `./init.sh`: no corrido (leader).
  - [ ] Review con OK: esta es RECHAZADO.
  - [~] `history.md`: m6, fuera por decisión.
  - [x] Worktree: vivo a propósito para el PR aparte.

### Checks 6-8 del reviewer
- [x] Multiplataforma: no aplica.
- [x] Dependencias: el diff no toca `package.json`.
- [x] Aislamiento por empresa: sin modelo nuevo. La consulta modificada conserva el `companyId` en
  el `where` (afirmado en `user-admin-prisma-lock-state.test.ts > unicoData`) y tiene test de
  rechazo cruzado.

---

## 3. Verificación ejecutada, bloqueante a bloqueante

Todas las mutaciones se hicieron con copia en el scratchpad, `sed` sobre el archivo real y
restauración con `cp` más `cmp`. Al terminar, `git status --porcelain` y `git diff --stat`
salen vacíos.

### 3.1 B1 — `tests/unit/identity/usuarios/scope.test.ts`

- **Verde en la batería.** El caso «R45 (QC-95 enmienda R45 de QC-66)…» ✓, más los 8 del
  `describe` «QC-95 enmienda R45 de QC-66: la excepcion de applyGuardedChange muerde».
- **La excepción existe una sola vez.**
  - Hay una constante de archivo, una función que la evalúa y un único punto de uso en el bucle
    (`if (archivo === ARCHIVO_DE_LA_EXCEPCION_QC95)`).
  - Hay un ancla que exige que ese archivo siga en `ARCHIVOS_NUEVOS_DE_LA_FEATURE`.
  - Los otros 20 archivos pasan por el barrido original sin cambios.
- **El patrón exige, token a token:** `input.lockState === null ? {} : {…}` y los tres valores
  leídos de `input.lockState`. Solo tolera espacios y la coma final.
- **Tres mutaciones sobre el archivo real, las tres ROJAS:**

  | Mutación | Resultado |
  | --- | --- |
  | `lockedUntil: true` en `USER_ROW_SELECT` | 2 casos rojos: «`lockedUntil` fuera del unico spread condicional autorizado» |
  | `failedLoginAttempts: 0` dentro del spread | 2 rojos: «(0 apariciones)» + las tres grafías |
  | `...(input.lockState && {…})` sin la condición | 2 rojos: «(0 apariciones)» + las tres grafías |

- **Observación, no hallazgo.** `limitesDeApplyGuardedChange` corta en el primer `}` en columna 0.
  Si alguien reformatea a una indentación en la que el cierre de la función no queda en columna 0,
  el límite se estira hasta el siguiente `export` o el EOF. Solo afloja «dentro de la función», no
  «una vez», y con Prettier del repo no ocurre.

### 3.2 B2 — R6

- **Literal `{ failedAttempts: 0, lockLevel: 0, lockedUntil: null }`** en
  `set-user-account-status.ts:69`:
  - `set-user-account-status-cleared-lock-state.test.ts`: **3 rojos** (`active`, `pending`,
    `inactive`: «expected vi.fn() to be called 1 times, but got 0 times»).
  - El R1 por valor del archivo hermano sigue **verde**, que es la contraprueba de que antes no
    bastaba.
  - `scope.test.ts` R45 también cae (el literal nombra `lockLevel` y `lockedUntil`).
- **Copia por valor `{ ...clearedLockState() }`:** 3 rojos por `Object.is`.
- **Restaurado:** `git diff --quiet` OK.
- **El `vi.mock` por alias intercepta el import relativo** del caso de uso: si no lo hiciera, el
  archivo sin mutar daría 0 llamadas y caería, y está verde.

### 3.3 B3/B4 — `tests/guards/guard-qc95-alcance-del-pr-70.test.ts`

**El rango es el del PR #70.**
- Los padres de `f777c56` (formato `%P`) son `0ed8431… f728d15…`, y `f728d15` tiene como único
  padre `0ed8431`.
- `git diff --name-only --no-renames` de `0ed8431..f777c56` y del commit `f728d15` contra su padre
  dan los mismos 11 archivos.
- `gh pr view 70` confirma `base: dev`, `mergeCommit: f777c56…` y **la misma lista de 11
  archivos**.
- El rango primario de merge es la elección correcta: vería una resolución de conflicto hecha en
  el merge.

**Fallo ruidoso.**
- `BASE_DEL_PR_70 = deadbeef…` → **6 rojos, 13 verdes, 0 skipped**. El mensaje dice «QC-95 R8, R9
  y R10 NO se han comprobado: el commit deadbeef… no existe en este clon (el clon no es
  superficial…)» y remite a `git fetch origin dev`.
- No hay `ctx.skip` en el archivo.

**Rango con prohibidos.** Las tres constantes se cambiaron al PR #71 (`f777c56..a271eec`, feature
`4021021`): **R10 ROJO nombrando los 8 archivos de `app/`**, y anclas (2) y (3) rojas. El ancla
(1) pasa, porque los padres son coherentes: demuestra que la detección de R10 no depende de que
caigan las anclas.

**Las 10 rutas de R8. Correctas y no excesivas.**
- Las 10 existen en disco.
- **Nombradas por R8:**
  - `nextLockState` e `isLocked` viven en `account-lock.ts`, y `effectiveAccountStatus` en
    `effective-account-status.ts` (grep de `export function`).
  - `verify-credentials.ts` y `resolve-session.ts`.
- **Añadidas.** Son la persistencia y la entrada de esos mismos cálculos:
  - `login-attempt-recorder.ts` y `user-credentials-reader.ts` + `user-credentials-prisma.ts`, del
    login;
  - `session-user-reader.ts` + `session-user-prisma.ts` y `resolve-session-user.ts`, de la sesión.
  - Todas leen o escriben `lockedUntil`, o envuelven la resolución.
- **Fuera, bien dejados:** `credential-policy.ts`, `account-status.ts` y `lib/composition/index.ts`.
  Tampoco entran `assignment-directory-prisma.ts` ni `work-group-prisma.ts`, que nombran
  `lockedUntil` pero no son el login ni la sesión.
- **No excesivas para el caso de rango:** sobre un rango inmutable, una ruta de más no puede dar
  un falso positivo.
- **Sí tiene un coste** en el caso de existencia en disco: menor m-A.

### 3.4 B5 — sección 4.

### 3.5 Menores de la re-review
- **m1:**
  - Los comentarios nuevos de `user-input.ts:20-23` y `user-view.ts:15-17` son ciertos. El
    `strictObject` que invoca `user-input.ts` existe (`createUserSchema`, `setAccountStatusSchema`).
  - Grep de T5 sobre `HEAD`, ampliado con «no los lee ni los escribe»: ninguna línea contradice el
    código. Las que quedan son del R45 de QC-23 (`session-revocation-prisma.ts`), de la autoría de
    un párrafo (`resolve-session.ts:119`) o notas ya enmendadas.
- **m3:** sección 1, R5.
- **m4:** sección 1, R3.
- **m5:** sección 1, R7.

---

## 4. `tasks.md`: cada `[x]` contra su «Hecho»

| Task | «Hecho» | ¿Se cumple? |
| --- | --- | --- |
| T1 `[x]` | typecheck verde y `lockState` en la variante `account_status` con JSDoc | **Sí.** `user-admin-repository.ts:137` declara `readonly lockState` de tipo `AccountLockState` o `null`, con JSDoc en 131-136; `tsc --noEmit` exit 0 (corrido por mí). |
| T2 `[x]` | test del adaptador que demuestra los tres contadores en el MISMO `data` con `lockState` y ninguno con `null` | **Sí.** `user-admin-prisma-lock-state.test.ts`, verde (5/5). |
| T3 `[x]` | typecheck verde; `lockState` al puerto; sin literal cero/cero/null en el archivo | **Sí.** `set-user-account-status.ts` en `HEAD`: las únicas apariciones son el import, dos comentarios y la línea 69 con `clearedLockState()`. Ninguna de `failedAttempts`, `lockLevel` ni `lockedUntil`. |
| T4 `[x]` | `vitest related` sobre lo tocado, verde | **Sí.** Batería de 14 archivos verde; `admin-guards.test.ts` sin cambios (no aparece en el diff). |
| T5 `[x]` | el grep no devuelve notas obsoletas | **Sí** (3.5, m1). |
| T6 `[ ]` | `./init.sh --rapido` por tanda y `./init.sh` completo verde; **y** «dejar constancia del mapa `R<n> -> test` en `progress/impl_QC-95-desbloqueo-manual-limpia-el-conteo.md`» | **No, y está bien marcada `[ ]`**, pero no solo por el gate: el mapa no está en ese archivo (B-N1). La casilla dice «el mapa esta en `progress/impl_QC-95-guardia-r45-de-qc-66.md`», que no es lo que pide la task. |

---

## 5. Comandos ejecutados

**Entorno.** En este worktree `pnpm exec vitest` falla («Command "vitest" not found») y no hay
`node_modules/.bin` local. Se usaron los binarios de
`C:/Users/Cristian/Documents/trabajo/arc/labs/node_modules/.bin/`. `.next/types` ya existía, así
que `tsc` no dio el falso `LayoutProps`.

| Qué | Comando | Resultado |
| --- | --- | --- |
| Typecheck | `tsc --noEmit` | exit 0 |
| Lint | `eslint` sobre `user-input.ts`, `user-view.ts`, la guardia nueva, `session-stamp-writes.int.test.ts`, `scope.test.ts`, `set-user-account-status-cleared-lock-state.test.ts`, `set-user-account-status-lock.test.ts` y `user-admin-prisma-lock-state.test.ts` | exit 0 |
| Unitarios y guardias | `vitest run --reporter=verbose` sobre los seis de `tests/unit/identity/usuarios/` (`scope`, `set-user-account-status-lock`, `set-user-account-status-cleared-lock-state`, `user-admin-prisma-lock-state`, `admin-guards`, `authorization`), los seis de `tests/unit/identity/` (`verify-credentials`, `effective-account-status`, `account-lock`, `qc78-alcance`, `account-status-scope`, `credential-policy-contract`), `identity/credencial/scope` y la guardia nueva | **14 archivos, 298 verdes y 12 skipped** (rama QC-65/66/78) |
| Integración | `.env` cargado, `vitest run --project integration` sobre `session-stamp-writes`, `last-administrator` y `user-crud` (`.int.test.ts`) | **3 archivos, 69/69**; base efímera `qct_qc95_0a1ff440_mu2ztk2s_c7g` creada y borrada |
| Rango y PR | padres del merge, `git diff --name-only --no-renames` sobre los dos rangos, `gh pr view 70` | coinciden (11 archivos) |
| Mutaciones | B1 ×3, B2 ×2, R5/m3 ×1, B3/B4 ×2 | todas ROJAS, restauradas, árbol limpio |

---

## 6. Hallazgos

### BLOQUEANTE

**B-N1 — El mapa `R<n> -> test` canónico de QC-95 es falso y el arreglo no lo toca.**

- **Qué pasa.** `progress/impl_QC-95-desbloqueo-manual-limpia-el-conteo.md` es el archivo con el
  nombre de la feature, rastreado en `dev` y sin tocar en esta rama (`git diff origin/dev HEAD`
  sobre él: vacío). Su tabla dice:
  - **R5:** «test de R1 (comentario de referencia)». El `it` tautológico al que remitía se borró en
    `394a6d7`.
  - **R6:** «`set-user-account-status-lock.test.ts` compara contra `clearedLockState()`, no contra
    literal». Es exactamente el test que la re-review (B2) demostró que NO verifica R6, y que he
    vuelto a ver verde con el literal mutado.
  - **R7:** solo `admin-guards.test.ts` (m5 sin reflejar).
  - **R8:** «guardias por-ficha… mudas/verdes», que se saltan.
  - **R9:** «verificado por grep de git status».
  - **R10:** «verificado por git status».
- **Por qué es bloqueante y no una nota.**
  - Es el archivo que exige `CHECKPOINTS.md > Trazabilidad` («`progress/impl_<feature>.md`
    contiene el mapa») y el que lee `scripts/check-trazabilidad.mjs` (nombre derivado del
    `spec_path`, líneas 57-59).
  - Ese script cuenta cualquier línea que abra con `R<n>`, así que **sigue saliendo verde con estas
    filas falsas**: la máquina da por trazado lo que la re-review rechazó.
  - El mapa correcto está en `progress/impl_QC-95-guardia-r45-de-qc-66.md`, que nada lee.
  - Mergear este PR así deja en `dev` un registro de trazabilidad que contradice los tests reales.
    Es el mismo tipo de afirmación sin respaldo que la re-review señaló en m6.
- **La propia T6 lo pide:** «Dejar constancia del mapa `R<n> -> test` en
  `progress/impl_QC-95-desbloqueo-manual-limpia-el-conteo.md`». La bitácora del arreglo lo deja
  como punto abierto 2 para el leader, pero es trabajo del implementer.
- **Qué hacer: REEMPLAZAR, no solo enlazar.**
  - En `progress/impl_QC-95-desbloqueo-manual-limpia-el-conteo.md`, sustituir la tabla «Mapa
    `R<n> → test`» por la tabla de la bitácora del arreglo: diez filas que abran con `R<n>`.
  - Encima, una nota fechada: «Mapa reemplazado el 2026-09-15 tras la re-review
    (`progress/review_QC-95-desbloqueo-manual-limpia-el-conteo-2026-09-15.md`); el detalle del
    arreglo y las mutaciones, en `progress/impl_QC-95-guardia-r45-de-qc-66.md`».
  - **Un enlace solo no basta:** `check-trazabilidad.mjs` exige filas que abran con `R<n>` y se
    pondría rojo.
  - **Dejar la tabla vieja junto a la nueva tampoco:** el script pasaría igual, pero el lector
    encontraría dos mapas contradictorios.
  - Opcional: marcar en ese archivo que su sección «Salida real de verificación» (el `LayoutProps`
    ambiental) es de la entrega original.
  - Hecho eso, el segundo punto de T6 queda cumplido; la casilla sigue esperando `./init.sh`
    completo.

### menores

**m-A — La comprobación «cada ruta de R8 existe en disco» acopla la guardia inmutable al árbol vivo,
y la ampliación a 10 rutas duplica ese acoplamiento.**
- La bitácora dice que «una ruta de más no puede dar un falso positivo en el futuro; solo
  endurece». Es cierto para el caso de rango, pero no para el caso de existencia en disco.
- Si una ficha futura renombra, por ejemplo, `session-user-prisma.ts` o `login-attempt-recorder.ts`,
  esta guardia de QC-95 se pone roja en el PR de esa ficha. Eso contradice la cabecera («este
  archivo no se pondrá rojo por trabajo ajeno… no repite el fallo de las seis guardias de
  `tests/baseline-rojos.json`»).
- **Sugerencia:** comprobar la existencia en el árbol del merge, no en disco (`git cat-file -e`
  sobre `f777c56` más la ruta, o `git ls-tree`). Mantiene «no medir aire», porque la ruta existía
  cuando el PR se mergeó y el rango la habría visto, y sin depender de renombrados posteriores.
- El título y el mensaje del caso tendrían que decir lo mismo.

**m-B — Los títulos de los casos de la guardia nueva llevan los SHAs escritos a mano** («ancla (1):
el merge f777c56 tiene exactamente los padres 0ed8431 (dev) y f728d15 (la feature)») en vez de
derivarlos de las constantes.
- Con el rango mutado al PR #71, el título seguía hablando de `f777c56` mientras medía `a271eec`.
- Cosmético: los mensajes de fallo sí usan las constantes.

### Observaciones (no son hallazgos)
- `scripts/check-trazabilidad.mjs` no está en `origin/dev`, solo en la rama del arnés (`e10e7df`).
  Hoy en `dev` nadie cruza el mapa. Cuando entre el arnés, lo leerá tal como se describe en B-N1.
- El punto abierto 3 de la bitácora es corrección de spec, en la línea de m2 y m8 (fuera por
  decisión): R8 atribuye `nextLockState` e `isLocked` a QC-19, y según `git log` nacieron en QC-7.
- `pnpm exec` no resuelve binarios en este worktree (entorno). Conviene saberlo antes del gate.
