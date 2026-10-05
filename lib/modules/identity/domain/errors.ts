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
 * borrado, yo mismo— se responde con `UserNotFoundError`. Ver la nota de abajo.
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
 * distintas segun quien lo lanzara; ahora es `user_not_found`, un codigo con UN mensaje.
 *
 * QC-66, el 2026-09-10: la CLASE se llamaba `NotFoundError` y era la ultima generica de la
 * aplicacion —los otros cinco modulos ya tienen la suya con nombre propio (`UnitNotFoundError`,
 * `OrderNotFoundError`, `SupplierNotFoundError`…)—, asi que pasa a `UserNotFoundError`. El `code`
 * NO cambio: sigue siendo `user_not_found`, y el contrato con QC-67 queda exactamente igual.
 *
 * Ojo: los
 * `'not_found'` que siguen apareciendo en `delete-user.ts`, `update-user.ts` y
 * `set-user-account-status.ts` son el RESULTADO DISCRIMINADO del puerto, no un codigo de error, y
 * no se tocan.
 */
export class UserNotFoundError extends IdentityError {
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
 * Fix directo (2026-09-22): la accion pedida, con la entrada bien formada y el permiso presente,
 * choca con una regla de negocio. El caso que la motiva: asignar el rol de administrador al crear
 * o editar un usuario. El rol no se puede conceder por esa via -el select ya no lo ofrece (R24
 * filtrado en el catalogo) y el puerto la rechaza igualmente por si llega por otra ruta-, asi que
 * se responde `action_not_allowed` y **no se escribe nada**.
 *
 * Se distingue a proposito de `unauthorized` (el actor TIENE permiso) y de `invalid_input` (la
 * entrada tiene la forma correcta): es la ACCION, no la autorizacion ni la forma, lo que falla.
 */
export class ActionNotAllowedError extends IdentityError {
  readonly code = 'action_not_allowed';

