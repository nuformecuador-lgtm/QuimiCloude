// QC-23 T6 — La regla de «que sesion mata el sello» y «que cambio sube el sello»
// (`design.md > 2.3`, `> 4.1`, `> 5.5`). Cubre R8, R9, R33, R34, R35, R36.
//
// Dominio PURO: sin `next/*`, sin Prisma, sin `lib/shared/**`, sin puertos y sin adaptadores.
// **`now` no se lee nunca aqui dentro**: los instantes entran como parametro, que es lo que hace
// estas funciones deterministas y probables con objetos planos. Quien decide el «ahora» es el
// caso de uso o el adaptador que abre la transaccion.
//
// Que este archivo NO hace: no escribe, no lee, no conoce el registro de sesiones cerradas y no
// sabe si existe una tabla. Aqui solo vive la DECISION; la aplicacion vive en el adaptador que ya
// tiene la transaccion con bloqueo de fila (`design.md > 5.5`).

import type { UserAccountStatus } from './account-status';

/**
 * Un instante truncado al SEGUNDO, hacia abajo.
 *
 * Existe porque `iat` viaja **en segundos** dentro del contenido firmado (`session-token.ts >
 * toEpochSeconds`, decision cerrada del 2026-09-01 que este modulo no puede reinterpretar). Si el
 * sello se guardara con milisegundos, la comparacion de `isStampedOut` mezclaria dos
 * granularidades y el caso «se sube el sello y se reemite la sesion actual en el mismo segundo»
 * (R31) seria un volado: un `iat` truncado a las 10:00:00 contra un sello de las 10:00:00.437
 * saldria valido por 437 ms de nada.
 *
 * La regla entera, en una linea: **el sello se escribe truncado al segundo** (`design.md > 2.3`).
 *
 * No muta la fecha que se le pasa: devuelve una nueva. Mutar el argumento de quien llama seria
 * mover un instante que puede estar ya dentro de un ticket emitido.
 */
export function floorToSecond(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 1000) * 1000);
}

/**
 * ¿El sello del usuario mata esta sesion? (R8, R9.)
 *
 * **LA COMPARACION ES `<=`, NO `<` ESTRICTO.** Es una decision aprobada por escrito
 * (`design.md > 2.3` y alternativa descartada 4), y el motivo es que «valido desde» significa
 * *estrictamente despues*:
 *
 * | Sesion | `iat` | Resultado |
 * | --- | --- | --- |
 * | Otra, emitida antes | `< sello` | invalida |
 * | Otra, emitida **en el mismo segundo** que el sello | `== sello` | **invalida** |
 * | La actual, reemitida por R31 | `sello + 1 s` | valida |
 *
 * Con `<` estricto, una sesion ajena emitida en el mismo segundo del corte sobreviviria: un
 * agujero de hasta un segundo en la revocacion, y un agujero de un segundo en una revocacion
 * sigue siendo un agujero (decision cerrada 13, «una revocacion que se puede saltar provocando un
 * fallo no es una revocacion»). El precio de cerrarlo es que la sesion reemitida de R31 dura un
 * segundo mas de ocho horas. Se paga.
 *
 * **Este es el UNICO cuerpo de esa desigualdad en todo el repositorio**: lo comparten el corte
 * por sello de `resolve-session.ts` y el calculo del `issuedAt` de la reemision de R31
 * (`firstIssuedAtAfterStamp`, aqui abajo). Dos copias serian dos formas de equivocarse.
 *
 * Toma la forma minima que necesita —un objeto con `issuedAt`— y no `SessionClaims` entero para
 * que se pueda probar con objetos planos y para que el dia que R31 la invoque desde otro sitio no
 * haya que fabricar unos claims completos.
 */
export function isStampedOut(
  claims: { readonly issuedAt: Date },
  sessionsValidFrom: Date,
): boolean {
  return claims.issuedAt.getTime() <= sessionsValidFrom.getTime();
}

