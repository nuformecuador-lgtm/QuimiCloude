'use client';

import { actionsColumn, type DataTableColumn } from '@/components/shared/data-table';
import { Badge } from '@/components/ui/badge';
import { USER_QUERYABLE, type UserAccountStatus, type UserRow } from '@/lib/modules/identity';

import { ACCOUNT_STATUS_COLUMN_ID } from './user-list-params';
import { USER_ACCOUNT_STATUS_LABELS, USER_STATUS_FILTER_OPTIONS } from './user-labels';
import { UserRowActions, type UserRowActionHandler } from './user-row-actions';

/**
 * Las SEIS columnas de la lista de usuarios, declaradas **como datos** (R10, R13, R14, R15, R20;
 * `design.md > 7`).
 *
 * **Modulo de CLIENTE, y no por gusto**: la columna de acciones devuelve elementos, y una
 * configuracion con funciones de celda que devuelven elementos no cruza la frontera
 * servidor->cliente. Por eso la seccion de la lista (servidor, T7) baja solo datos serializables y
 * es la tabla (T8) quien monta `<DataTable>`.
 *
 * **Cinco columnas de datos y una de acciones, ninguna mas** (R10): nombre mostrable, nombre de
 * usuario, correo, rol y estado de cuenta. Aqui **no** se pinta el identificador tecnico, ni
 * `companyId`, ni el autor del ultimo cambio de estado, ni ningun dato de credencial —`UserRow`
 * no los trae, y eso lo impide el TIPO, no una promesa (R35)—. El test de R10 recorre esta misma
 * declaracion: anadir una columna prohibida obliga a tocarla.
 *
 * **Que ordena se LEE de la lista blanca, no se reescribe** (R14, R15): `sortable` sale de
 * `USER_QUERYABLE.sortable.includes(...)`, asi que la cabecera nunca promete un orden que el
 * dominio descartaria en silencio (QC-57 R5). Con la lista de hoy eso deja ordenables `username`,
 * `email` y `accountStatus`; **`displayName` no ordena** —es una composicion de `buildDisplayName`,
 * no una columna— y **`roleName` tampoco** —no esta en la lista—. Esta pantalla **no amplia la
 * lista blanca**: si algun dia se quiere ordenar por rol, es una linea en `user-queryable.ts` y su
 * propia ficha.
 *
 * **Un solo filtro, el de estado de cuenta** (R13), con las opciones derivadas del conjunto cerrado
 * del contrato. **No hay filtro por rol** y no es un olvido: `USER_QUERYABLE.filterable` declara
 * solo `accountStatus` y R15 prohibe ampliarlo desde aqui (alternativa H, descartada).
 *
 * **La columna de acciones se declara con `actionsColumn()`**: no ordena, no filtra y no se puede
 * fijar. **No se anade ninguna prop a la tabla compartida**.
 */

/** Ids de las seis columnas. Constantes porque los comparten la tabla y los tests (R41). */
export const DISPLAY_NAME_COLUMN_ID = 'displayName';
export const USERNAME_COLUMN_ID = 'username';
export const EMAIL_COLUMN_ID = 'email';
export const ROLE_NAME_COLUMN_ID = 'roleName';
export const ACTIONS_COLUMN_ID = 'actions';

/**
 * Cuantas columnas hay. Existe para que el esqueleto de carga —que lo pinta un Server Component y
 * por tanto **no puede importar este modulo de cliente**— pinte tantas celdas como columnas, y
 * para que el test lo ate a la longitud real en vez de dejarlo desincronizarse en silencio.
 */
export const USER_COLUMN_COUNT = 6;

/** `data-testid` de la insignia del estado, para que ningun test dependa del copy (R41). */
export const USER_STATUS_BADGE_TESTID = 'user-status';

/**
 * Variante visual por estado. Exhaustiva por tipo, igual que el mapa de etiquetas: el color
 * **acompana** a la etiqueta, nunca la sustituye —el estado se lee, no se adivina por el tono—.
 */
const STATUS_VARIANTS: Readonly<
  Record<UserAccountStatus, 'default' | 'secondary' | 'outline' | 'destructive'>
> = {
  active: 'default',
  pending: 'outline',
  inactive: 'secondary',
  blocked: 'destructive',
};

/**
 * El estado de cuenta **almacenado, tal cual lo devuelve la consulta** (R20). Aqui no se calcula
 * ningun estado efectivo, no se lee el instante de fin de bloqueo —`UserRow` no lo trae, a
 * proposito— y no se deriva nada de ningun contador de intentos fallidos.
 */
