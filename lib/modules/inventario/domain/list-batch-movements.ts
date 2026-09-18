import { requirePermission, type Actor } from './actor';
import { BatchNotFoundError } from './errors';

import type { InventoryMovementView } from './inventory-movement';
import type { ProductRepository } from '../ports/product-repository';

// De otro modulo se consume SOLO su contrato publico, nunca una ruta profunda
// (`docs/architecture.md > La regla de dependencias`). Solo el tipo: el contrato de este modulo lo
// carga un componente de cliente y no puede arrastrar servidor.
import type { PeopleDirectory } from '@/lib/modules/identity';

export type ListBatchMovementsDeps = {
  readonly products: ProductRepository;
  /** Los nombres mostrables de los autores, incluidos los de las cuentas dadas de baja. */
  readonly people: PeopleDirectory;
  /** Inyectable para que los tests fijen el instante sin tocar el reloj global. */
  readonly now?: () => Date;
};

/**
 * El historial de un lote, del asiento mas reciente al mas antiguo.
 *
 * **El `authorName` que llega del puerto es el IDENTIFICADOR de quien escribio el asiento**, y este
 * caso de uso lo sustituye por su nombre mostrable. La sustitucion vive aqui y no en la
 * persistencia porque quien sabe componer el nombre de una persona es `identity`: que un adaptador
 * de inventario leyera la tabla de usuarios de otro modulo es exactamente lo que prohiben los
 * anti-patrones de `docs/architecture.md`. Por eso el directorio entra como puerto de `identity` y
 * la persistencia de este modulo sigue sin conocer a las personas.
 *
 * Se pregunta por el metodo que INCLUYE a las personas de baja: un autor no desaparece del
 * historial porque su cuenta se desactive. Y el autor que no vuelve del directorio SIGUE SALIENDO,
 * con su identificador; un `filter` convertiria un dato raro en un asiento invisible.
 *
 * Un lote sin ningun asiento -anterior al libro- devuelve lista vacia, que no es lo mismo que el
 * lote inexistente o de otra empresa: esos dos, y solo esos, son el error.
 */
export function createListBatchMovements(
  deps: ListBatchMovementsDeps,
): (
  batchId: string,
  actor: Actor | null | undefined,
) => Promise<readonly InventoryMovementView[]> {
  return async function listBatchMovements(
    batchId: string,
    actor: Actor | null | undefined,
  ): Promise<readonly InventoryMovementView[]> {
    requirePermission(actor, 'inventario.consultar');

    const movements = await deps.products.findBatchMovements(batchId, {
      companyId: actor.companyId,
    });
    if (movements === null) throw new BatchNotFoundError();

    // Sin asientos no hay ningun identificador que resolver, asi que no se pregunta.
    if (movements.length === 0) return [];

    const now = deps.now?.() ?? new Date();
    const ids = movements
      .map((movement) => movement.authorName)
      .filter((id): id is string => id !== null);

    const refs = await deps.people.findRefsIncludingDeletedInCompany(actor.companyId, ids, now);
    const displayNames = new Map(refs.map((ref) => [ref.id, ref.displayName] as const));

    return movements.map((movement) => ({
      ...movement,
      authorName:
        movement.authorName === null
          ? null
          : (displayNames.get(movement.authorName) ?? movement.authorName),
    }));
  };
}
