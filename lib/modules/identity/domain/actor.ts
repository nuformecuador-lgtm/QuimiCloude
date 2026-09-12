// QC-66 T6 — copia LITERAL del `actor.ts` de `unidades` (`design.md > 5.1`), con una sola
// adaptacion: estamos DENTRO de `identity`, asi que `assertPermission` y `PermissionCode` se
// importan por RUTA RELATIVA del propio dominio (`./require-permission`, `./permissions`) y NO
// por el barrel `@/lib/modules/identity` —un modulo que se importa a si mismo por su barrel crea
// un CICLO—. Si alguien lo "arregla" cambiando estas dos lineas al barrel, lo rompe: no se toca.
// Ningun import de este archivo sale de `domain/`.
import type { PermissionCode } from './permissions';
import { assertAnyPermission, assertPermission } from './require-permission';

import { UnauthorizedError } from './errors';

/**
 * Actor de entrada de los seis casos de uso (R5): id, EMPRESA y CONJUNTO DE PERMISOS. El nombre
 * del rol ya no viaja hasta aqui —no se lee, no se compara y no se recibe— (R4): se autoriza por
 * permiso, nunca por rol.
 *
 * `companyId` es la empresa de quien pregunta, y esta aqui —y no como parametro suelto de cada
 * caso de uso— porque viaja SIEMPRE junta con los permisos: como argumento separado, cada llamante
 * nuevo podria olvidarse de pasarla o, peor, elegirla. La rellena el adaptador driving con el
 * contexto de sesion del servidor, nunca la entrada del llamante (R6, R14).
 *
 * **La empresa SIRVE PARA FILTRAR y NO AUTORIZA POR SI SOLA** (`docs/architecture.md`): que el
 * `Actor` traiga empresa no concede ningun permiso. El permiso se comprueba APARTE y PRIMERO, con
 * `requirePermission`, antes de zod y antes de tocar el repositorio; solo despues la empresa entra
 * en el `where` como ambito de lectura.
 */
export type Actor = {
  readonly id: string;
  readonly companyId: string;
  readonly permissions: readonly string[];
};

/**
 * Primera linea de los seis casos de uso (R1). Falla cerrado: actor ausente, sin conjunto de
 * permisos, con el conjunto vacio o sin el codigo exigido se rechazan igual, todos con el mismo
 * error de autorizacion, y ANTES de validar la entrada y de tocar el repositorio (R2).
 *
 * La comprobacion es de PERTENENCIA EXACTA del codigo al conjunto, sin normalizacion, sin
 * coincidencia parcial y sin ninguna implicacion entre permisos (R3): un conjunto con
 * `'usuarios.modificar'` no concede `'usuarios.consultar'`, ni al reves. Delega en
 * `assertPermission`, que es la unica implementacion de la regla, y le pasa la fabrica del
 * `UnauthorizedError` de ESTE modulo —subclase de `IdentityError`— para que el adaptador driving
 * lo siga serializando con su `error instanceof IdentityError`.
 */
export function requirePermission(
  actor: Actor | null | undefined,
  permission: PermissionCode,
): asserts actor is Actor {
  assertPermission(actor, permission, () => new UnauthorizedError());
}

/**
 * QC-94 (R1, R2, R3) — hermana de `requirePermission` para la consulta del catalogo de roles, que
 * autoriza con CUALQUIERA de dos codigos: `usuarios.consultar` O `usuarios.modificar`. Basta uno;
 * no se exigen los dos y ninguno se deriva del otro.
 *
 * Misma firma de asercion, mismo `UnauthorizedError` de ESTE modulo y el mismo fallo cerrado que
 * su hermana (actor ausente, sin conjunto de permisos, conjunto vacio, conjunto que no es un array
 * o sin ninguno de los codigos), porque delega en `assertAnyPermission`, que comparte cuerpo con
 * `assertPermission`: la pertenencia sigue teniendo UNA sola implementacion (QC-74 R12).
 *
 * La lista de codigos es una TUPLA NO VACIA: `requireAnyPermission(actor, [])` no compila.
 */
export function requireAnyPermission(
  actor: Actor | null | undefined,
  permissions: readonly [PermissionCode, ...PermissionCode[]],
): asserts actor is Actor {
  assertAnyPermission(actor, permissions, () => new UnauthorizedError());
}

/**
 * QC-23 (T12, R27, R29) — hermana de `requirePermission` para las operaciones que **no exigen
 * ningun codigo**, solo un actor de verdad: cerrar las **propias** sesiones (R25).
 *
 * Falla cerrado igual que sus hermanas —actor ausente se rechaza con el mismo
 * `UnauthorizedError` de ESTE modulo, asi que el adaptador driving lo sigue serializando con su
 * `error instanceof IdentityError`— y en la MISMA primera linea, antes de validar la entrada y
 * antes de tocar el repositorio (R27). Sin actor no hay sesion propia que cerrar: no es que la
 * operacion no tenga sentido, es que no hay a quien aplicarla.
 *
 * **No mira el conjunto de permisos, y eso no es un descuido:** R27 dice que cerrar las propias
 * sesiones no exige ningun codigo, asi que un actor con el conjunto vacio SI puede cerrar las
 * suyas. Exigirle un codigo aqui seria inventarse un permiso que la decision cerrada 17 no da.
 * Quien apunta a OTRA persona no pasa por aqui: pasa por `requirePermission(actor,
 * 'usuarios.modificar')`, que si comprueba pertenencia exacta y rechaza el conjunto vacio, el
 * conjunto que no es un array y el codigo que no esta.
 *
 * Misma firma de ASERCION que sus hermanas (`asserts actor is Actor`): el estrechamiento vive
 * aqui, no en una funcion compartida, por el mismo motivo escrito en `require-permission.ts`
 * —TypeScript no verifica el cuerpo de una funcion de asercion—.
 */
export function requireActor(actor: Actor | null | undefined): asserts actor is Actor {
  if (!actor) throw new UnauthorizedError();
}
