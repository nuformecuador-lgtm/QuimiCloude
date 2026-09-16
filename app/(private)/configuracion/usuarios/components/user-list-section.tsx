import type { DataTableParams } from '@/components/shared/data-table';
import type { ErrorState } from '@/lib/modules/errores';
import type { RoleOption } from '@/lib/modules/identity';
import { listRolesAction } from '@/lib/modules/identity/adapters/driving/role-actions';
import { listUsersAction } from '@/lib/modules/identity/adapters/driving/user-actions';

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

  if (pageResult.status === 'error') {
    return <UserListError error={pageResult} />;
  }

  // El degradado declarado (R24): sin catalogo, el panel recibe el error y ninguna opcion. La
  // lista se pinta igual.
  const roles: readonly RoleOption[] = rolesResult.status === 'success' ? rolesResult.data : [];
  const rolesError: ErrorState | null = rolesResult.status === 'success' ? null : rolesResult;

  const { items, page: currentPage, totalPages } = pageResult.data;

  if (items.length === 0) {
    // R18: el vacio es el de «la busqueda no encontro nada» y **no** ofrece «crear el primero».
    return (
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
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid={USER_LIST_TESTID}>
      {/*
        `user-table.tsx` es un modulo de CLIENTE —la columna de acciones declara una celda que
        devuelve elementos—, asi que desde aqui solo bajan datos serializables: las filas, los
        parametros vigentes, el total de paginas, la decision de R6 y el catalogo de roles con su
        error. La tabla recibe `status: 'idle'` siempre: los tres estados se pintan FUERA de
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
  );
}
