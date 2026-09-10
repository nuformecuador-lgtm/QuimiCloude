// lib/modules/identity/ports/initial-credential-factory.ts
/**
 * QC-66 T9 — Puerto de la credencial inicial de un usuario nuevo (`design.md > 4.1`).
 *
 * Produce la credencial inicial y devuelve **SOLO SU HASH** (R15, R16). La credencial en claro
 * **no cruza este puerto**: no existe fuera del cuerpo del adaptador (T12), y por tanto ningun
 * caso de uso, ningun resultado y ningun error puede filtrarla.
 *
 * **Esto es lo que hace de R16 una propiedad del DISENO y no una promesa.** La alternativa natural
 * -generar en el dominio y hashear despues- deja la cadena en claro viva dentro del caso de uso, al
 * alcance de un `console.log` de depuracion, de un mensaje de error «con contexto» o de un `return`
 * descuidado; y el dia que alguien quiera «devolverla una sola vez» -lo que la decision cerrada 7
 * DESCARTO- el cambio son dos lineas. Con esta forma **el tipo no lo permite**: el caso de uso
 * recibe un `string` que es un hash bcrypt y no tiene nada mas (`design.md > 12.3`).
 *
 * **Por que el nombre es asi, y no se «mejora»:** evita el segmento `password` a proposito y
 * **acaba en `Hash`** porque `tests/guards/guard-password-never-plaintext.test.ts` marca todo
 * identificador declarado que nombre la contrasena y no acabe en `hash`. Se adapta el NOMBRE, no la
 * guardia.
 *
 * El metodo **no recibe nada**: ni el usuario, ni su correo, ni su nombre. La credencial es
 * aleatoria y no deriva de ningun dato de la persona, asi que no hay ninguna entrada que pasarle -y
 * una firma sin parametros impide que alguien la derive de un dato adivinable-. Que cumpla la
 * politica de QC-19 **por construccion** es obligacion del adaptador (T12, `design.md > 4.2`).
 *
 * Puerto puro (R42): este archivo no importa framework, Prisma, `lib/shared/**`, `lib/composition`
 * ni las tripas de otro modulo. Tampoco `node:crypto` ni `bcrypt`: eso es del adaptador.
 */
export interface InitialCredentialFactory {
  /** Devuelve el HASH bcrypt de una credencial recien generada. La credencial NO se devuelve. */
  createCredentialHash(): Promise<string>;
}
