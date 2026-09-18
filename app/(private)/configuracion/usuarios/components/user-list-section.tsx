import type { DataTableParams } from '@/components/shared/data-table';
import type { ErrorState } from '@/lib/modules/errores';
import type { RoleOption } from '@/lib/modules/identity';
import { listRolesAction } from '@/lib/modules/identity/adapters/driving/role-actions';
import { listUsersAction } from '@/lib/modules/identity/adapters/driving/user-actions';

import { UserCreateAction } from './user-create-action';
import { UserListEmpty } from './user-list-empty';
import { UserListError } from './user-list-error';
import { FIRST_PAGE, userListHref } from './user-list-params';
import { UserTable } from './user-table';

/**
 * Seccion de lista: pide los datos y despacha a uno de los tres estados (R7, R11, R18, R19, R24;
 * `design.md > 6`).
 *
 * **Server Component `async`**: los datos se piden en el servidor y bajan al cliente ya
 * renderizados. Es la parte que la pagina envuelve en `<Suspense>`, de modo que el esqueleto de
 * R19 aparece solo mientras estas consultas estan en vuelo.
 *
 * **DOS lecturas en `Promise.all`, y no compiten por el mismo papel**:
 *
 * 1. `listUsersAction(params)` trae **la pagina que se pinta**, con los parametros enteros y sin
 *    traducir: `DataTableParams` es campo a campo la misma forma que `ListQuery`, y
 *    `createListQuerySchema()` es un `z.strictObject`, asi que traducir aqui solo podria
 *    introducir una clave de mas (`design.md > 4.1`).
 * 2. `listRolesAction()` trae el **catalogo de roles** del selector del panel (R24). Es corto y
 *    cerrado, no se pagina y no recibe parametros.
 *
 * **La primera decide el estado de la pantalla** (R19). **Degradado declarado** para la segunda:
 * si falla, la lista **se pinta igual** y lo que se propaga es su `ErrorState` hacia el panel, que
 * lo presenta y **no ofrece opciones inventadas** (R24). Una lista visible vale mas que un error
 * total por no poder rellenar un `<select>`.
 *
 * **Las dos actions se importan por su RUTA EXACTA**, jamas desde `@/lib/modules/identity` (R36):
 * un `'use server'` en el cierre transitivo del contrato lo haria inimportable desde cualquier
 * componente de cliente, y la guardia de arquitectura lo vigila.
 *
 * **Aqui no se decide nada sobre permisos** (R7): no se lee la sesion, no se repite ninguna
 * comprobacion y no se ocultan columnas por rol. La autorizacion la aportan los casos de uso de
 * `identity`; si la operacion responde `unauthorized` se pinta el estado de error **sin un solo
 * dato**. `canModify` solo se transporta: lo resolvio la pagina con `assertPermission` (R6, R8).
 *
 * **R11**: el actor no esta en la lista porque el modulo no lo devuelve, y esta seccion **no lo
 * compensa**: no anade su fila, no anuncia que falte y no ofrece ninguna accion sobre si mismo.
 * No hay ni una linea aqui sobre el actor, y eso es el requisito.
 *
 * **El alta cuelga de AQUI y no de la tabla** (decision humana del 2026-09-17). `UserCreateAction`
 * es hermana de los tres estados, no hija de uno: se pinta **antes** de decidir cual toca, asi que
 * el disparador esta con filas y sin ellas. Montarlo dentro de la tabla lo ataba al estado de
 * exito, y como el listado excluye al actor (R11) una instalacion recien sembrada —un solo usuario,
 * el que mira la pantalla— caia siempre en el vacio: no habia forma de crear al segundo.
 *
 * **En el estado de ERROR tambien se ofrece** (decision del 2026-09-17, segunda tanda). La duda de
 * la primera —«si la consulta fallo, no sabemos si es un fallo de lectura o una negativa»— no se
 * sostiene: el `ErrorState` trae el codigo, y ademas el `unauthorized` aqui es casi inalcanzable
 * —quien no trae `usuarios.consultar` recibio un 404 antes de llegar—. El unico camino real es que
 * la sesion muera entre el corte de la pagina y la consulta, y entonces `canModify`, que sale de
 * leer esa MISMA sesion, ya es `false`: se corrige solo.
 *
 * Lo que queda es la forma de la regla, y ahi importa mas que el caso: **«el alta esta siempre que
 * `canModify`»** no se puede erosionar, mientras que «siempre salvo cuando...» es exactamente la
 * forma del fallo que esta tanda vino a arreglar —una excepcion razonable, con su justificacion al
 * lado, que acabo dejando una instalacion sin salida—.
 */