export function UserStatusBadge({ status }: { readonly status: UserAccountStatus }) {
  return (
    <Badge
      variant={STATUS_VARIANTS[status]}
      data-testid={USER_STATUS_BADGE_TESTID}
      data-status={status}
    >
      {USER_ACCOUNT_STATUS_LABELS[status]}
    </Badge>
  );
}

/**
 * Si una columna ordena, **preguntandoselo a la lista blanca del contrato** (R14). No es una copia
 * de la lista: es la lista.
 */
function isSortable(columnId: string): boolean {
  return USER_QUERYABLE.sortable.includes(columnId);
}

/**
 * Lo que la celda de acciones necesita y la declaracion de columnas no puede inventarse: la
 * decision de R6 y los tres disparadores. Los manejadores son **opcionales** porque el panel
 * lateral (T9) y los dos dialogos (T10, T11) aun no existen; cuando existan, se enchufan aqui sin
 * tocar `user-row-actions.tsx`.
 */
export type UserColumnsDeps = {
  /** Si la sesion trae `usuarios.modificar` (R6). Decision de presentacion, no autorizacion. */
  readonly canModify: boolean;
  readonly onEdit?: UserRowActionHandler;
  readonly onDelete?: UserRowActionHandler;
  readonly onStatusChange?: UserRowActionHandler;
};

/**
 * **Factoria, y no un array suelto**, por la misma razon que en pedidos: la celda de acciones
 * necesita `canModify` y los disparadores, y un array declarado en el modulo no tendria por donde
 * recibirlos. Las columnas siguen siendo DATOS; lo que cambia es que se construyen con sus
 * dependencias.
 */
export function createUserColumns({
  canModify,
  onEdit,
  onDelete,
  onStatusChange,
}: UserColumnsDeps): readonly DataTableColumn<UserRow>[] {
  return [
    {
      id: DISPLAY_NAME_COLUMN_ID,
      label: 'Nombre',
      align: 'start',
      // NO ordena: el nombre mostrable es una composicion, no un campo del catalogo (R14).
      sortable: isSortable(DISPLAY_NAME_COLUMN_ID),
      // Se pinta TAL CUAL llega: la composicion la hizo `buildDisplayName` en el dominio.
      cell: (user) => user.displayName,
    },
    {
      id: USERNAME_COLUMN_ID,
      label: 'Usuario',
      align: 'start',
      sortable: isSortable(USERNAME_COLUMN_ID),
      cell: (user) => user.username,
    },
    {
      id: EMAIL_COLUMN_ID,
      label: 'Correo',
      align: 'start',
      sortable: isSortable(EMAIL_COLUMN_ID),
      cell: (user) => user.email,
    },
    {
      id: ROLE_NAME_COLUMN_ID,
      label: 'Rol',
      align: 'start',
      // NO ordena y NO filtra: el rol no esta en la lista blanca, ni como orden ni como filtro
      // (R14, R15). El nombre viaja ya resuelto y es display: no autoriza nada.
      sortable: isSortable(ROLE_NAME_COLUMN_ID),
      cell: (user) => user.roleName,
    },
    {
      id: ACCOUNT_STATUS_COLUMN_ID,
      label: 'Estado',
      align: 'start',
      sortable: isSortable(ACCOUNT_STATUS_COLUMN_ID),
      // El UNICO filtro de la pantalla (R13), con las opciones derivadas del conjunto cerrado.
      filter: { kind: 'select', options: USER_STATUS_FILTER_OPTIONS },
      cell: (user) => <UserStatusBadge status={user.accountStatus} />,
    },
    // Sin `sortable` (ordenar por unas acciones no significa nada), sin `filter` (no aparece en la
    // barra de filtros) y sin anclar, para no tapar las columnas de datos.
    actionsColumn<UserRow>({
      id: ACTIONS_COLUMN_ID,
      label: 'Acciones',
      cell: (user) => (
        <UserRowActions
          user={user}
          canModify={canModify}
          onEdit={onEdit}
          onDelete={onDelete}
          onStatusChange={onStatusChange}
        />
      ),
    }),
  ];
}

/**
 * Las columnas **sin ninguna dependencia resuelta**: mismo numero, mismos ids y mismas capacidades
 * de orden y filtro que las de la fabrica. Existe para que el test de R10 pueda recorrer la
 * DECLARACION sin inventarse manejadores, y para que ese recorrido sea el mismo objeto que la
 * pantalla monta. `canModify: false` es la direccion segura por defecto.
 */
export const USER_COLUMNS: readonly DataTableColumn<UserRow>[] = createUserColumns({
  canModify: false,
});
