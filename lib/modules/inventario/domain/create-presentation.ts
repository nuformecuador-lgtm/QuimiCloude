import { requirePermission, type Actor } from './actor';
import { PresentationDuplicateNameError, ValidationError } from './errors';
import { createPresentationSchema } from './presentation-input';
import { normalizePresentationName } from './presentation-name';

import type { PresentationRepository } from '../ports/presentation-repository';

export type CreatePresentationDeps = {
  readonly presentations: PresentationRepository;
};

/**
 * Alta de presentacion (R9, R11, R17, R18, R20, R37). `requirePermission(actor, 'inventario.modificar')` es la PRIMERA
 * linea, antes de zod y antes de tocar el puerto (R2, R3).
 *
 * R17: el nombre y su forma normalizada se calculan juntos aqui, con
 * `normalizePresentationName`, y se persisten juntos en la misma llamada al puerto -no
 * hay ninguna escritura que guarde uno sin el otro.
 *
 * R18/R20: el puerto puede devolver `'duplicate'` aunque no haya ninguna comprobacion
 * previa que lo anticipe -es el indice unico de la base el que cierra la carrera entre
 * dos altas simultaneas (design.md > 7, § 11.4)-, y este caso de uso SIEMPRE traduce esa
 * respuesta a `PresentationDuplicateNameError`, nunca la ignora ni confia en que zod ya
 * lo filtro.
 *
 * QC-80 (R11, R13): la unidad viaja al puerto JUNTO al nombre y su forma normalizada, en
 * la misma escritura -no hay ningun camino que cree una presentacion sin unidad-. El
 * `'invalid_unit'` que devuelve el puerto cuando la FK `presentations_unit_id_fkey` rechaza
 * la escritura se traduce a `ValidationError` (codigo `invalid_input`), que es como el resto
 * del modulo trata una FK rota, y queda DISTINGUIBLE de `PresentationDuplicateNameError`.
 */
export function createCreatePresentation(
  deps: CreatePresentationDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<{ id: string }> {
  return async function createPresentation(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<{ id: string }> {
    requirePermission(actor, 'inventario.modificar');

    const parsed = createPresentationSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const nameNormalized = normalizePresentationName(parsed.data.name);
    const result = await deps.presentations.create({
      name: parsed.data.name,
      nameNormalized,
      unitId: parsed.data.unitId,
    });
    if (result === 'duplicate') throw new PresentationDuplicateNameError();
    if (result === 'invalid_unit') throw new ValidationError();

    return result;
  };
}
