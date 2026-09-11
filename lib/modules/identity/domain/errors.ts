/**
 * QC-66 T3 — Errores del dominio `identity` (`design.md > 6.4`, R41).
 *
 * Todas derivan de `IdentityError` y llevan un `code` **ESTABLE**: el adaptador driving
 * traduce a `{ status: 'error', code, message }` decidiendo por `error instanceof
 * IdentityError` y por su `code`, **nunca** por el texto del mensaje —el mensaje puede
 * cambiar de idioma o de redaccion sin romper a la pantalla de QC-67—. Nada de `catch`
 * vacios: un error se maneja o se propaga con contexto
 * (`docs/conventions.md > Manejo de errores`).
 *
 * Mismo patron que `UnidadesError` (`lib/modules/unidades/domain/errors.ts`) y
 * `ProveedoresError`: base abstracta con `abstract readonly code`, `name` tomado de
 * `new.target.name` y `Object.setPrototypeOf`. Este ultimo es necesario porque TypeScript,
 * al compilar a un target que no soporta nativamente extender `Error`, rompe la cadena de
 * prototipos y `instanceof` deja de funcionar sin el ajuste.
 *
 * QC-70 (R6, R7, R8), aplicado a `identity` el 2026-09-10: el `code` ya NO es un `string`
 * cualquiera sino un `ErrorCode` del catalogo unico (`@/lib/modules/errores`), y el MENSAJE sale
 * de ese catalogo a partir del codigo. **Ningun constructor admite un texto** (R24): si pudiera,
 * la frase volveria a vivir en seis archivos, que es justo lo que QC-70 quita. Lo que un sitio que
 * lanza SI puede pasar es el `diagnostic`: el dato variable que ayuda a diagnosticar, que va al
 * REGISTRO DEL SERVIDOR y solo ahi (R28, R29). Esto ENMIENDA QC-70 R25; el motivo, en la cabecera
 * de `lib/modules/errores/domain/error-codes.ts`.
 *
 * Dominio puro (R42): este archivo no importa framework, Prisma, `lib/shared/**`,
 * `lib/composition` ni las tripas de otro modulo. El catalogo entra por el BARREL de otro
 * modulo, que es lo unico que `domain/**` puede importar de fuera
 * (`docs/architecture.md > La regla de dependencias`).
 */
import { errorMessage, type ErrorCode } from '@/lib/modules/errores';

export abstract class IdentityError extends Error {
  abstract readonly code: ErrorCode;

  /**
   * QC-70 (R28, R29): el dato variable que ayuda a diagnosticar —un identificador, el indice
   * que choco—. Va al REGISTRO DEL SERVIDOR y solo ahi: no es el mensaje, no se muestra y el
   * traductor unico no lo copia al estado que cruza al navegador.
   */
  readonly diagnostic?: string;

