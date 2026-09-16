// El permiso sale del CONTRATO PUBLICO de `identity`, que es su dueno: ahi vive el UNICO catalogo
// de codigos del repositorio y la UNICA implementacion de la regla «el actor tiene este permiso».
// Este modulo NO declara ninguna constante propia de rol y no conoce siquiera el nombre de ninguno.
//
// Se importa por el BARREL, NUNCA por ruta profunda (`docs/architecture.md > La regla de
// dependencias`): de otro modulo solo se consume su contrato.
import { assertPermission, type PermissionCode } from '@/lib/modules/identity';

import { UnauthorizedError } from './errors';

/**
 * Actor de entrada de las operaciones del modulo: id, EMPRESA y CONJUNTO DE PERMISOS. Sin nombre de
 * rol: aqui no se autoriza por rol.
 *
 * `companyId` esta DENTRO del actor y no como parametro suelto porque viaja siempre junto con los
 * permisos: como argumento separado, cada llamante nuevo podria olvidarse de pasarlo o, peor,
 * ELEGIRLO. Como la ruta del archivo se construye con la empresa del actor, esta forma hace
 * inexpresable firmar un enlace en la empresa de otro.
 *
 * **La empresa SIRVE PARA AISLAR y NO AUTORIZA POR SI SOLA** (`docs/architecture.md`): el permiso
 * se comprueba APARTE y PRIMERO; solo despues la empresa entra como ambito.
 *
 * El dominio NO lee la sesion, ni una cookie, ni una cabecera: quien resuelve el actor es el
 * adaptador driving.
 */
export type Actor = {
  readonly id: string;
  readonly companyId: string;
  readonly permissions: readonly string[];
};

/**
 * El codigo del permiso de escritura de este modulo, escrito UNA sola vez y DENTRO del dominio.
 *
 * El tipo `PermissionCode` es union de literales del catalogo de `identity`: un codigo inventado
 * aqui NO COMPILA. Se reutiliza un codigo QUE YA EXISTE en vez de abrir uno nuevo —el catalogo es
 * cerrado y no se amplia—, y se elige el de escritura de proveedores porque lo que se sube son
 * catalogos de precios y formulas de un proveedor. En el sembrado vigente de roles ese codigo lo
 * tiene unicamente el rol administrador, que es el efecto buscado; la decision se toma por PERMISO
 * y jamas comparando el nombre del rol.
 */
export const DOCUMENT_UPLOAD_PERMISSION: PermissionCode = 'proveedores.modificar';

/**
 * Primera linea de cada caso de uso: ANTES de validar la entrada y ANTES de tocar ningun puerto.
 *
 * Falla cerrado: actor ausente (`null`/`undefined`), sin conjunto de permisos, con el conjunto
 * vacio, con un valor que no es una lista o sin el codigo exigido se rechazan TODOS igual, con el
 * mismo error de autorizacion y sin revelar si el archivo existe.
 *
 * La pertenencia es EXACTA, sin normalizacion ni implicacion entre permisos: quien decide es la
 * unica implementacion de `identity`, no un `includes` propio que pueda diverger el dia que la
 * regla cambie.
 *
 * El error es el `UnauthorizedError` de ESTE modulo, subclase de `DocumentosError`: asi el
 * adaptador driving lo reconoce con un solo `instanceof` y el mismo `code` estable.
 */
export function requirePermission(
  actor: Actor | null | undefined,
  permission: PermissionCode,
): asserts actor is Actor {
  assertPermission(actor, permission, () => new UnauthorizedError());
}
