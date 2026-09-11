// QC-66 T6 — copia LITERAL del `actor.ts` de `unidades` (`design.md > 5.1`), con una sola
// adaptacion: estamos DENTRO de `identity`, asi que `assertPermission` y `PermissionCode` se
// importan por RUTA RELATIVA del propio dominio (`./require-permission`, `./permissions`) y NO
// por el barrel `@/lib/modules/identity` —un modulo que se importa a si mismo por su barrel crea
// un CICLO—. Si alguien lo "arregla" cambiando estas dos lineas al barrel, lo rompe: no se toca.
// Ningun import de este archivo sale de `domain/`.
import type { PermissionCode } from './permissions';
import { assertPermission } from './require-permission';

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
