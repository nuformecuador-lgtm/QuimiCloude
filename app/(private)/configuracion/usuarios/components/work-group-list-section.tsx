import type { DataTableParams } from '@/components/shared/data-table';
import { listWorkGroupsAction } from '@/lib/modules/identity/adapters/driving/work-group-actions';

import { FIRST_PAGE } from './user-list-params';
import { WorkGroupListEmpty } from './work-group-list-empty';
import { WorkGroupListError } from './work-group-list-error';
import { workGroupListHref } from './work-group-list-params';
import { WorkGroupTable } from './work-group-table';

/**
 * Seccion de lista de grupos: pide los datos y despacha a uno de los tres estados (R11, R18, R19,
 * R36; `design.md > 4.3`).
 *
 * **Server Component `async`**: los datos se piden en el servidor y bajan al cliente ya
 * renderizados. Es la parte que la pagina envuelve en `<Suspense>`, de modo que el esqueleto de
 * R19 aparece solo mientras esta consulta esta en vuelo.
 *
 * **UNA sola lectura, a diferencia de personas.** `user-list-section.tsx` pide ademas el catalogo
 * de roles para el selector del panel; aqui **no hay catalogo que traer**: el formulario del grupo
 * captura exactamente un campo, el nombre (R22). Una segunda consulta seria una consulta inventada.
 *
 * **Los parametros viajan ENTEROS y sin traducir**: `DataTableParams` es campo a campo la misma
 * forma que `ListQuery`, y `createListQuerySchema()` es un `z.strictObject`, asi que traducir aqui
 * solo podria introducir una clave de mas (`design.md > 4.1`).
 *
 * **La action se importa por su RUTA EXACTA**, jamas desde `@/lib/modules/identity` (R36): un
 * `'use server'` en el cierre transitivo del contrato lo haria inimportable desde cualquier
 * componente de cliente, y la guardia de arquitectura lo vigila.
 *
 * **Aqui no se decide nada sobre permisos** (R11): no se lee la sesion, no se importa el punto de
 * composicion y no se repite ninguna comprobacion. La autorizacion la aportan los casos de uso de
 * `identity`; si la operacion responde `unauthorized` se pinta el estado de error **sin un solo
 * dato de grupos**. `canModify` solo se transporta: lo resolvio la pagina (R9, R10).
 */

export const WORK_GROUP_LIST_TESTID = 'work-group-list';

export type WorkGroupListSectionProps = {
  /** Los parametros ya acotados por `parseWorkGroupListParams` (R17). */
  readonly params: DataTableParams;
  /** Si la sesion trae `usuarios.modificar` (R9). Llega por props desde la pagina (R10). */
  readonly canModify: boolean;
};

export async function WorkGroupListSection({ params, canModify }: WorkGroupListSectionProps) {
  const pageResult = await listWorkGroupsAction(params);

  // R11 y R19: con error NO se pinta tabla, ni fila, ni un dato. Ni siquiera una tabla vacia, que
  // seria decir «no hay grupos» sin saberlo.
  if (pageResult.status === 'error') {
    return <WorkGroupListError error={pageResult} />;
  }

  const { items, page: currentPage, totalPages } = pageResult.data;

  if (items.length === 0) {
    // R18: las dos salidas, **cada una bajo su condicion**, y ningun «crea el primero».
    return (
      <WorkGroupListEmpty
        clearSearchHref={
          params.search.trim() !== ''
            ? workGroupListHref({ ...params, search: '', page: FIRST_PAGE })
            : undefined
        }
        firstPageHref={
          currentPage > FIRST_PAGE ? workGroupListHref({ ...params, page: FIRST_PAGE }) : undefined
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid={WORK_GROUP_LIST_TESTID}>
      {/*
        `work-group-table.tsx` es un modulo de CLIENTE —la columna de acciones declara una celda que
        devuelve elementos—, asi que desde aqui solo bajan datos serializables: las filas, los
        parametros vigentes, el total de paginas y la decision de R9. La tabla recibe
        `status: 'idle'`: los tres estados se pintan FUERA de `<DataTable>`.
      */}
      <WorkGroupTable
        groups={items}
        params={params}
        totalPages={totalPages}
        canModify={canModify}
      />
    </div>
  );
}
