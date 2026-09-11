// QC-79 T9 — Puerto de la fabrica del secreto del enlace (`design.md > 4.2`, R9, R10).
//
// Puerto puro (R26, R32): este archivo no importa framework, Prisma, `lib/shared/**`,
// `lib/composition` ni las tripas de otro modulo. Tampoco `node:crypto`: eso es del adaptador
// (`adapters/driven/security/credential-setup-secret-crypto.ts`).

/**
 * Produce el secreto del enlace y su HUELLA.
 *
 * A diferencia del `InitialCredentialFactory` de QC-66 -que devuelve SOLO el hash porque la
 * credencial no debe existir fuera del adaptador-, aqui el secreto SI tiene que salir: su unico
 * destino es la URL del correo (R13). Ver `design.md > 4.7`, donde esa concesion se dice de frente
 * y se enumera lo que se hace en su lugar: el secreto va de la fabrica al puerto de correo y a
 * nada mas; ningun caso de uso lo devuelve, lo mete en un error ni lo escribe.
 *
 * **El metodo no recibe nada, y eso es R10 escrito en la firma.** El secreto no se deriva del
 * identificador del usuario, ni de su correo, ni de ningun instante: sin parametros no hay nada de
 * donde derivarlo. La entropia -256 bits de un CSPRNG- y la codificacion son obligacion del
 * adaptador (`design.md > 4.2`).
 *
 * **`digest` y no «token»:** lo que se persiste es la huella irreversible del secreto (R9,
 * `design.md > 4.1`), y el nombre lo dice. Los nombres de este puerto evitan a proposito el
 * segmento `password`, por `tests/guards/guard-password-never-plaintext.test.ts`: se adapta el
 * NOMBRE, no la guardia (mismo criterio que QC-19 y QC-66).
 */
export interface CredentialSetupSecretFactory {
  /**
   * Un secreto recien generado y su huella. El secreto viaja a la URL del correo; la huella es lo
   * UNICO que llega a la base.
   */
  create(): { readonly secret: string; readonly digest: string };
}
