'use server';

import { identity, observabilidad } from '@/lib/composition';
import { createErrorStateTranslator, type ErrorState } from '@/lib/modules/errores';
import { IdentityError, type Actor, type RoleOption } from '@/lib/modules/identity';

/**
 * QC-94 T9 — La Server Action del catalogo de roles (`design.md > 6`, R13, R14, R15).
 *
 * ARCHIVO NUEVO, y no una septima funcion dentro de `user-actions.ts` a proposito: aquel es la
 * administracion de usuarios y este es el catalogo de roles; mezclarlos obligaria a QC-67 a
 * importar un archivo cuyo nombre no dice lo que trae.
 *
 * FORMA DE ENTRADA (R13): **ningun argumento y ningun `FormData`**. Nadie la llama desde un
 * `<form>` —QC-67 la usa para rellenar un `<select>`—, y no recibir nada es la forma mas pequena
 * de cumplir R12: no hay pagina, ni tamano, ni busqueda, ni orden pedido por quien llama. Tampoco
 * hay ningun route handler ni ningun `fetch` a una ruta propia.
 *
 * ESTA ACTION NO DECIDE NADA (R6): no repite la comprobacion de permiso —ya es la primera linea de
 * `list-roles.ts` (R1)— ni ninguna otra regla de negocio. Solo resuelve el actor, llama y traduce.
 *
 * ERRORES (R14): por el `code` ESTABLE de la clase, **nunca** por el texto del mensaje, con el
 * traductor UNICO del modulo `errores` (QC-70). El unico error de dominio que esta consulta puede
 * producir es `UnauthorizedError` (`code: 'unauthorized'`); cualquier otro fallo —la base caida—
 * sale como `unexpected` con su mensaje neutro y el detalle real solo en el registro del servidor.
 * No se declara ninguna clase de error nueva ni ningun codigo nuevo: la consulta no tiene «no
 * encontrado» —un catalogo vacio es una lista vacia, no un error— ni entrada que validar.
 * Ningun `catch` descarta un error (`docs/conventions.md > Manejo de errores`).
 *
 * QC-71: el traductor unico recibe ademas el LECTOR DE LA CABECERA del identificador de peticion,
 * que esta action pide a la composicion igual que los otros ocho adaptadores driving. Solo el
 * error INESPERADO viaja con `reference` —el mismo identificador que se escribe en la linea del
 * registro del servidor—; el catalogado (`unauthorized`) sigue sin el.
 *
 * SIN `revalidatePath` (`design.md > 6`): esta ficha no crea ninguna ruta (R18), y escribir la de
 * QC-67 seria inventarla (regla 6 de `CLAUDE.md`).
 *
 * ESTE ARCHIVO NO SE REEXPORTA desde `index.ts` (R15): el contrato del modulo solo reexporta de
 * `./domain`, y un `'use server'` en su cierre transitivo lo haria inimportable desde un componente
 * de cliente. QC-67 lo importa por su RUTA EXACTA.
 */

/** Lo que devuelve la consulta (R9): una lista de `{ id, name }` y nada mas. */
export type RoleOptionsResult =
  | { status: 'success'; data: readonly RoleOption[] }
  | ErrorState;

/**
 * Traduce un error de dominio a estado serializable POR SU `code`, y cualquier otro a
 * `unexpected`. Es la MISMA implementacion unica de QC-70, parametrizada por la clase base de
 * este modulo: aqui no se escribe ninguna segunda `function toErrorState`.
 */
const toErrorState = createErrorStateTranslator(IdentityError, observabilidad.readRequestIdHeader);

/**
 * El actor se resuelve UNA vez por invocacion, nunca dentro del dominio (R5), y con LAS DOS CARAS
 * de la sesion del servidor (R6): `getSessionUser()` da el id y el conjunto de permisos,
 * `getSessionContext()` da la EMPRESA.
 *
 * **Falla cerrado**: si falta CUALQUIERA de las dos, el actor es `null` —no se adivina, no se
 * rellena— y `requireAnyPermission` rechaza en la primera linea del caso de uso (R2), antes de
 * tocar el puerto.
 *
 * LA EMPRESA SE SIGUE EXIGIENDO para construir el actor aunque esta consulta no la use (R11): «no
 * hay sesion completa» no puede ser mas permisivo aqui que en el resto del modulo.
 *
 * ES UNA COPIA DELIBERADA de `currentActor()` en `user-actions.ts`, y esta justificada en
 * `design.md > 8.3`: un archivo `'use server'` solo puede exportar funciones `async`, asi que
 * exportarla desde alli convertiria un detalle interno en una Server Action publica. Son ocho
 * lineas sin ninguna decision de negocio. **Cuando aparezca la TERCERA copia se extrae**, y el
 * sitio natural es `adapters/driving/current-actor.ts`.
 */
async function currentActor(): Promise<Actor | null> {
  const [sessionUser, sessionContext] = await Promise.all([
    identity.getSessionUser(),
    identity.getSessionContext(),
  ]);
  if (sessionUser === null || sessionContext === null) return null;
  return {
    id: sessionUser.id,
    companyId: sessionContext.companyId,
    permissions: sessionUser.permissions,
  };
}

/**
 * EL CATALOGO DE ROLES para el selector de QC-67 (R8, R9, R13). Sin argumentos: el catalogo es
 * cerrado y corto y se devuelve entero, ordenado por nombre en la base (R10).
 */
export async function listRolesAction(): Promise<RoleOptionsResult> {
  const actor = await currentActor();

  try {
    const data = await identity.listRoles(actor);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}