  constructor(code: ErrorCode, diagnostic?: string) {
    super(errorMessage(code)); // R7: el mensaje NO se pasa desde fuera.
    this.diagnostic = diagnostic;
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * R2, R3: falta de permiso. Falla cerrado —actor ausente, sin conjunto de permisos, con el
 * conjunto vacio, con un conjunto que no es una lista, o sin el codigo EXACTO que el caso de
 * uso exige (`usuarios.consultar` o `usuarios.modificar`)—. `usuarios.modificar` no concede
 * `usuarios.consultar` ni al reves.
 *
 * `unauthorized` queda SOLO para el permiso que falta: el AMBITO de los datos —otra empresa,
 * borrado, yo mismo— se responde con `NotFoundError`. Ver la nota de abajo.
 */
export class UnauthorizedError extends IdentityError {
  readonly code = 'unauthorized';

  constructor(diagnostic?: string) {
    super('unauthorized', diagnostic);
  }
}

/**
 * R33, R34, R35: el usuario no existe, esta borrado logicamente, es de **otra empresa** o es
 * **el propio actor**.
 *
 * Los cuatro casos comparten `code` a proposito (`design.md > 6.4`): distinguir «no existe»
 * de «existe pero no es de tu empresa» convertiria la ficha en un **oraculo de existencia**
 * sobre datos ajenos —un actor de la empresa A podria sondear identificadores de la empresa B
 * y saber cuales son reales—. Es el criterio que ya fijaron QC-38 y QC-43, y la razon de que
 * «de otra empresa» responda no-encontrado y **no** `unauthorized`.
 *
 * QC-70 (R17), el 2026-09-10: su codigo era el generico `not_found`, que significaba cinco cosas
 * distintas segun quien lo lanzara; ahora es `user_not_found`, un codigo con UN mensaje. La CLASE
 * conserva su nombre: lo que cambio es el literal del contrato, no la jerarquia. Ojo: los
 * `'not_found'` que siguen apareciendo en `delete-user.ts`, `update-user.ts` y
 * `set-user-account-status.ts` son el RESULTADO DISCRIMINADO del puerto, no un codigo de error, y
 * no se tocan.
 */
export class NotFoundError extends IdentityError {
  readonly code = 'user_not_found';

  constructor(diagnostic?: string) {
    super('user_not_found', diagnostic);
  }
}

/**
 * R17: el alta o la edicion chocan contra `users_email_unique`. Se lanza al traducir el
 * resultado discriminado del puerto, que a su vez nace del `P2002` del indice unico: la
 * garantia es el **indice**, nunca una consulta previa de existencia —entre el `SELECT` y el
 * `INSERT` cabe otra transaccion—.
 */
export class DuplicateEmailError extends IdentityError {
  readonly code = 'duplicate_email';

  constructor(diagnostic?: string) {
    super('duplicate_email', diagnostic);
  }
}

/** R17: igual que `DuplicateEmailError` pero contra `users_username_unique`. */
export class DuplicateUsernameError extends IdentityError {
  readonly code = 'duplicate_username';

  constructor(diagnostic?: string) {
    super('duplicate_username', diagnostic);
  }
}

/**
 * R17: igual que los dos anteriores pero contra `users_document_unique`, que es el indice de
 * la **pareja** tipo+numero de documento dentro de la empresa. Los tres duplicados son tres
 * `code` distintos porque la pantalla tiene que poder senalar **el campo** que choca.
 */
export class DuplicateDocumentError extends IdentityError {
  readonly code = 'duplicate_document';

  constructor(diagnostic?: string) {
    super('duplicate_document', diagnostic);
  }
}

/**
 * R18: el rol indicado en el alta o en la edicion no existe. Es un caso DISTINGUIBLE de
 * `ValidationError` por su `code`: la entrada tiene la forma correcta —un identificador
 * valido— y lo que no existe es la fila a la que apunta, asi que decirlo con un «entrada
 * invalida» generico mentiria sobre donde esta el problema.
 */
export class RoleNotFoundError extends IdentityError {
  readonly code = 'role_not_found';

  constructor(diagnostic?: string) {
    super('role_not_found', diagnostic);
  }
}

/**
 * R21: el objetivo de **mover el estado de cuenta**, de **cambiar el rol** o de **borrar** es
 * el propio actor. Primera de las dos guardas del administrador (decision cerrada 9a).
 *
 * **`self_operation` SI es distinto de `user_not_found`, y a proposito** (`design.md > 6.4`): la
 * pantalla de QC-67 tiene que poder decir «no puedes cambiar tu propio rol» sin mentir. Aqui
 * no hay oraculo que proteger —el actor no descubre nada que no sepa ya sobre su propia
 * fila—, mientras que responder no-encontrado obligaria a la pantalla a inventar una
 * explicacion falsa. Que la CONSULTA de la propia ficha siga respondiendo `user_not_found` (R35)
 * no contradice esto: ahi el actor simplemente esta fuera de su propio ambito de consulta.
 *
 * Su texto del catalogo cubre los TRES casos de la decision 9(a) —estado, rol y borrado— y por eso
 * no nombra ninguno de ellos en particular.
 */
export class SelfOperationError extends IdentityError {
  readonly code = 'self_operation';

  constructor(diagnostic?: string) {
    super('self_operation', diagnostic);
  }
}

/**
 * R22, R23: la operacion pedida —mover a `pending`/`inactive`/`blocked`, cambiar el rol a uno
 * distinto del administrador, o borrar— dejaria a la empresa **sin ningun administrador vivo
 * y en `active`**. Segunda guarda del administrador (decision cerrada 9b).
 *
 * El dominio lo lanza al traducir el `'last_administrator'` que devuelve el puerto, que
 * decide dentro de una transaccion con bloqueo de fila (`design.md > 9.2`): el error llega
 * cuando **ya no se escribio nada**.
 */
export class LastAdministratorError extends IdentityError {
  readonly code = 'last_administrator';

  constructor(diagnostic?: string) {
    super('last_administrator', diagnostic);
  }
}

/**
 * R18: la entrada externa no pasa el esquema `zod` del borde —un campo obligatorio ausente,
 * un tipo de documento que no esta en el conjunto cerrado, un campo prohibido por R14/R20—.
 *
 * Mismo `code` estable que el `ValidationError` de `unidades`, `proveedores`, `recetas` e
 * `inventario`: es el mismo significado en los cinco modulos y la traduccion la hace el
 * adaptador driving por el codigo, nunca por el texto.
 */
export class ValidationError extends IdentityError {
  readonly code = 'invalid_input';

  constructor(diagnostic?: string) {
    super('invalid_input', diagnostic);
  }
}
