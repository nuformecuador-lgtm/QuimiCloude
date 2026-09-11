// Barrel de los componentes de la ruta de usuarios (R38,
// `docs/architecture.md > Componentes > Regla: componentes de ruta en components/ con barrel index.ts`).
//
// Sin `'use client'`: la frontera cliente/servidor se declara en CADA archivo de componente, nunca
// aqui. Asi `page.tsx` sigue siendo Server Component aunque importe desde el barrel, y la seccion
// de lista (servidor) podra convivir con la tabla y las acciones de fila (cliente).
//
// La pagina y todo consumidor de fuera de la carpeta —los tests incluidos— entran SIEMPRE por
// aqui, nunca por ruta profunda. Entre hermanos de la propia carpeta los importes siguen siendo
// RELATIVOS: entrar por el barrel de la propia carpeta crearia un ciclo.
//
// **Cada nombre sale de UN solo archivo**: `ACCOUNT_STATUS_COLUMN_ID` lo declara
// `user-list-params.ts` —es la clave de `DataTableParams.filters`— y se publica solo desde ahi,
// aunque `user-columns.tsx` tambien lo use.
//
// **Barrel PARCIAL a proposito**: hoy existen las piezas de T4 a T8. T13 lo cierra con el panel
// lateral y los dos dialogos de las escrituras.
export {
  ACCOUNT_STATUS_COLUMN_ID,
  FILTER_SEPARATOR,
  FIRST_PAGE,
  PAGE_PARAM,
  PAGE_SIZE_PARAM,
  SEARCH_PARAM,
  SORT_PARAM,
  SORT_SEPARATOR,
  STATUS_PARAM,
  buildUserListQuery,
  parseUserListParams,
  userListHref,
  type UserListSearchParams,
} from './user-list-params';
export {
  USERS_TITLE_TESTID,
  USER_ACCOUNT_STATUS_LABELS,
  USER_STATUS_FILTER_OPTIONS,
  changeUserStatusLabel,
  deleteUserLabel,
  editUserLabel,
  toDateInputValue,
} from './user-labels';
export {
  ACTIONS_COLUMN_ID,
  DISPLAY_NAME_COLUMN_ID,
  EMAIL_COLUMN_ID,
  ROLE_NAME_COLUMN_ID,
  USERNAME_COLUMN_ID,
  USER_COLUMNS,
  USER_COLUMN_COUNT,
  USER_STATUS_BADGE_TESTID,
  UserStatusBadge,
  createUserColumns,
  type UserColumnsDeps,
} from './user-columns';
export {
  USER_LIST_CLEAR_SEARCH_TESTID,
  USER_LIST_EMPTY_MESSAGE_TESTID,
  USER_LIST_EMPTY_TESTID,
  USER_LIST_FIRST_PAGE_TESTID,
  UserListEmpty,
  type UserListEmptyProps,
} from './user-list-empty';
export {
  USER_LIST_ERROR_CODE_TESTID,
  USER_LIST_ERROR_MESSAGE_TESTID,
  USER_LIST_ERROR_TESTID,
  USER_LIST_RETRY_TESTID,
  UserListError,
  type UserListErrorProps,
} from './user-list-error';
export { USER_LIST_TESTID, UserListSection, type UserListSectionProps } from './user-list-section';
export {
  USER_LIST_SKELETON_TESTID,
  USER_ROW_SKELETON_TESTID,
  USER_SKELETON_COLUMN_COUNT,
  UserListSkeleton,
} from './user-list-skeleton';
export {
  USER_ACTION_DELETE_TESTID,
  USER_ACTION_EDIT_TESTID,
  USER_ACTION_STATUS_TESTID,
  USER_ROW_ACTIONS_TESTID,
  UserRowActions,
  type UserRowActionHandler,
  type UserRowActionsProps,
} from './user-row-actions';
export {
  USER_TABLE_ID,
  USER_TABLE_TESTID,
  USER_TABLE_TEXTS,
  UserTable,
  type UserPanel,
  type UserPanelMode,
  type UserTableProps,
} from './user-table';
