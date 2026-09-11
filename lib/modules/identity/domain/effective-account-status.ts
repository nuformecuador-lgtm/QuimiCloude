// QC-78 T2 — EL ESTADO EFECTIVO, en un solo sitio (`design.md > 1`, R7-R15, R17, R24).
//
// El estado ALMACENADO (`users.account_status`, de QC-65) no basta por si solo para decidir si
// una cuenta entra: una fila puede decir `blocked` con un plazo que ya vencio, o decir `active`
// con un plazo todavia vigente puesto por la politica de intentos de QC-19. Traducir «lo que la
// columna dice» a «lo que significa AHORA» es una sola regla, y R7 exige que viva en una sola
// funcion de dominio puro por la que pasen TODOS los lectores —el login y la resolucion de
// sesion—, en vez de que cada uno compare la columna por su cuenta.
//
// POR QUE UN ARCHIVO APARTE Y NO DENTRO DE `account-status.ts` (alternativa descartada en
// `design.md > 1`): `account-status.ts` es el CATALOGO de valores, y meter ahi una politica que
// depende del reloj y del estado de bloqueo lo convertiria en dos cosas a la vez. Ademas QC-66
// va a tocar ese archivo, y un archivo nuevo deja los dos diffs sin interseccion. El coste
// aceptado es un archivo mas en `domain/`.
//
// POR QUE `blocked` SIN PLAZO NO CADUCA (decision cerrada del 2026-09-08, R9): el plazo es lo
// unico que distingue el bloqueo AUTOMATICO —lo puso la politica de intentos y caduca solo— del
// bloqueo que puso una PERSONA —sin plazo, no caduca nunca hasta que otra persona lo levante—.
// No hace falta ningun dato nuevo para saberlo, pero si hace falta que ninguna escritura
// automatica cree por error esa combinacion: de eso se encarga `accountStatusAfterAttempt`
// (R15), que devuelve a `active` toda fila `blocked` cuyo nuevo estado de bloqueo se quede sin
// plazo.
//
// Dominio puro: `now` entra SIEMPRE por parametro —nunca `new Date()` aqui dentro—, sin base,
// sin framework y sin `lib/shared/**`.

import { type AccountLockState, isLocked } from './account-lock';
import type { UserAccountStatus } from './account-status';

// Los cuatro literales del catalogo se nombran una vez aqui para no esparcirlos por las ramas
// de decision. NO se declaran en `account-status.ts`: ese archivo es de QC-65 y esta ficha lo
// lee, no lo modifica.
const ACTIVE: UserAccountStatus = 'active';
const PENDING: UserAccountStatus = 'pending';
const INACTIVE: UserAccountStatus = 'inactive';
const BLOCKED: UserAccountStatus = 'blocked';

/**
 * Lo MINIMO que hace falta de una fila de `users` para traducir su estado: el valor almacenado y
 * el plazo de bloqueo. Se pide el valor crudo y no un booleano ya cocinado del otro lado del
 * puerto, porque «activa» es una regla de dominio y cocinarla fuera la sacaria del unico sitio
 * donde se prueba con objetos planos.
 */
export type AccountStatusView = {
  readonly accountStatus: UserAccountStatus;
  readonly lockedUntil: Date | null;
};

/**
 * El estado que una cuenta tiene DE VERDAD en el instante `now` (R7-R12).
 *
 * Es total: para cualquier par (estado almacenado, plazo) devuelve un estado. El orden de las
 * ramas importa y no es casual:
 *
 *   1. `pending` e `inactive` mandan sobre el plazo (R12). Son decisiones administrativas sobre
 *      la cuenta entera; un `locked_until` colgando de una serie de fallos vieja no las
 *      convierte en `blocked` ni las levanta.
 *   2. Plazo todavia vigente -> `blocked`, DIGA LO QUE DIGA la columna (R10 y R11). R11 es el
 *      caso de las filas que QC-19 bloqueo antes de que esta ficha unificara las dos cosas:
 *      estan en `active` con plazo futuro y tienen que quedarse fuera.
 *   3. `blocked` sin plazo -> `blocked` en cualquier instante (R9, bloqueo administrativo).
 *   4. `blocked` con el plazo ya vencido -> `active` (R8). Aqui es donde «la ficha se corrige al
 *      leerla» sin escribir nada: la fila se arregla de verdad en el camino de escritura del
 *      login (R15, R16), no al leerla (R21).
 */
export function effectiveAccountStatus(view: AccountStatusView, now: Date): UserAccountStatus {
  if (view.accountStatus === PENDING || view.accountStatus === INACTIVE) return view.accountStatus;

  // La comparacion de plazos tiene UNA sola implementacion en todo el modulo (R7): la de
  // `isLocked`. Los contadores van a cero porque a esta funcion no le importan: `isLocked` solo
  // mira `lockedUntil`, y reescribir aqui un `getTime() >` seria la segunda copia de la regla.
  if (isLocked({ failedAttempts: 0, lockLevel: 0, lockedUntil: view.lockedUntil }, now)) {
    return BLOCKED;
  }

  if (view.accountStatus === BLOCKED && view.lockedUntil === null) return BLOCKED;

  return ACTIVE;
}

/**
 * Que estado de cuenta corresponde PERSISTIR tras un intento de login, dado el estado ALMACENADO
 * y el estado de bloqueo que ya calculo `nextLockState`. `null` significa «no toques la columna
 * ni su rastro de cambio» (R17).
 *
 * El estado de cuenta se DERIVA del estado de bloqueo, no se decide aparte (R14): la politica de
 * escalada —5 fallos, plazos de 1, 5, 15 y 60 minutos— sigue viviendo entera en `account-lock.ts`
 * y aqui solo se lee su resultado. Por eso no aparece ni un numero en esta funcion.
 *
 * Las tres ramas:
 *   - hay plazo nuevo -> la cuenta queda `blocked`, salvo que ya lo estuviera: repetirlo
 *     escribiria un rastro de cambio que no corresponde a ningun cambio (R17), y la marca de
 *     ultimo cambio dejaria de significar «cambio real» para significar «ultimo intento».
 *   - no hay plazo y la fila estaba `blocked` -> vuelve a `active` (R15). Esta es la barrera que
 *     impide que un fallo suelto sobre un bloqueo ya caducado deje la fila en `blocked` con el
 *     plazo vacio, combinacion que R9 lee como «bloqueo administrativo eterno».
 *   - resto -> `null`.
 *
 * `pending` e `inactive` nunca llegan aqui: el corte de R5 les cierra el paso antes de cualquier
 * escritura.
 */
export function accountStatusAfterAttempt(
  stored: UserAccountStatus,
  next: AccountLockState,
): UserAccountStatus | null {
  if (next.lockedUntil !== null) return stored === BLOCKED ? null : BLOCKED;

  if (stored === BLOCKED) return ACTIVE;

  return null;
}

/**
 * El estado de bloqueo que corresponde a una cuenta que SALE de `blocked` (R24): contador de
 * intentos, nivel de escalada y plazo, los tres limpios a la vez.
 *
 * Los tres, y no solo el plazo: dejar el contador o el nivel altos volveria a bloquear la cuenta
 * al primer fallo siguiente, y encima con la duracion escalada del nivel viejo (R25). Es el
 * mismo precedente que QC-19 R27 sento para el ingreso correcto.
 *
 * Esta ficha entrega el MECANISMO; la operacion que mueve el estado a mano es de QC-66, que
 * tiene que aplicarlo en la misma escritura que saca la cuenta de `blocked`.
 */
export function clearedLockState(): AccountLockState {
  return { failedAttempts: 0, lockLevel: 0, lockedUntil: null };
}
