import type { DataTableParams } from '@/components/shared/data-table';
import type { ErrorState } from '@/lib/modules/errores';
import type { RoleOption } from '@/lib/modules/identity';
import { listUsersAction } from '@/lib/modules/identity/adapters/driving/user-actions';

import { FIRST_PAGE, userListHref } from './user-list-params';
import { UserTable } from './user-table';

/**
 * Seccion de lista: pide los datos y despacha a uno de los tres estados (R7, R11, R18, R19, R24;
 * `design.md > 6`).
 *
 * **Server Component `async`**: los datos se piden en el servidor y bajan al cliente ya
 * renderizados. Es la parte que la pagina envuelve en `<Suspense>`, de modo que el esqueleto de
 * R19 aparece solo mientras esta consulta esta en vuelo.
 *
 * **UNA sola lectura propia**: `listUsersAction(params)` trae **la pagina que se pinta**, con los
 * parametros enteros y sin traducir: `DataTableParams` es campo a campo la misma forma que
 * `ListQuery`, y `createListQuerySchema()` es un `z.strictObject`, asi que traducir aqui solo
 * podria introducir una clave de mas (`design.md > 4.1`). Decide el estado de la pantalla (R19).
 *
 * **El catalogo de roles YA NO se pide aqui.** Lo trae `page.tsx` una sola vez (R24) porque
 * tambien lo necesita el disparador del alta de la cabecera, y baja por props junto con su
 * `ErrorState` si la consulta fallo —el mismo degradado declarado de siempre: si falla, la lista
 * se pinta igual y el panel recibe el error sin opciones inventadas, nunca un error total por no
 * poder rellenar un `<select>`.
 *
 * **La action se importa por su RUTA EXACTA**, jamas desde `@/lib/modules/identity` (R36): un
 * `'use server'` en el cierre transitivo del contrato lo haria inimportable desde cualquier
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
 * **El disparador del alta YA NO cuelga de aqui: vive en `page.tsx`, junto al `<h1>`** (decision
 * humana del 2026-09-17, extendida al mover el boton a la cabecera). Antes era hermana de los tres
 * estados de esta seccion para pintarse con filas, sin ellas y tambien en el estado de error —esta
 * seccion ya no monta `UserCreateAction` en ninguno de los dos caminos—; la pagina logra la misma
 * garantia pintandolo siempre, antes de decidir siquiera que seccion de pestana montar.
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
  /**
   * El catalogo de roles del selector de cada fila (R24), resuelto UNA VEZ en `page.tsx` y bajado
   * por props (R8): esta seccion ya no llama a `listRolesAction` por su cuenta.
   */
  readonly roles: readonly RoleOption[];
  /** El error de la consulta de roles, o `null`. Degradado declarado de `design.md > 6` (R24). */
  readonly rolesError: ErrorState | null;
};

/** `true` si hay termino de busqueda o algun filtro activo: las dos cosas que el vacio limpia. */
function hasActiveQuery(params: DataTableParams): boolean {
  return params.search.trim() !== '' || Object.keys(params.filters).length > 0;
}

export async function UserListSection({
  params,
  canModify,
  currentUserId,
  roles,
  rolesError,
}: UserListSectionProps) {
  const pageResult = await listUsersAction(params);

  // Con error NO se pinta tabla, ni fila, ni un dato: la tabla pinta solo el estado de error.
  if (pageResult.status === 'error') {
    return (
      <UserTable
        status="error"
        error={pageResult}
        users={[]}
        params={params}
        totalPages={0}
        canModify={canModify}
        currentUserId={currentUserId}
        roles={roles}
        rolesError={rolesError}
      />
    );
  }

  const { items, page: currentPage, totalPages } = pageResult.data;

  if (items.length === 0) {
    // El vacio **no** ofrece «crear el primero»: quien ofrece el alta es la pantalla, arriba. Con
    // termino o filtro tambien es este vacio, no el «sin resultados» de la tabla.
    return (
      <UserTable
        users={items}
        params={params}
        totalPages={totalPages}
        canModify={canModify}
        currentUserId={currentUserId}
        roles={roles}
        rolesError={rolesError}
        empty={{
          clearSearchHref: hasActiveQuery(params)
            ? userListHref({ ...params, search: '', filters: {}, page: FIRST_PAGE })
            : undefined,
          firstPageHref:
            currentPage > FIRST_PAGE ? userListHref({ ...params, page: FIRST_PAGE }) : undefined,
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid={USER_LIST_TESTID}>
      {/*
        `user-table.tsx` es un modulo de CLIENTE —la columna de acciones declara una celda que
        devuelve elementos—, asi que desde aqui solo bajan datos serializables: las filas, los
        parametros vigentes, el total de paginas, la decision de permisos y el catalogo de roles
        con su error.
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