/**
 * El paso de un segundo, en milisegundos. Es la granularidad de `iat` (ver `floorToSecond`), no
 * un margen de cortesia: por debajo de un segundo el token no sabe expresar la diferencia.
 */
const ONE_SECOND_MS = 1000;

/**
 * El PRIMER instante de emision que sobrevive a un sello (R31, `design.md > 2.3`).
 *
 * Es el complemento exacto de `isStampedOut`, y existe para que el calculo del `issuedAt` de la
 * sesion reemitida no escriba una segunda vez la desigualdad de arriba. Su contrato es esa
 * desigualdad y nada mas: `isStampedOut({ issuedAt: firstIssuedAtAfterStamp(s) }, s) === false`,
 * y un milisegundo antes ya seria `true`. Su test lo ancla asi, contra `isStampedOut`, en vez de
 * contra un numero escrito a mano.
 *
 * El sello entra ya truncado al segundo por quien lo escribio (`floorToSecond`); se vuelve a
 * truncar aqui por si acaso, porque esta funcion decide una emision y equivocarse por 437 ms
 * significa emitir una sesion que nace invalida.
 */
export function firstIssuedAtAfterStamp(sessionsValidFrom: Date): Date {
  return new Date(floorToSecond(sessionsValidFrom).getTime() + ONE_SECOND_MS);
}

/**
 * El cambio que se le hace a una persona, en la forma minima que hace falta para decidir si le
 * corta las sesiones. Union discriminada: añadir un cuarto tipo de cambio obliga a ampliar
 * `changeRevokesSessions` o el `switch` deja de compilar.
 */
export type UserChange =
  | { readonly kind: 'account_status'; readonly next: UserAccountStatus }
  | { readonly kind: 'role'; readonly changed: boolean }
  | { readonly kind: 'delete' };

/**
 * ¿Este cambio deja invalidas todas las sesiones vivas de esa persona? (R33, R34, R35, R36.)
 *
 * Funcion pura y sin `now`: la DECISION vive aqui, la APLICACION vive en el adaptador, dentro de
 * la misma transaccion con bloqueo de fila que escribe el cambio (R38, `design.md > 5.5`). Si la
 * escritura no se confirma, el sello no sube; si el sello no puede subir, la escritura no se
 * confirma.
 *
 * - **`account_status`** → `true` para `blocked` e `inactive` (R33); **`false` para `pending` y
 *   `active`** (R36). Una cuenta pendiente nunca llego a tener sesion, asi que no hay nada que
 *   cortar; y volver a `active` no puede subir el sello, porque subirlo al reactivar echaria a
 *   quien acabara de entrar. Consecuencia declarada y aceptada (`design.md > 12.3`): mover una
 *   cuenta `active` a `pending` y devolverla a `active` dentro de las 8 h **revive** sus cookies.
 *   Si algun dia molesta, es una linea aqui y su test.
 * - **`role`** → `true` SOLO si el rol cambio de verdad (R35). QC-66 R19 es reemplazo completo y
 *   casi toda edicion de usuario reescribe el mismo `role_id`: cortar ahi echaria a la persona
 *   cada vez que un administrador le corrige el telefono.
 * - **`delete`** → `true` (R34), sin condicion: el borrado es logico, y el corte inmediato que ya
 *   hace `resolve-session.ts` sobre la fila muerta no basta —esta ficha lo hace DURADERO—.
 *
 * Lo que NO decide esta funcion: el cambio de contrasena. Ese no es una variante mas porque no es
 * una decision —siempre corta, por los tres caminos (R30)— sino una regla sobre la escritura:
 * toda transaccion que escriba `users.password_hash` sube `sessions_valid_from` en la MISMA
 * sentencia, y lo hace cumplir `tests/guards/guard-sesiones-cortadas.test.ts` (`design.md > 5.4`).
 */
export function changeRevokesSessions(change: UserChange): boolean {
  switch (change.kind) {
    case 'account_status':
      return change.next === 'blocked' || change.next === 'inactive';
    case 'role':
      return change.changed;
    case 'delete':
      return true;
  }
}
