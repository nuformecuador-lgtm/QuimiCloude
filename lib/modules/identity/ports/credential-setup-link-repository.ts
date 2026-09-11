// QC-79 T9 — Puerto de persistencia del enlace (`design.md > 6.2`, y las dos transacciones de
// `> 4.5` y `> 4.6`). Cubre R11, R12, R15, R16, R19, R20, R22.
//
// Puerto puro (R26, R32): sin framework, sin Prisma, sin `lib/shared/**` y sin adaptadores. El
// dominio NUNCA ve una transaccion (precedente QC-66 § 9.3): pide una de estas dos operaciones y
// traduce el resultado discriminado.

/**
 * Como acabo una emision.
 *
 * `'superseded'` es la carrera de `design.md > 4.5`: dos emisiones simultaneas chocan contra el
 * indice unico parcial `credential_setup_tokens_one_live_per_user` y una de las dos falla con
 * `23505`. **La perdedora no reintenta y no envia ningun correo**: su secreto no llego a
 * persistirse, y la ganadora acaba de emitir y enviar, asi que la respuesta observable es correcta.
 * No se inventa un error nuevo para una carrera cuyo resultado es el que se queria.
 */
export type IssueOutcome = 'issued' | 'superseded' | 'user_not_pending' | 'not_found';

/**
 * Como acabo el uso de un enlace. **Dos valores y no seis**, a proposito: R22 y
 * `design.md > 4.8` exigen una respuesta unica e indistinguible entre «no existe», «caducado»,
 * «consumido», «sustituido», «usuario borrado» y «usuario ya no esta en `pending`». Distinguirlos
 * convertiria el enlace en un oraculo con el que averiguar si una cuenta existe y si ya se activo.
 */
export type ApplyOutcome = 'ok' | 'invalid';

export interface CredentialSetupLinkRepository {
  /**
   * `design.md > 4.5`. En UNA transaccion: mata el enlace vivo anterior del mismo usuario
   * (`superseded_at`) e inserta el nuevo (R11, R16). Devuelve el CORREO del destinatario cuando la
   * emision sale bien, y eso evita una segunda lectura y -mas importante- evita que la direccion
   * llegue del llamante.
   *
   * `companyId` es `string | null` a proposito: el alta pasa `null` -acaba de crear la fila con la
   * empresa del actor y no hay nada que reacotar-; el reenvio lo pasa SIEMPRE, y el adaptador anade
   * `AND users.company_id = $companyId` a la resolucion del usuario, que es lo que hace cierto el
   * ambito de R15 sin que el dominio tenga que acordarse.
   *
   * `'superseded'` = otra emision simultanea gano; no se envia correo (R11).
   */
  issueForPendingUser(input: {
    userId: string;
    companyId: string | null;
    digest: string;
    expiresAt: Date;
    now: Date;
  }): Promise<IssueOutcome | { readonly email: string }>;

  /**
   * `design.md > 4.6`. Consumo + credencial + activacion, en UNA transaccion (R19, R20, R22).
   *
   * El consumo es un compare-and-set atomico y no un `SELECT` seguido de un `UPDATE`: de dos usos
   * simultaneos, solo el primero ve `consumed_at IS NULL`, y el segundo recibe 0 filas. La
   * escritura sobre `users` lleva su propia condicion (`deleted_at IS NULL AND account_status =
   * 'pending'`), de modo que si entre el correo y el clic el administrador borro, bloqueo o activo
   * la cuenta, la transaccion REVIERTE entera y la respuesta es la misma `'invalid'`.
   *
   * Recibe la HUELLA, nunca el secreto (R9, R13).
   */
  applyCredentialAndActivate(input: {
    digest: string;
    credentialHash: string;
    now: Date;
  }): Promise<ApplyOutcome>;
}

// NO HAY NINGUN METODO DE LECTURA DE ENLACES, y es deliberado (`design.md > 6.2`, igual que
// QC-66 § 7): sin un `findByDigest` no existe la comprobacion previa que seria una carrera
// (R20), no hay un segundo camino de comprobacion que pueda divergir del `UPDATE` de § 4.6
// (`design.md > 11.4`), y nadie puede escribir por descuido un listado de enlaces vivos.
