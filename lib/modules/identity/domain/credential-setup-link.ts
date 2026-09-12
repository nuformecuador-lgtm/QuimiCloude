// QC-79 T8 — LA VIDA DEL ENLACE, en dominio puro (`design.md > 3.1`, `> 4.4`, `> 4.6`; R8, R12).
//
// Aqui vive la unica definicion de «cuanto vale un enlace» y de «que le pasa a un enlace». Es
// dominio puro (R32): sin `next/*`, sin `react*`, sin `@prisma/client`, sin `lib/shared/**` y sin
// adaptadores. `now` entra SIEMPRE por parametro -nunca `new Date()` aqui dentro-, que es el mismo
// criterio con el que `effective-account-status.ts` traduce el estado de una cuenta (QC-78).
//
// POR QUE ESTE ARCHIVO EXISTE, si la comprobacion de verdad la hace el `UPDATE` condicional de
// `design.md > 4.6`: porque el plazo -7 dias- y las tres formas de morir -consumido, sustituido,
// caducado- son REGLA, y una regla escrita solo dentro de una sentencia SQL no se puede probar con
// objetos planos ni se puede leer desde el caso de uso. Lo que este archivo NO hace es convertirse
// en un SEGUNDO camino de comprobacion que pueda divergir del `UPDATE` (`design.md > 11.4` descarta
// exactamente eso para la pagina publica): `evaluateLink` sirve para razonar y para probar; quien
// decide en produccion, en una sola escritura atomica, sigue siendo la base.
//
// Por eso el predicado de abajo es DELIBERADAMENTE el mismo que el del `UPDATE` de § 4.6
// -`consumed_at IS NULL AND superseded_at IS NULL AND expires_at > $now`-, hasta en el borde: en el
// instante EXACTO de la caducidad el enlace ya NO vale, porque `expires_at > now` es falso cuando
// son iguales. Dos verdades sobre el mismo borde serian peor que cualquier eleccion.

/**
 * QC-79 T12 (`design.md > 6.1`, R4, R37) — LO QUE SE ESCRIBE CUANDO NO HAY CREDENCIAL.
 *
 * `users.password_hash` es `NOT NULL` y esta ficha **no toca el modelo de `users`** (R37): ni
 * columna, ni indice, ni migracion. Asi que el alta sin contrasena escribe un **centinela imposible
 * de verificar**: la cadena `'!'`, que no es un hash bcrypt valido y contra la que
 * `verifyPasswordHash` devuelve `false` para **cualquier** entrada -incluida la cadena centinela
 * misma-. Es la convencion `!`/`*` de `/etc/shadow`, y es lo que hace cierto R4: ningun intento de
 * acceso con ninguna contrasena tiene exito sobre esa cuenta mientras no se establezca una por el
 * enlace.
 *
 * Las dos alternativas obvias estan descartadas por escrito (`design.md > 6.1`, `> 11.6`): hacer la
 * columna anulable es una migracion sobre `users` que R37 prohibe -y obligaria a todo el camino de
 * login a tratar un `null` que hoy no puede llegar-; y guardar el hash de una cadena al azar cuesta
 * un bcrypt por alta para producir un valor que nadie verificara nunca, y deja indistinguible «no
 * tiene credencial» de «tiene una que nadie conoce», que es justo la ambiguedad que esta ficha
 * viene a quitar.
 *
 * **Se declara UNA sola vez, y aqui, que es dominio.** El adaptador de Prisma la importa; escribir
 * el literal `'!'` en el adaptador seria una segunda verdad sobre la misma decision, y un test de
 * integracion que la afirmara contra Postgres estaria comprobando su propia copia.
 */
export const NO_CREDENTIAL_SENTINEL = '!';

/** Los dias que vive un enlace desde que se emite (R8, decision cerrada 3). */
export const CREDENTIAL_SETUP_LINK_TTL_DAYS = 7;

/** Milisegundos de un dia. Se nombra para que la multiplicacion de abajo se lea. */
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Los 7 dias en milisegundos. Se deriva de la constante de arriba y no se escribe aparte: un
 * segundo numero seria una segunda verdad sobre la misma decision.
 */
