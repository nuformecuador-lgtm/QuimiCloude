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

  /**
   * La huella del secreto que llega **de fuera** (el de la URL del correo), para poder compararla
   * con la que se persistio.
   *
   * **Por que existe este segundo metodo, si `design.md > 4.2` solo escribio `create()`.** R9 tiene
   * dos mitades: «en la base DEBE quedar solo una huella irreversible» -la de emision, que cubre
   * `create()`- y «la comprobacion DEBE hacerse calculando la huella del valor recibido y
   * comparandola» -la de uso, que el diseno dejo sin puerto por el que pedirla-. El caso de uso
   * publico (`domain/set-credential-with-link.ts`) necesita exactamente esa mitad y **no puede
   * importar `node:crypto`**: `domain/` y `ports/` son puros (R26, R32), y el calculo es
   * infraestructura. Sin este metodo la unica salida seria que el dominio importara el adaptador,
   * que es la linea que `docs/architecture.md > La regla de dependencias` prohibe.
   *
   * **Es la MISMA funcion que usa `create()`**, no una segunda implementacion: el adaptador ya
   * tenia `digestOfCredentialSetupSecret` exportada aparte precisamente para esto, y dos SHA-256
   * escritos por separado serian dos verdades sobre la misma huella -el dia que una cambiara de
   * codificacion, todos los enlaces vivos dejarian de validar en silencio-.
   *
   * Es determinista y sin estado: la misma entrada da siempre la misma huella (`design.md > 4.1`),
   * que es lo que permite buscarla por el indice unico de `token_digest`.
   */
  digestOf(secret: string): string;
}
