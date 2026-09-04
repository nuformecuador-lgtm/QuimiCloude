'use server';

import { identity, unidades } from '@/lib/composition';
import { UnidadesError, type Actor, type UnitRef } from '@/lib/modules/unidades';

/**
 * Server Action de lectura del catalogo de unidades (`design.md > 9`, R40-R42). Es el
 * unico adaptador driving de `unidades`; consumira QC-26 en el selector de unidad.
 *
 * EL ACTOR sale de `identity.getSessionUser()` via `@/lib/composition`, exactamente
 * igual que `recipe-actions.ts` de `recetas`: esta action no lee sesion, cookie ni
 * cabecera por su cuenta.
 *
 * ESTA ACTION NO REPITE `requireAdmin` NI DECIDE NADA (R41): solo resuelve el actor,
 * invoca el caso de uso y traduce su error de dominio. El corte real vive en
 * `domain/list-units.ts`.
 *
 * ERRORES: las clases de `UnidadesError` se traducen a `{ status: 'error', code,
 * message }` con el `code` ESTABLE de la clase, nunca el texto. Cualquier error que NO
 * sea de dominio se relanza (`docs/conventions.md > Manejo de errores`).
 */

export type UnitListResult =
  | { status: 'success'; data: readonly UnitRef[] }
  | { status: 'error'; code: string; message: string };

/** Traduce un error de dominio a estado serializable; relanza cualquier otro. */
function toErrorState(error: unknown): { status: 'error'; code: string; message: string } {
  if (error instanceof UnidadesError) {
    return { status: 'error', code: error.code, message: error.message };
  }
  throw error;
}

/** El actor se resuelve UNA vez por invocacion, nunca dentro del dominio. */
async function currentActor(): Promise<Actor | null> {
  const sessionUser = await identity.getSessionUser();
  if (sessionUser === null) return null;
  return { id: sessionUser.id, roleName: sessionUser.roleName };
}

/** Catalogo completo de unidades (R40, R41). */
export async function listUnitsAction(): Promise<UnitListResult> {
  const actor = await currentActor();

  try {
    const data = await unidades.listUnits(actor);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}