export const CREDENTIAL_SETUP_LINK_TTL_MS = CREDENTIAL_SETUP_LINK_TTL_DAYS * MILLISECONDS_PER_DAY;

/**
 * Lo que el dominio sabe de un enlace, calcado del modelo de `design.md > 3.1` y sin nada mas.
 *
 * **No aparece el secreto por ningun lado, y es el punto entero de R9**: en la base solo hay su
 * huella (`digest`, SHA-256 en hexadecimal), y aqui tampoco hay hueco donde colarlo. Quien tenga
 * uno de estos objetos no puede reconstruir ningun enlace.
 *
 * Los tres instantes son columnas distintas a proposito (`design.md > 3.1`): una fila tiene
 * exactamente tres transiciones posibles -nace, se consume, se sustituye- y cada una tiene la suya,
 * de modo que el objeto dice CUAL ocurrio y no solo «algo cambio».
 */
export type CredentialSetupLink = {
  /** El usuario al que pertenece. No hay empresa: se deriva de el (R37). */
  readonly userId: string;
  /** Huella SHA-256 del secreto, en hexadecimal. Nunca el secreto (R9). */
  readonly digest: string;
  /** Instante de emision (`created_at`). */
  readonly createdAt: Date;
  /** Instante de caducidad, `createdAt` + 7 dias (R8). */
  readonly expiresAt: Date;
  /** Instante en que se uso con exito, o `null` si no se uso (R12). */
  readonly consumedAt: Date | null;
  /** Instante en que un reenvio lo mato, o `null` si sigue en pie (R11, R16). */
  readonly supersededAt: Date | null;
};

/**
 * En que estado esta un enlace en un instante dado.
 *
 * Los tres estados de muerte se distinguen AQUI -y solo aqui- porque son informacion util para
 * razonar y para probar. **Hacia fuera no se distinguen jamas**: R22 y `design.md > 4.8` exigen una
 * respuesta unica e indistinguible, o el enlace se convierte en un oraculo con el que averiguar si
 * una cuenta existe y si ya se activo. Traducir cualquiera de estos tres a un error distinto seria
 * romper ese requisito.
 */
export type CredentialSetupLinkState = 'live' | 'consumed' | 'superseded' | 'expired';

/**
 * El instante en que caduca un enlace emitido en `issuedAt` (R8, R16).
 *
 * Se usa tanto en el alta (R7) como en el reenvio (R16), y ahi esta la mitad de su razon de ser:
 * R16 dice que el enlace nuevo cuenta sus 7 dias **desde el reenvio** y no desde la emision
 * original, asi que quien calcula el plazo recibe el instante y no lo supone.
 */
export function credentialSetupLinkExpiresAt(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + CREDENTIAL_SETUP_LINK_TTL_MS);
}

/**
 * El estado de `link` en el instante `now`. Total: para cualquier combinacion devuelve un estado.
 *
 * El orden de las ramas no es casual y refleja la historia de la fila:
 *   1. **Consumido** manda sobre todo lo demas (R12). Una fila consumida ya hizo su trabajo; que
 *      ademas haya caducado despues no cambia nada.
 *   2. **Sustituido** despues: un reenvio lo mato (R11, R16), y eso es un hecho ocurrido, no una
 *      consecuencia del reloj.
 *   3. **Caducado** al final, que es lo unico que depende de `now`.
 *
 * El borde: vale MIENTRAS `now < expiresAt`. En el instante exacto de la caducidad ya no vale, que
 * es lo que dice el `expires_at > $now` del `UPDATE` de `design.md > 4.6`. Un milisegundo antes
 * vale; el instante exacto y cualquier instante posterior, no.
 */
export function evaluateLink(link: CredentialSetupLink, now: Date): CredentialSetupLinkState {
  if (link.consumedAt !== null) return 'consumed';
  if (link.supersededAt !== null) return 'superseded';
  if (now.getTime() >= link.expiresAt.getTime()) return 'expired';
  return 'live';
}

/** Azucar sobre `evaluateLink` para el unico caso que importa fuera: «¿sirve ahora mismo?». */
export function isCredentialSetupLinkLive(link: CredentialSetupLink, now: Date): boolean {
  return evaluateLink(link, now) === 'live';
}
