// lib/modules/identity/ports/session-revocation-repository.ts
/**
 * QC-23 T7 — El almacen de la revocacion, visto desde el dominio (`design.md > 6`; R20, R25,
 * R28, R39, R46).
 *
 * **NO EXISTE NINGUN METODO DE LISTADO, Y ES A PROPOSITO.** Es la decision cerrada 12 —«¿el
 * usuario ve sus dispositivos abiertos? No, y no genera ficha»— escrita en el TIPO y no en un
 * comentario que alguien pueda no leer: sin un `listSessions`, «ensename mis dispositivos» ni
 * siquiera compila, y nadie lo anade por descuido en una tanda apurada. El motivo de fondo es de
 * coste: una lista obliga a leer N filas por peticion, justo lo que **QC-28** viene a quitar, y
 * ademas no se puede: este ERP no guarda las sesiones ABIERTAS, solo las cerradas (alternativas
 * descartadas 2 y 3 de `design.md > 9`).
 *
 * Puerto PURO (`docs/architecture.md > La regla de dependencias`): sin `next/*`, sin Prisma, sin
 * `lib/shared/**` y sin ningun adaptador. No importa nada porque no necesita nada: sus dos
 * firmas se escriben con tipos de la plataforma.
 *
 * **Los dos metodos son transaccionales y llevan la purga de R39 DENTRO.** La purga es un
 * `DELETE ... WHERE user_id = ? AND expires_at <= ?` acotado a ESA persona —nunca un barrido de
 * la tabla— y va en la misma transaccion que la escritura que la provoca. Quien NO purga es la
 * comprobacion por peticion (R40, alternativa descartada 6): convertir la ruta mas caliente del
 * ERP en una escritura esta descartado por escrito.
 *
 * **El ambito —empresa y vivo— vive en la IMPLEMENTACION de `stampAll`, no aqui y no en el
 * dominio**, exactamente como en `UserAdminRepository`: si el filtro estuviera en el caso de uso,
 * el proximo caso de uso podria olvidarlo. Por eso `stampAll` recibe `companyId` y devuelve un
 * resultado discriminado en vez de lanzar.
 */
export interface SessionRevocationRepository {
  /**
   * Cierra UNA sesion —una fila en el registro— y purga de paso las caducadas de esa persona
   * (R20, R39). Cerrar dos veces el mismo `sessionId` **no es un error**: el `23505` del indice
   * unico `revoked_sessions_session_id_key` lo traduce la implementacion a exito (R12), asi que
   * esta operacion es idempotente y no devuelve nada que distinga «lo cerre» de «ya estaba».
   *
   * `expiresAt` es la caducidad NATURAL del token que se cierra (su `exp`): es lo que hace
   * posible la purga, porque pasada esa fecha la fila ya no protege de nada.
   *
   * NO sube ningun sello y NO toca ninguna otra sesion de esa persona (R24).
   */
  revokeSession(input: {
    sessionId: string;
    userId: string;
    expiresAt: Date;
    now: Date;
  }): Promise<void>;

  /**
   * Sube el sello «sesiones validas desde» de una persona VIVA de esa empresa, y purga sus filas
   * caducadas (R25, R39).
   *
   * `validFrom` llega ya truncado al segundo por `floorToSecond` (`design.md > 2.3`): quien
   * decide el instante es el caso de uso, no la base.
   *
   * `'not_found'` cubre los TRES casos —no existe, borrada logicamente, de otra empresa— sin
   * distinguirlos (R28), que es lo mismo que hace `UserAdminRepository.updateAliveInCompany`.
   * Devolver un resultado y no lanzar es lo que mantiene la excepcion de Prisma fuera del
   * dominio.
   */
  stampAll(input: { userId: string; companyId: string; validFrom: Date }): Promise<'ok' | 'not_found'>;
}
