import type { CustomerScope } from '../domain/customer-scope';
import type { ListQuery } from '../domain/list-query';
import type { NewCustomer, CustomerView } from '../domain/customer-view';
import type { Page } from '../domain/page';

/**
 * Puerto de acceso a datos del cliente (`design.md > 8`). El sufijo `Alive` no es adorno: el
 * filtro `deleted_at IS NULL` es de este puerto y de su adaptador, no del dominio (R25), y asi
 * ningun caso de uso puede olvidarlo. Sin ninguna operacion de restaurar ni de listar dados de
 * baja.
 *
 * Sin resultado `'duplicate'` (R19): no hay indice unico que lo produzca, y que el tipo no lo
 * pueda expresar es lo que impide que alguien anada «por si acaso» una comprobacion de
 * duplicado.
 *
 * Los cinco metodos exigen `scope: CustomerScope` al final de la firma: una llamada que lo
 * omita no compila.
 */
export interface CustomerRepository {
  create(
    data: NewCustomer,
    actorId: string,
    now: Date,
    scope: CustomerScope,
  ): Promise<{ id: string }>;

  /** `null` = no existe, esta dado de baja, o es de otra empresa: para el dominio son el
   *  mismo caso (R10, R23). */
  findAliveById(id: string, scope: CustomerScope): Promise<CustomerView | null>;

  updateAlive(
    id: string,
    data: NewCustomer,
    actorId: string,
    now: Date,
    scope: CustomerScope,
  ): Promise<'ok' | 'not_found'>;

  softDeleteAlive(id: string, actorId: string, now: Date, scope: CustomerScope): Promise<boolean>;

  listAlive(query: ListQuery, scope: CustomerScope): Promise<Page<CustomerView>>;
}