export const USER_LIST_TESTID = 'user-list';

export type UserListSectionProps = {
  /** Los parametros ya acotados por `parseUserListParams` (R17). */
  readonly params: DataTableParams;
  /** Si la sesion trae `usuarios.modificar` (R6). Llega por props desde la pagina (R8). */
  readonly canModify: boolean;
  /**
   * El identificador del actor de la sesion, o `null` (QC-101 R12, R16). Lo resolvio la pagina de
   * la MISMA lectura que `canModify`; aqui solo se transporta hasta el panel de detalle.
   */
  readonly currentUserId: string | null;
};

/** `true` si hay termino de busqueda o algun filtro activo: las dos cosas que el vacio limpia. */
function hasActiveQuery(params: DataTableParams): boolean {
  return params.search.trim() !== '' || Object.keys(params.filters).length > 0;
}

export async function UserListSection({ params, canModify, currentUserId }: UserListSectionProps) {
  const [pageResult, rolesResult] = await Promise.all([listUsersAction(params), listRolesAction()]);

  // El degradado declarado (R24): sin catalogo, el panel recibe el error y ninguna opcion. La
  // lista se pinta igual. Se resuelve ANTES del corte por error porque el alta se ofrece tambien
  // en ese estado, y su panel necesita el catalogo: los dos resultados ya vienen del mismo
  // `Promise.all`, asi que subirlo aqui no anade ninguna lectura.
  const roles: readonly RoleOption[] = rolesResult.status === 'success' ? rolesResult.data : [];
  const rolesError: ErrorState | null = rolesResult.status === 'success' ? null : rolesResult;

  // R11 y R19: con error NO se pinta tabla, ni fila, ni un dato. Pero el alta SI sigue ahi: no
  // depende de la lista, tiene su propia autorizacion en el caso de uso, y dejarla fuera reabriria
  // el mismo callejon —un parpadeo de la base en una instalacion nueva y no hay forma de crear a
  // nadie—. La regla es «el alta esta siempre que `canModify`», sin excepciones que erosionar.
  if (pageResult.status === 'error') {
    return (
      <>
        <UserCreateAction
          canModify={canModify}
          currentUserId={currentUserId}
          roles={roles}
          rolesError={rolesError}
        />
        <UserListError error={pageResult} />
      </>
    );
  }

  const { items, page: currentPage, totalPages } = pageResult.data;

  return (
    <>
      {/*
        El alta, ANTES de elegir estado: se ofrece haya filas o no (decision del 2026-09-17). Sin
        `usuarios.modificar` este componente no emite nada (R6).
      */}
      <UserCreateAction
        canModify={canModify}
        currentUserId={currentUserId}
        roles={roles}
        rolesError={rolesError}
      />

      {items.length === 0 ? (
        // R18 INTACTO: el vacio sigue siendo el de «la busqueda no encontro nada» y **no** ofrece
        // «crear el primero». Quien ofrece el alta es la pantalla, arriba, no este estado.
        <UserListEmpty
          clearSearchHref={
            hasActiveQuery(params)
              ? userListHref({ ...params, search: '', filters: {}, page: FIRST_PAGE })
              : undefined
          }
          firstPageHref={
            currentPage > FIRST_PAGE ? userListHref({ ...params, page: FIRST_PAGE }) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-4" data-testid={USER_LIST_TESTID}>
          {/*
            `user-table.tsx` es un modulo de CLIENTE —la columna de acciones declara una celda que
            devuelve elementos—, asi que desde aqui solo bajan datos serializables: las filas, los
            parametros vigentes, el total de paginas, la decision de R6 y el catalogo de roles con
            su error. La tabla recibe `status: 'idle'` siempre: los tres estados se pintan FUERA de
            `<DataTable>`.
          */}
          <UserTable
            users={items}
            params={params}
            totalPages={totalPages}
            canModify={canModify}
            currentUserId={currentUserId}
            roles={roles}
            rolesError={rolesError}
          />
        </div>
      )}
    </>
  );
}
