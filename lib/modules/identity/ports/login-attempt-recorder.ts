import type { AccountLockState } from '../domain/account-lock';
import type { UserAccountStatus } from '../domain/account-status';

/**
 * El dominio **calcula** el estado del bloqueo (`nextLockState`) y el puerto solo lo
 * persiste: la politica de escalada no se reparte entre dominio y adaptador.
 *
 * Son dos primitivas de escritura y no una porque el registro de un fallo es una
 * lectura-modificacion-escritura con ~110 ms de bcrypt en medio: si la escritura fuera
 * incondicional, N intentos en paralelo leerian el mismo contador y escribirian todos el
 * mismo valor, y la cuenta no llegaria nunca a los 5 fallos que la bloquean (R22). Por eso
 * el fallo se escribe con `compareAndSet` y el dominio reintenta sobre el estado fresco.
 *
 * QC-78 (R13, R15, R16, R17) — LAS DOS PRIMITIVAS ESCRIBEN AHORA TAMBIEN EL ESTADO DE CUENTA,
 * en la MISMA operacion que el estado de bloqueo. No son dos escrituras: el bloqueo por intentos
 * y el `account_status = blocked` que lo refleja tienen que quedar o los dos o ninguno, o habria
 * un instante en que la fila dice «bloqueada» sin plazo (que R9 lee como bloqueo administrativo
 * eterno) o al reves.
 *
 * QUE SIGNIFICA `null` EN `estadoCuenta` (R17): **no toques la columna NI SU RASTRO**. No es
 * «escribe null» —la columna es NOT NULL— ni «escribe el mismo valor»: es no incluirla en la
 * escritura. La diferencia es visible desde fuera, porque `account_status_changed_at` marca el
 * ULTIMO CAMBIO REAL del estado; si cada intento de login la reescribiera con el mismo valor,
 * esa marca pasaria a significar «ultimo intento de login» y perderia su unico proposito. Quien
 * decide si hay cambio es el dominio (`accountStatusAfterAttempt`), no el adaptador.
 *
 * QUIEN LO ESCRIBIO (R13): estas dos primitivas son el camino AUTOMATICO —lo hace la politica de
 * intentos, no una persona—, asi que no reciben ningun autor y el adaptador deja
 * `account_status_changed_by` vacio, que es exactamente lo que QC-65 definio como «lo hizo el
 * sistema». Por eso no hay parametro de autor que pasar: no existe autor que pasar.
 */
export interface LoginAttemptRecorder {
  /**
   * Escritura CONDICIONAL: aplica `siguiente` solo si el estado almacenado sigue siendo
   * `esperado`, el estado de cuenta almacenado sigue siendo `estadoCuentaEsperado` **y** la fila
   * no esta bloqueada en `now`. Devuelve true si afecto a la fila, false si otro intento se
   * adelanto, si alguien cambio el estado de cuenta entre medias o si hay un bloqueo vigente.
   *
   * `now` es el instante del intento —el mismo reloj que el dominio fija una vez por
   * invocacion y con el que evaluo `isLocked` sobre el estado que leyo—. Sirve para una sola
   * cosa, pero imprescindible: **el CAS no debe aplicar nunca sobre un bloqueo vigente**.
   * Sin `now`, el par `(failedAttempts, lockLevel)` no distingue un bloqueo fresco de uno ya
   * caducado y una escritura con estado obsoleto podria borrar un bloqueo vivo (ABA); el
   * detalle esta en `compareAndSetLoginAttempt`. La implementacion debe comparar por RANGO
   * (`lockedUntil` nulo o <= `now`), no por igualdad con `esperado.lockedUntil`.
   *
   * QC-78 R18 — EL ESTADO DE CUENTA LEIDO ENTRA EN EL PREDICADO, y por eso hay que pasarlo:
   * `estadoCuentaEsperado` es el valor que el dominio leyo en ESA vuelta del bucle. Entre la
   * lectura y la escritura hay ~110 ms de bcrypt, tiempo de sobra para que un administrador
   * desactive o desbloquee la cuenta por otro camino; si ese cambio no formara parte de la
   * condicion, el registro de un intento fallido lo sobrescribiria en silencio. Al no aplicar,
   * el dominio relee la fila y recalcula sobre el estado fresco, exactamente igual que ya hacia
   * cuando perdia la carrera por el contador.
   *
   * `estadoCuenta` es el valor que corresponde ESCRIBIR, ya derivado por el dominio del estado
   * de bloqueo que va en `siguiente` (R14: la politica de escalada no se reimplementa aqui).
   * `null` = no tocar la columna ni su rastro (R17).
   */
  compareAndSet(
    userId: string,
    esperado: AccountLockState,
    siguiente: AccountLockState,
    now: Date,
    estadoCuentaEsperado: UserAccountStatus,
    estadoCuenta: UserAccountStatus | null,
  ): Promise<boolean>;
  /**
   * Escritura INCONDICIONAL. Solo para estados que no dependen del valor previo.
   *
   * QC-78 R16, R17 — `estadoCuenta` es el estado que corresponde escribir tras el intento, o
   * `null` para no tocar la columna ni su rastro. El camino de exito lo usa para devolver a
   * `active` una cuenta que estaba `blocked` (R16) y para NO escribir nada de estado cuando la
   * cuenta ya estaba `active`, que es el caso normal (R17).
   */
  set(userId: string, estado: AccountLockState, estadoCuenta: UserAccountStatus | null): Promise<void>;
}
