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
// **Barrel COMPLETO desde T13**: republica los VEINTISIETE componentes de la ruta —los trece de la
// pantalla de personas (QC-67), las tres piezas del conmutador de pestanas (QC-85 T2), las siete
// de la lista de grupos (QC-85 T3–T7) y las cuatro de las escrituras de grupos (QC-85 T8–T11)— y
// ningun nombre publico se queda fuera.
// `usuarios-convenciones.test.ts` lo ata por los dos lados: que cada archivo aparezca aqui y que
// cada nombre exportado por ellos este republicado.
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
  endUserSessionsLabel,
  endUserSessionsMessage,
  endUserSessionsSuccess,
  endUserSessionsTitle,
  toDateInputValue,
} from './user-labels';
export {
  DELETE_USER_CONFIRM_TESTID,
  DELETE_USER_DIALOG_TESTID,
  DELETE_USER_DISMISS_TESTID,
  DELETE_USER_ERROR_MESSAGE_TESTID,
  DELETE_USER_ERROR_TESTID,
  DELETE_USER_FORM_TESTID,
  DELETE_USER_ID_FIELD,
  DELETE_USER_ID_TESTID,
  DELETE_USER_MESSAGE_TESTID,
  DeleteUserDialog,
  type DeleteUserDialogProps,
} from './delete-user-dialog';
export {
  END_USER_SESSIONS_CONFIRM_TESTID,
  END_USER_SESSIONS_DIALOG_TESTID,
  END_USER_SESSIONS_DISMISS_TESTID,
  END_USER_SESSIONS_ERROR_MESSAGE_TESTID,
  END_USER_SESSIONS_ERROR_TESTID,
  END_USER_SESSIONS_FORM_TESTID,
  END_USER_SESSIONS_ID_FIELD,
  END_USER_SESSIONS_ID_TESTID,
  END_USER_SESSIONS_MESSAGE_TESTID,
  EndUserSessionsDialog,
  type EndUserSessionsDialogProps,
} from './end-user-sessions-dialog';
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
  USER_CREATE_OPEN_TESTID,
  UserCreateAction,
  type UserCreateActionProps,
} from './user-create-action';
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
export {
  USER_BIRTH_DATE_FIELD,
  USER_BUSINESS_FIELDS,
  USER_DOCUMENT_NUMBER_FIELD,
  USER_DOCUMENT_TYPE_FIELD,
  USER_DOCUMENT_TYPE_OPTION_TESTID,
  USER_EMAIL_FIELD,
  USER_ERROR_TESTIDS,
  USER_FIELD_TESTIDS,
  USER_FIRST_NAMES_FIELD,
  USER_FORM_CANCEL_TESTID,
  USER_FORM_END_SESSIONS_TESTID,
  USER_FORM_ERROR_CODE_TESTID,
  USER_FORM_ERROR_TESTID,
  USER_FORM_SUBMIT_TESTID,
  USER_FORM_TESTID,
  USER_LAST_NAMES_FIELD,
  USER_PHONE_FIELD,
  USER_ROLE_FIELD,
  USER_ROLE_OPTION_TESTID,
  USER_ROLES_ERROR_TESTID,
  USER_SHEET_TESTID,
  USER_USERNAME_FIELD,
  UserForm,
  type UserFieldName,
  type UserFormEndSessions,
  type UserFormProps,
} from './user-form';
export {
  USER_SHEET_ERROR_CODE_TESTID,
  USER_SHEET_ERROR_TESTID,
  USER_SHEET_LOADING_TESTID,
  UserSheet,
  type UserSheetProps,
} from './user-sheet';
export {
  USER_STATUS_CONFIRM_TESTID,
  USER_STATUS_DIALOG_TESTID,
  USER_STATUS_DISMISS_TESTID,
  USER_STATUS_ERROR_MESSAGE_TESTID,
  USER_STATUS_ERROR_TESTID,
  USER_STATUS_FIELD,
  USER_STATUS_FORM_TESTID,
  USER_STATUS_ID_FIELD,
  USER_STATUS_ID_TESTID,
  USER_STATUS_MESSAGE_TESTID,
  USER_STATUS_OPTION_TESTID,
  USER_STATUS_SELECT_TESTID,
  UserStatusDialog,
  type UserStatusDialogProps,
} from './user-status-dialog';
export {
  USUARIOS_TABS_TESTID,
  USUARIOS_TAB_TESTIDS,
  UsuariosTabsSwitch,
  type UsuariosTabsSwitchProps,
} from './usuarios-tabs-switch';
export {
  GROUPS_TAB,
  TAB_PARAM,
  USERS_TAB,
  USUARIOS_TABS,
  isUsuariosTab,
  parseUsuariosTab,
  usuariosTabHref,
  type UsuariosTab,
} from './usuarios-tabs';
export {
  USUARIOS_TABS_LABEL,
  USUARIOS_TAB_LABELS,
  WORK_GROUP_ACTIONS_COLUMN_LABEL,
  WORK_GROUP_MEMBERS_COLUMN_LABEL,
  WORK_GROUP_NAME_COLUMN_LABEL,
  WORK_GROUP_SECTION_TESTID,
  deleteWorkGroupLabel,
  editWorkGroupLabel,
} from './work-group-labels';
export {
  WORK_GROUP_ACTIONS_COLUMN_ID,
  WORK_GROUP_ACTION_DELETE_TESTID,
  WORK_GROUP_ACTION_EDIT_TESTID,
  WORK_GROUP_COLUMNS,
  WORK_GROUP_COLUMN_COUNT,
  WORK_GROUP_MEMBERS_COLUMN_ID,
  WORK_GROUP_NAME_COLUMN_ID,
  WORK_GROUP_ROW_ACTIONS_TESTID,
  WorkGroupRowActions,
  createWorkGroupColumns,
  type WorkGroupColumnsDeps,
  type WorkGroupRowActionHandler,
  type WorkGroupRowActionsProps,
} from './work-group-columns';
export {
  WORK_GROUP_LIST_CLEAR_SEARCH_TESTID,
  WORK_GROUP_LIST_EMPTY_MESSAGE_TESTID,
  WORK_GROUP_LIST_EMPTY_TESTID,
  WORK_GROUP_LIST_FIRST_PAGE_TESTID,
  WorkGroupListEmpty,
  type WorkGroupListEmptyProps,
} from './work-group-list-empty';
export {
  WORK_GROUP_LIST_ERROR_CODE_TESTID,
  WORK_GROUP_LIST_ERROR_MESSAGE_TESTID,
  WORK_GROUP_LIST_ERROR_TESTID,
  WORK_GROUP_LIST_RETRY_TESTID,
  WorkGroupListError,
  type WorkGroupListErrorProps,
} from './work-group-list-error';
export {
  buildWorkGroupListQuery,
  parseWorkGroupListParams,
  workGroupListHref,
  type WorkGroupListSearchParams,
} from './work-group-list-params';
export {
  WORK_GROUP_LIST_TESTID,
  WorkGroupListSection,
  type WorkGroupListSectionProps,
} from './work-group-list-section';
export {
  WORK_GROUP_LIST_SKELETON_TESTID,
  WORK_GROUP_ROW_SKELETON_TESTID,
  WORK_GROUP_SKELETON_COLUMN_COUNT,
  WorkGroupListSkeleton,
} from './work-group-list-skeleton';
export {
  DELETE_WORK_GROUP_CONFIRM_TESTID,
  DELETE_WORK_GROUP_DIALOG_TESTID,
  DELETE_WORK_GROUP_DISMISS_TESTID,
  DELETE_WORK_GROUP_ERROR_MESSAGE_TESTID,
  DELETE_WORK_GROUP_ERROR_TESTID,
  DELETE_WORK_GROUP_FORM_TESTID,
  DELETE_WORK_GROUP_ID_TESTID,
  DELETE_WORK_GROUP_MESSAGE_TESTID,
  DeleteWorkGroupDialog,
  type DeleteWorkGroupDialogProps,
} from './delete-work-group-dialog';
export {
  WORK_GROUP_CANDIDATES_ERROR_TESTID,
  WORK_GROUP_CANDIDATES_LOADING_TESTID,
  WORK_GROUP_FORM_CANCEL_TESTID,
  WORK_GROUP_FORM_ERROR_CODE_TESTID,
  WORK_GROUP_FORM_ERROR_TESTID,
  WORK_GROUP_FORM_ID_TESTID,
  WORK_GROUP_FORM_SUBMIT_TESTID,
  WORK_GROUP_FORM_TESTID,
  WORK_GROUP_ID_FIELD,
  WORK_GROUP_MEMBER_PICKER_TABLE_ID,
  WORK_GROUP_NAME_ERROR_TESTID,
  WORK_GROUP_NAME_FIELD,
  WORK_GROUP_NAME_FIELD_TESTID,
  WORK_GROUP_NAME_ISSUE_MESSAGES,
  WORK_GROUP_PENDING_MEMBER_REMOVE_TESTID,
  WORK_GROUP_PENDING_MEMBER_TESTID,
  WORK_GROUP_SHEET_TESTID,
  WorkGroupForm,
  WorkGroupMemberPicker,
  workGroupNameIssue,
  type WorkGroupFormProps,
  type WorkGroupMemberPickerProps,
  type WorkGroupNameIssue,
} from './work-group-form';
export {
  WORK_GROUP_ADD_ERROR_TESTID,
  WORK_GROUP_MEMBERS_EMPTY_TESTID,
  WORK_GROUP_MEMBERS_ERROR_TESTID,
  WORK_GROUP_MEMBERS_LOADING_TESTID,
  WORK_GROUP_MEMBERS_NEXT_TESTID,
  WORK_GROUP_MEMBERS_POSITION_TESTID,
  WORK_GROUP_MEMBERS_PREVIOUS_TESTID,
  WORK_GROUP_MEMBERS_TESTID,
  WORK_GROUP_MEMBER_ID_FIELD,
  WORK_GROUP_MEMBER_NAME_TESTID,
  WORK_GROUP_MEMBER_REMOVE_TESTID,
  WORK_GROUP_MEMBER_ROW_TESTID,
  WORK_GROUP_REMOVE_ERROR_TESTID,
  WorkGroupMembers,
  workGroupMembersPositionLabel,
  type WorkGroupMembersProps,
} from './work-group-members';
export { WorkGroupSheet, type WorkGroupSheetProps } from './work-group-sheet';
export {
  WORK_GROUP_CREATE_OPEN_TESTID,
  WorkGroupCreateAction,
  type WorkGroupCreateActionProps,
} from './work-group-create-action';
export {
  WORK_GROUP_TABLE_ID,
  WORK_GROUP_TABLE_TESTID,
  WORK_GROUP_TABLE_TEXTS,
  WorkGroupTable,
  type WorkGroupPanel,
  type WorkGroupPanelMode,
  type WorkGroupTableProps,
} from './work-group-table';
