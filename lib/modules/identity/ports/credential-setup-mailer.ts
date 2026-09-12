// QC-79 T9 — Puerto de envio del enlace (`design.md > 7.1`, R26, R30).
//
// Puerto puro (R26): sin framework, sin Prisma, sin `lib/shared/**` y -sobre todo- **sin la
// libreria del proveedor**. Quien importa `resend` es UN solo archivo del repositorio, el
// adaptador `adapters/driven/mail/credential-setup-mailer-resend.ts` (R27), y una guardia propia
// lo vigila. Sustituir el proveedor es escribir otro archivo y cambiar una linea de
// `lib/composition`: este contrato no se entera.

/**
 * Envia a una persona el enlace con el que establecera su contrasena.
 *
 * **Nunca lanza: un fallo del proveedor es un VALOR** (R30). Que lo sea no es un capricho de
 * estilo, es lo que hace ESTRUCTURAL la decision cerrada 7 (`design.md > 7.1`): con una excepcion,
 * un `try/catch` olvidado en cualquier punto del camino tumbaria el alta, y una caida del proveedor
 * dejaria al administrador sin poder dar de alta a nadie. Con un valor, el compilador obliga a
 * decidir que se hace con el, y el campo `mail` del resultado del alta (`design.md > 5.3`) no se
 * puede omitir.
 *
 * **Esto NO es un `catch` vacio** (`docs/conventions.md`): el adaptador MANEJA el error -lo
 * registra sin la URL, sin el secreto y sin el correo del destinatario, que es PII- y lo COMUNICA
 * como resultado.
 *
 * El destinatario llega ya resuelto por el repositorio al emitir (`design.md > 6.2`), no del
 * llamante: enviar a una direccion que venga por parametro desde arriba seria un vector para usar
 * el ERP como reenviador.
 */
export interface CredentialSetupMailer {
  /** `'sent'` o `'failed'`. Nunca lanza. Ver arriba por que. */
  sendCredentialSetupLink(input: {
    readonly to: string;
    readonly secret: string;
  }): Promise<'sent' | 'failed'>;
}