  constructor(diagnostic?: string) {
    super('action_not_allowed', diagnostic);
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

/**
 * QC-79 (R22): el secreto recibido no sirve. **Los seis casos comparten esta clase y este `code` a
 * proposito** (`design.md > 4.8`): el enlace no corresponde a ninguna fila, ha CADUCADO, ya fue
 * CONSUMIDO, lo SUSTITUYO un reenvio, la cuenta a la que apunta esta BORRADA, o la cuenta ya no
 * esta en `pending`. Distinguirlos convertiria el enlace en un ORACULO: probando secretos se
 * sabria si existen y, sabiendo uno viejo, si la cuenta ya se activo.
 *
 * Mismo criterio con el que `UserNotFoundError` cubre sus cuatro casos, y la razon de que ese
 * codigo NO se reutilice aqui: este caso no habla de un usuario, habla de un ENLACE, y QC-70 R4
 * prohibe dos codigos con el mismo texto tanto como un codigo con dos significados.
 *
 * El `diagnostic` —que va al registro del servidor y NO al navegador (QC-70 R28, R29)— nunca debe
 * llevar el secreto ni su huella (R13).
 */
export class CredentialLinkInvalidError extends IdentityError {
  readonly code = 'credential_link_invalid';

  constructor(diagnostic?: string) {
    super('credential_link_invalid', diagnostic);
  }
}

// ---------------------------------------------------------------------------
// QC-84 — Los grupos de trabajo (`design.md > 7.1`). Siete clases NUEVAS al final del archivo:
// ninguna de las diez de arriba se toca, ni su `code` ni su texto.
//
// **Por que son TRES codigos de «ya pertenece pero no se ve» y no uno** (`design.md > 7.2`): la
// decision 5 pide que el error diga que la persona YA PERTENECE **y POR QUE no aparece** en la
// lista. El motivo no puede viajar como dato: el `diagnostic` de QC-70 (R28, R29) va al registro
// del servidor y SOLO ahi, asi que un unico `work_group_member_exists` con el motivo dentro le
// dejaria al operador un «ya pertenece» sobre una lista donde esa persona no esta —exactamente el
// caso que la decision 5 viene a cerrar—. Y el motivo tampoco puede ir en el TEXTO de un codigo
// compartido, porque QC-70 R4 prohibe que dos codigos compartan frase y el catalogo no interpola
// (R7): el mensaje sale del codigo y de nada mas. Luego un motivo = un codigo. Son tres —cuenta
// `pending`, cuenta `inactive` y cuenta bloqueada— porque son las tres formas de que
// `effectiveAccountStatus` no diga `'active'`, y son tres acciones distintas para quien las lee:
// activar la cuenta, reactivarla o esperar a que venza el bloqueo. El cuarto caso —la persona SI
// se ve— es `WorkGroupMemberExistsError`, y no comparte codigo con ninguno de los tres (R31).
//
// El NOMBRE del grupo no entra en ninguno de los cuatro mensajes, y esta dicho por escrito en
// `design.md > 7.2`: con QC-70 tal y como esta mergeado no es implementable, y meterlo en el
// `diagnostic` no lo pondria delante del operador. Lo pone la pantalla (QC-85), que sabe que grupo
// acaba de abrir. Interpolar en el catalogo seria una enmienda a QC-70 y es otra ficha.
// ---------------------------------------------------------------------------

/**
 * R8, R9: el grupo no existe, esta dado de baja o es de **otra empresa**.
 *
 * Los tres casos comparten `code` por el mismo motivo que `UserNotFoundError`: distinguirlos
 * convertiria la consulta en un **oraculo de existencia** sobre datos ajenos. De ahi que el grupo
 * de otra empresa responda no-encontrado y **no** `unauthorized` (criterio de QC-38, QC-43 y
 * QC-66). Un grupo dado de baja es inexistente para las siete operaciones (R40): no hay forma de
 * restaurarlo ni de listarlo.
 */
export class WorkGroupNotFoundError extends IdentityError {
  readonly code = 'work_group_not_found';

  constructor(diagnostic?: string) {
    super('work_group_not_found', diagnostic);
  }
}

/**
 * QC-79 (R15): el reenvio del enlace apunta a un usuario que existe, esta vivo y es de la empresa
 * del actor, pero **ya no esta en `pending`** —activo, inactivo o bloqueado—.
 *
 * SI se distingue de `UserNotFoundError`, y a proposito (`design.md > 5.4`): quien reenvia trae
 * `usuarios.modificar` y ya ve el estado de cuenta de esa persona en el listado de QC-66, asi que
 * el codigo no le revela nada nuevo; a cambio permite a QC-67 decir «esta cuenta ya esta activa»
 * en vez de mentir. Mismo razonamiento con el que QC-66 separo `self_operation`.
 *
 * Ojo: esto NO contradice la respuesta unica de R22. Alli no hay actor ni permiso —cualquiera con
 * el enlace puede llamar—, y por eso «ya no esta en pending» se responde con
 * `CredentialLinkInvalidError`. Aqui el llamante ya esta autorizado a ver ese estado.
 */
export class UserNotPendingError extends IdentityError {
  readonly code = 'user_not_pending';

  constructor(diagnostic?: string) {
    super('user_not_pending', diagnostic);
  }
}

/**
 * R12, R17: crear o renombrar choca contra `work_groups_name_unique` —el indice funcional,
 * compuesto con `company_id` y **parcial** (`WHERE deleted_at IS NULL`) que QC-83 ya creo—.
 *
 * Se lanza al traducir el resultado discriminado del puerto, que nace del `P2002`: la garantia es
 * el **indice**, nunca una consulta previa de existencia —entre el `SELECT` y el `INSERT` cabe otra
 * transaccion—. Por eso el puerto no expone ninguna busqueda por nombre.
 */
export class WorkGroupDuplicateNameError extends IdentityError {
  readonly code = 'work_group_duplicate_name';

  constructor(diagnostic?: string) {
    super('work_group_duplicate_name', diagnostic);
  }
}

/** R30: la persona ya pertenece al grupo **y aparece** en la lista de miembros de R19. */
export class WorkGroupMemberExistsError extends IdentityError {
  readonly code = 'work_group_member_exists';

  constructor(diagnostic?: string) {
    super('work_group_member_exists', diagnostic);
  }
}

/**
 * R31: ya pertenece, pero el filtro de R19 la oculta porque su cuenta esta **pendiente**. El motivo
 * lo decide `effectiveAccountStatus`, la misma funcion que decide quien sale en la lista: el «por
 * que no se ve» y el «quien se ve» no pueden divergir.
 */
export class WorkGroupMemberExistsPendingError extends IdentityError {
  readonly code = 'work_group_member_exists_pending';

  constructor(diagnostic?: string) {
    super('work_group_member_exists_pending', diagnostic);
  }
}

/** R31: ya pertenece; no se ve porque su cuenta esta **inactiva**. */
export class WorkGroupMemberExistsInactiveError extends IdentityError {
  readonly code = 'work_group_member_exists_inactive';

  constructor(diagnostic?: string) {
    super('work_group_member_exists_inactive', diagnostic);
  }
}

/**
 * R31: ya pertenece; no se ve porque su cuenta esta **bloqueada**. Incluye el bloqueo por intentos
 * fallidos con el plazo VIGENTE, que puede tener la columna en `active` (QC-78 R11) y que por eso
 * solo `effectiveAccountStatus` sabe reconocer.
 */
export class WorkGroupMemberExistsBlockedError extends IdentityError {
  readonly code = 'work_group_member_exists_blocked';

  constructor(diagnostic?: string) {
    super('work_group_member_exists_blocked', diagnostic);
  }
}

/**
 * R36: se saca del grupo a quien **no pertenece**. Es distinto de `UserNotFoundError` —la persona
 * puede existir perfectamente— y distinto de `WorkGroupNotFoundError`: aqui lo que falta es la
 * fila de PERTENENCIA, no ninguno de sus dos extremos.
 */
export class WorkGroupMemberNotFoundError extends IdentityError {
  readonly code = 'work_group_member_not_found';

  constructor(diagnostic?: string) {
    super('work_group_member_not_found', diagnostic);
  }
}

/**
 * Meter en un grupo a una persona cuyo estado EFECTIVO no es activo. Un solo `code` para pendiente,
 * inactiva y bloqueada: los tres llevan a la misma accion —activar la cuenta primero—.
 */
export class WorkGroupMemberNotActiveError extends IdentityError {
  readonly code = 'work_group_member_not_active';

  constructor(diagnostic?: string) {
    super('work_group_member_not_active', diagnostic);
  }
}

/** Meterse a si mismo en un grupo: nadie puede, sea cual sea su permiso. */
export class WorkGroupMemberSelfError extends IdentityError {
  readonly code = 'work_group_member_self';

  constructor(diagnostic?: string) {
    super('work_group_member_self', diagnostic);
  }
}
