import { requirePermission, type Actor } from './actor';
import { BatchNotFoundError } from './errors';

import type { BatchHistoryEntry, OrderNumberDirectory } from './reservation';
import type { ProductRepository } from '../ports/product-repository';

// De otro modulo se consume SOLO su contrato publico, nunca una ruta profunda
// (`docs/architecture.md > La regla de dependencias`). Solo el tipo: el contrato de este modulo lo
// carga un componente de cliente y no puede arrastrar servidor.
import type { PeopleDirectory } from '@/lib/modules/identity';

export type ListBatchMovementsDeps = {
  readonly products: ProductRepository;
  /** Los nombres mostrables de los autores, incluidos los de las cuentas dadas de baja. */
  readonly people: PeopleDirectory;
  /** El numero visible de cada pedido citado en el historial. */
  readonly orders: OrderNumberDirectory;
  /** Inyectable para que los tests fijen el instante sin tocar el reloj global. */
  readonly now?: () => Date;
};

/**
 * El historial de un lote, del asiento mas reciente al mas antiguo: une lo que aparto, libero,
 * caduco o consumio un pedido con los movimientos del libro fisico.
 *
 * **`orderNumberText` y `authorName` llegan del puerto como el IDENTIFICADOR** de la fila -el
 * pedido y quien escribio el asiento-, y este caso de uso los sustituye por su forma mostrable.
 * La sustitucion vive aqui y no en la persistencia porque quien sabe componer el numero de un
 * pedido es `pedidos` y quien sabe componer el nombre de una persona es `identity`: que un
 * adaptador de inventario leyera esas tablas es exactamente lo que prohiben los anti-patrones de
 * `docs/architecture.md`. Por eso los dos directorios entran como puertos declarados por
 * `inventario` -`identity` publica el suyo, `inventario` declara el hueco de `pedidos` para no
 * cerrar un ciclo- y `lib/composition` los cabla.
 *
 * Se pregunta por los metodos que INCLUYEN lo dado de baja o borrado: un autor no desaparece
 * porque su cuenta se desactive, y un pedido no desaparece del historial porque lo cancelen,
 * entreguen o borren. Y lo que no vuelve del directorio SIGUE SALIENDO, con su identificador; un
 * `filter` convertiria un dato raro en un asiento invisible.
 *
 * Un lote sin ningun asiento -anterior al libro- devuelve lista vacia, que no es lo mismo que el
 * lote inexistente o de otra empresa: esos dos, y solo esos, son el error.
 */
export function createListBatchMovements(
  deps: ListBatchMovementsDeps,
): (
  batchId: string,
  actor: Actor | null | undefined,
) => Promise<readonly BatchHistoryEntry[]> {
  return async function listBatchMovements(
    batchId: string,
    actor: Actor | null | undefined,
  ): Promise<readonly BatchHistoryEntry[]> {
    requirePermission(actor, 'inventario.consultar');

    const movements = await deps.products.findBatchMovements(batchId, {
      companyId: actor.companyId,
    });
    if (movements === null) throw new BatchNotFoundError();

    // Sin asientos no hay ningun identificador que resolver, asi que no se pregunta.
    if (movements.length === 0) return [];

    const now = deps.now?.() ?? new Date();
    const authorIds = movements
      .map((movement) => movement.authorName)
      .filter((id): id is string => id !== null);
    const orderIds = [
      ...new Set(
        movements
          .map((movement) => movement.orderNumberText)
          .filter((id): id is string => id !== null),
      ),
    ];

    const [refs, orderNumbers] = await Promise.all([
      deps.people.findRefsIncludingDeletedInCompany(actor.companyId, authorIds, now),
      orderIds.length === 0
        ? Promise.resolve(new Map<string, string>())
        : deps.orders.findNumberTexts(actor.companyId, orderIds),
    ]);
    const displayNames = new Map(refs.map((ref) => [ref.id, ref.displayName] as const));

    return movements.map((movement) => ({
      ...movement,
      authorName:
        movement.authorName === null
          ? null
          : (displayNames.get(movement.authorName) ?? movement.authorName),
      orderNumberText:
        movement.orderNumberText === null
          ? null
          : (orderNumbers.get(movement.orderNumberText) ?? movement.orderNumberText),
    }));
  };
}
