# review QC-116 — sesion-revocada-en-el-mismo-segundo

Revisado el diff `origin/dev...e02766c8`. Spec aprobado con la opción B: el login emite con el primer
segundo posterior al sello, con un tope de 2 s.

## Checklist

- [x] **Trazabilidad R1–R16.** Cada R tiene un test que lo verifica de verdad:
  - R1, R3, R4, R7 y R16: unitarios del dominio en `session-revocation.test.ts`.
  - R1, R3, R4, R5, R6 y R15: caso de uso en `verify-credentials.test.ts`.
  - R2, R9, R10 y R12: integración contra Postgres real en `login-same-second-stamp.int.test.ts`.
  - R6 en el adaptador: `login.int.test.ts`.
  - R8 y R11: tests de QC-23 sin editar y en verde (`resolve-session`, `session-revocation`,
    `end-other-sessions`).
  - R13 y R14: el diff no toca `db/` ni `package.json` (lo he comprobado).
- [x] **Tasks:** T1–T7 de `tasks.md` están marcadas `[x]`.
- [x] **Lo que ya existe** está en `design.md` y no está vacío. El diff reutiliza `isStampedOut`,
  `firstIssuedAtAfterStamp` y `floorToSecond` sin reescribir la desigualdad.
- [x] **Capas:** `issuedAtForNewSession` es dominio puro, sin reloj.
  - El test de pureza de QC-23 (`imports == ['./account-status']`) sigue verde.
  - La decisión se toma en el caso de uso (`verify-credentials.ts`).
  - El adaptador solo añade la columna al mismo `SELECT`: no cambia `WHERE` ni `LIMIT` y no hace
    ninguna lectura extra.
- [x] **Regla de comentarios:** ninguna línea de producción añadida cita `QC-n`, `R<n>`,
  `design.md` ni «decisión cerrada».
- [x] **Dependencias / RLS / esquema / UI:** no aplica, el diff no toca nada de eso.
- [x] **E2E de autenticación:** no hay E2E propio, por decisión aprobada (pregunta 4). Un E2E no
  puede forzar el mismo segundo; lo cubre la integración que encadena login, firma y resolución
  reales.
- [x] **Verificación ejecutable (la he corrido yo):**
  - Unitarios de identidad: `session-revocation`, `verify-credentials`,
    `set-user-account-status-lock`, `resolve-session` y `end-other-sessions` dan 5 archivos y
    148 tests en verde.
  - `./init.sh`: typecheck ✓, lint ✓. `login-same-second-stamp.int.test.ts` (6) y
    `login.int.test.ts` (26) en verde contra una base efímera `qct_qc116_*`, ya borrada.
  - Guardias (`vitest run guard`): 67 archivos y 907 tests en verde.
  - En `test:rapido` sale 1 rojo ajeno: ver hallazgo m1.

## Foco de seguridad

1. **La garantía de QC-23 se conserva, salvo el hueco aceptado.**
   - **Cuándo adelanta.** Solo si `floorToSecond(now) <= sello`. Un `now` que ya está en un segundo
     posterior devuelve el mismo objeto `now`. Esto lo prueba R3 con `toBe`.
   - **El tope.** Se respeta: `lifted - now <= 2000`. R4 prueba los dos bordes, 2000 ms (adelanta)
     y 2001 ms (no adelanta). Si se pasa, la emisión usa `now` y la sesión nace inválida, que es el
     lado seguro.
   - **Una sesión emitida antes del corte sigue muriendo.** El corte sigue siendo `<=` (sin tocar).
     R9 lo prueba en integración sin adelanto, y R10 con un sello nuevo en el segundo siguiente,
     tanto con adelanto como sin él.
   - **El caso límite que he comprobado.** Sello 1 en S y login adelantado a S+1. Un sello 2 en S+1
     mata la sesión: `iat == sello`, y el corte es `<=`. Solo sobrevive un sello 2 en el propio S,
     que es el hueco declarado y aceptado (`design.md > 6`). No he encontrado otro hueco.
   - **Caducidad.** `createSessionTicket` calcula `expiresAt = issuedAt + 8 h`. Con el tope, una
     sesión dura como mucho 8 h y 2 s, que es lo que fija R5 y lo que prueba el test.
   - **Cuentas no activas.** La emisión sigue después de todos los cortes, que no se han tocado:
     estado efectivo, contraseña y empresa dada de baja. Una cuenta no activa o bloqueada sigue
     rechazada.
2. **Reloj.**
   - Se lee una sola vez por intento; R15 lo prueba con `vi.fn` llamado exactamente una vez.
   - `now` solo se fija al componer el caso de uso. `lib/composition/index.ts` no lo pasa, así que
     usa el reloj del sistema. `LoginInput` no tiene ninguna vía para meterlo, así que no queda
     expuesto a la entrada del usuario.
3. **Tests.**
   - Control de mutación descrito en la bitácora: si `issuedAtForNewSession` devuelve siempre
     `now`, fallan 3 de 6 casos de integración. Además, el R7 unitario afirma
     `emitido != now` en los 6 casos que adelantan.
   - La integración corre contra una base real aislada.
   - El dominio tiene sus unitarios.

## Desviaciones

- **`tests/integration/aislamiento.json` no estaba en Archivos esperados.** Aceptada: la exige
  `guard-aislamiento-integracion` para todo `.int.test.ts` nuevo. El motivo que se registra es
  concreto y cierto: el adaptador usa el cliente global y la limpieza se hace por id en `afterAll`.
- **La bitácora se llama `impl_QC-116.md` y no lleva el nombre largo.** Aceptada: lo pidió el
  leader.

## Hallazgos

- **m1 (menor, ajeno a la feature):** `./init.sh` terminó rojo por un solo test,
  `tests/unit/inventario/adjust-batch-dialog.test.tsx` › «R9 — con el lote sobre-reservado…».
  - Falla `toastExito` llamado 0 veces.
  - No está en `tests/baseline-rojos.json`, y el diff no toca ese archivo ni su módulo.
  - Corrido solo, pasa: 30/30.
  - El implementer había tenido el gate en verde con el mismo diff.
  - Parece un test inestable bajo la carga de la corrida completa. Conviene una ficha aparte; no
    bloquea QC-116. El CI (`gate-completo`) lo confirmará.
- **m2 (menor):** el JSDoc de `isStampedOut` dice que la desigualdad la comparten «el corte por
  sello» y «la reemisión de R31». Ahora también la usa el login, a través de
  `issuedAtForNewSession`. Es un comentario preexistente que el diff no toca, así que no es
  hallazgo de la regla; queda anotado para cuando se limpie el módulo.
- **m3 (menor):** el test R16 comprueba la pureza leyendo el texto del archivo (`not.toContain('new
  Date()')`). Es frágil ante un cambio de formato, aunque el test de imports de QC-23 ya cubre la
  pureza en lo esencial.

## Veredicto

**OK.** No hay bloqueantes.
