// QC-87 T6 — `actor.ts` de `asignaciones` (`design.md > 1`), copiado del de `pedidos` con UNA
// adaptacion: el `Actor` lleva ademas `companyId` (R4, R5).
//
// El permiso sale del CONTRATO PUBLICO de `identity`, que es su dueno:
// `lib/modules/identity/domain/permissions.ts` es el UNICO sitio del repo que escribe el catalogo
// de codigos, y `identity/domain/require-permission.ts` la UNICA implementacion de la regla «el
// actor tiene este permiso» (QC-74). `asignaciones` NO declara ninguna constante propia de permiso
// ni de rol, y no conoce siquiera el nombre de ningun rol.
//
// Se importa por el BARREL, NUNCA por ruta profunda (`docs/architecture.md > La regla de
// dependencias`): de otro modulo solo se consume su contrato.
import { assertPermission, type PermissionBearer, type PermissionCode } from '@/lib/modules/identity';

import { UnauthorizedError } from './errors';

/**
 * Actor de entrada de los CUATRO casos de uso (R4): id, EMPRESA y CONJUNTO DE PERMISOS. Sin nombre
 * de rol: en este modulo no se autoriza por rol, y lo vigila
 * `tests/guards/guard-autorizacion-por-permiso.test.ts`.
 *
 * `companyId` esta aqui —y no como parametro suelto de cada caso de uso— porque viaja SIEMPRE
 * junta con los permisos, igual que en `identity` (QC-66 dec. 14): como argumento separado, cada
 * llamante nuevo podria olvidarse de pasarla o, peor, ELEGIRLA. R5 exige que la empresa de cada
 * fila que se escribe salga del actor y no de la entrada de la operacion, y esta forma lo hace
 * inexpresable de otro modo.
 *
 * **La empresa SIRVE PARA FILTRAR y NO AUTORIZA POR SI SOLA** (`docs/architecture.md`): el permiso
 * se comprueba APARTE y PRIMERO; solo despues la empresa entra como ambito.
 *
 * El dominio NO lee la sesion, ni una cookie, ni una cabecera (R4): quien resuelve el actor es el
 * adaptador driving con las dos caras de la sesion de `identity`.
 */
export type Actor = {
  readonly id: string;
  readonly companyId: string;
  readonly permissions: readonly string[];
};

/**
 * Primera linea de los cuatro casos de uso (R1, R3): ANTES de `zod` y ANTES de tocar ningun puerto
 * —ni el repositorio de asignaciones, ni el catalogo de pedidos, ni los directorios de `identity`—.
 *
 * Falla cerrado (R2): actor ausente (`null`/`undefined`), sin conjunto de permisos, con el conjunto
 * vacio o sin el codigo exigido se rechazan TODOS igual, con el mismo error de autorizacion y sin
 * revelar si el pedido, la persona o el grupo existen.
 *
 * La pertenencia es EXACTA, sin normalizacion ni implicacion entre permisos (R3):
 * `asignaciones.modificar` NO concede `pedidos.consultar`, ni al reves, ni `asignaciones.consultar`
 * sustituye a ninguno de los dos.
 *
 * El error es el `UnauthorizedError` de ESTE modulo, subclase de `AsignacionesError` (R43): asi el
 * adaptador driving lo reconoce con un solo `instanceof` y el mismo `code` estable.
 *
 * La RLS que QC-86 dejo activada y forzada en `order_assignments` NO autoriza nada: Prisma se
 * conecta como dueno de las tablas (`docs/architecture.md > Acceso a datos y autorizacion`). Es
 * defensa en profundidad; la frontera real es esta funcion.
 */
export function requirePermission(
  actor: Actor | null | undefined,
  permission: PermissionCode,
): asserts actor is Actor {
  assertPermission(actor, permission, () => new UnauthorizedError());
}

// ---------------------------------------------------------------------------------------
// QC-102 T-fix — El predicado que la PANTALLA pregunta. Bloque NUEVO al final: no toca nada de
// lo de arriba.
// ---------------------------------------------------------------------------------------

/**
 * El codigo del permiso de escritura de este modulo, escrito UNA sola vez y DENTRO del dominio.
 *
 * El tipo `PermissionCode` es union de literales del catalogo de `identity` (QC-74): un codigo
 * inventado aqui NO COMPILA. La constante es privada al archivo a proposito —no se exporta ni se
 * publica en el barril—: lo que sale del modulo es la PREGUNTA, no la cadena.
 */
const ASIGNACIONES_MODIFICAR: PermissionCode = 'asignaciones.modificar';

/**
 * Error centinela, privado y reutilizado: `assertPermission` exige una fabrica de error porque su
 * contrato es LANZAR (QC-74 R15). Aqui esa excepcion no sale nunca de esta funcion; solo sirve
 * para leer el veredicto de la UNICA implementacion de la pertenencia sin copiarla.
 */
const DENEGADO = new Error('asignaciones: permiso de escritura ausente');

/**
 * **¿Este conjunto de permisos puede modificar asignaciones?** Devuelve `boolean` y NO LANZA: es
 * una PREGUNTA, no una autorizacion.
 *
 * **Anticipar no es autorizar** (`requirements.md` de QC-102, aviso (b)). El corte real sigue
 * siendo `requirePermission(actor, 'asignaciones.modificar')` en la PRIMERA LINEA de los tres
 * casos de uso de escritura de QC-87 —asignar, quitar a una persona y quitar un grupo—, antes de
 * `zod` y antes de tocar ningun puerto. Este predicado **no lo sustituye, no lo relaja y no lo
 * adelanta**: una pantalla que esconde el boton no protege nada
 * (`docs/architecture.md > Acceso a datos y autorizacion`). Si alguien borrara esta funcion, las
 * tres operaciones seguirian rechazando igual; lo unico que se perderia es el solo-lectura de R28.
 *
 * **Existe para que el codigo del permiso no se escriba FUERA de este modulo** (R29 de QC-86,
 * R50 de QC-87), que es lo que vigila la regla (e) de
 * `tests/unit/asignaciones/module-contract.test.ts`: la pantalla necesita el `canWrite` que R28
 * baja por props, y sin esta funcion la unica forma de calcularlo seria escribir la cadena
 * `'asignaciones.modificar'` en `app/**`. La respuesta sale del modulo; la cadena, no.
 *
 * **El criterio es EXACTAMENTE el de `requirePermission`, no una segunda definicion.** Las dos
 * pasan por `assertPermission` de `identity`, que es la UNICA implementacion de la regla (QC-74
 * R12): pertenencia EXACTA del codigo al conjunto —sin normalizar, sin coincidencia parcial, sin
 * comodines y sin implicacion entre permisos (R13)— y fallo cerrado ante actor ausente, sin
 * conjunto, con un conjunto que no es un array o vacio (R14). No se reimplementa con un
 * `includes` laxo justamente para que no pueda divergir el dia que la regla cambie.
 *
 * Acepta cualquier portador de permisos (`PermissionBearer`), no solo el `Actor` de este modulo:
 * quien pregunta es el Server Component con la sesion resuelta, que no construye un `Actor`.
 */
export function canModifyAssignments(actor: PermissionBearer | null | undefined): boolean {
  try {
    assertPermission(actor, ASIGNACIONES_MODIFICAR, () => DENEGADO);
    return true;
  } catch {
    return false;
  }
}
