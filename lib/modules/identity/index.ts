// lib/modules/identity/index.ts — CONTRATO PUBLICO del modulo identity.
// Regla: solo reexporta de ./domain. Nada de 'use server', nada de Prisma, nada de next/*.
// Debe poder importarse desde un componente de cliente sin arrastrar servidor (R10).
export type { SessionUser } from './domain/session-user';
export { DOCUMENT_TYPE_CC, DOCUMENT_TYPE_CODES, type DocumentTypeCode } from './domain/document-type';
export { CREDENTIAL_MAX_LENGTH, loginInputSchema, type LoginInput } from './domain/credentials';
export { type SessionTicket } from './domain/session';
export { createVerifyCredentials, type VerifyCredentialsDeps } from './domain/verify-credentials';
export {
  CREDENTIAL_MIN_LENGTH,
  CREDENTIAL_RULES,
  createCredentialPolicy,
  evaluateCredentialRules,
  type CredentialPolicyResult,
  type CredentialRule,
} from './domain/credential-policy';
export { ROLE_ADMINISTRADOR, ROLE_OPERADOR, ROLE_EMPACADOR, SEED_ROLES } from './domain/roles';
// QC-74 T1 — el catalogo cerrado de permisos (R1, R2) y lo que el seed asigna a cada rol (R8, R9).
// `PermissionCode` es union de literales: exigir un codigo inexistente no compila.
export {
  PERMISSIONS,
  SEED_ROLE_PERMISSIONS,
  ADMIN_EXCLUDED_PERMISSIONS,
  type PermissionCode,
} from './domain/permissions';
// QC-74 T2 — la UNICA implementacion de «el actor tiene este permiso» (R12-R14); cada modulo
// delega aqui desde su propio `requirePermission` y pone su propio error (R15).
export { assertPermission, type PermissionBearer } from './domain/require-permission';
// QC-47 T3 — La empresa: la UNICA definicion de «mismo nombre de empresa» (R3) y el UNICO
// literal del nombre de la empresa inicial (R20). Dominio puro: no arrastran servidor ni Prisma.
export { normalizeCompanyName } from './domain/company-name';
export { INITIAL_COMPANY_NAME } from './domain/companies';
// QC-83 T1 — El grupo de trabajo: la UNICA definicion de «mismo nombre de grupo» (R3), la que
// calcula la columna `work_groups.name_normalized` y la que usara QC-84 para no inventarse una
// segunda. Dominio puro. `normalizeKey` —el cuerpo que comparte con `normalizeCompanyName`— es
// INTERNO al modulo y NO se exporta a proposito (`design.md > 4`).
export { normalizeWorkGroupName } from './domain/work-group-name';
// QC-65 T1 — la UNICA definicion del conjunto cerrado de estados de cuenta (R3) y los dos
// estados con nombre: el de una cuenta nueva (R5) y el del administrador del seed (R7). Dominio
// puro: no arrastra servidor ni Prisma. NADIE lee todavia el estado para decidir nada (R19).
export {
  INITIAL_USER_ACCOUNT_STATUS,
  SEED_ADMIN_ACCOUNT_STATUS,
  USER_ACCOUNT_STATUSES,
  type UserAccountStatus,
} from './domain/account-status';
export { seedInitialAccess, type SeedOutcome } from './domain/seed-initial-access';
export { createResolveSessionUser } from './domain/resolve-session-user';
// QC-48 T8 — La cadena unica de cortes y lo que expone al servidor. Dominio puro: no arrastra
// Prisma ni `next/*`, asi que el contrato sigue importable desde un componente de cliente.
export { createResolveSession, type ResolveSessionDeps, type ResolvedSession } from './domain/resolve-session';
export type { SessionContext } from './domain/session-context';
export { buildDisplayName } from './domain/display-name';
export { isSessionExpired, type SessionClaims } from './domain/session-claims';

// QC-9 T10 — La decision de acceso de ruta y el destino de vuelta. Solo dominio: el middleware
// las consume desde aqui sin arrastrar `next/*` ni Prisma al bundle del borde.
export {
  decideRouteAccess,
  type RedirectReason,
  type RouteAccessDecision,
  type RouteAccessInput,
  type RouteAccessSession,
} from './domain/route-access';
export {
  RETURN_PARAM,
  buildLoginRedirect,
  isInternalPath,
  resolveReturnPath,
} from './domain/return-path';

// ---------------------------------------------------------------------------------------
// QC-66 T15 — La administracion de usuarios (R42). Bloque NUEVO al final: no reordena ni
// reformatea ninguna de las lineas de arriba -hay otras sesiones tocando este modulo-.
//
// Solo simbolos de `./domain`. En particular NO se reexporta `adapters/driving/user-actions`
// (T14): QC-67 lo importa por su ruta exacta, y pasarlo por aqui metaria `'use server'` en el
// cierre transitivo del contrato y lo haria inimportable desde un componente de cliente
// (`guard-arquitectura-modulos.test.ts`, bloque del contrato). Tampoco se reexporta nada de
// `ports/` ni de `adapters/driven/**`: el puerto lo cablea `lib/composition`, que es el unico
// que necesita verlo.
// ---------------------------------------------------------------------------------------

// El actor de los seis casos de uso y la unica forma de exigirle un permiso dentro del modulo
// (R2, R3, R5). `requirePermission` delega en `assertPermission`, ya exportado arriba.
export { requirePermission, type Actor } from './domain/actor';

// La jerarquia de errores con `code` estable (R41): el adaptador driving traduce POR `code`,
// nunca por el texto del mensaje, y QC-67 reconoce el caso por la clase o por el codigo.
export {
  IdentityError,
  UnauthorizedError,
  UserNotFoundError,
  DuplicateEmailError,
  DuplicateUsernameError,
  DuplicateDocumentError,
  RoleNotFoundError,
  SelfOperationError,
  LastAdministratorError,
  ActionNotAllowedError,
  ValidationError,
} from './domain/errors';

// Los esquemas de entrada de las cuatro mutaciones (R14, R18, R20) y sus tipos inferidos.
export {
  createUserSchema,
  updateUserSchema,
  setAccountStatusSchema,
  USER_NAME_MAX_LENGTH,
  USER_EMAIL_MAX_LENGTH,
  USER_PHONE_MAX_LENGTH,
  USER_DOCUMENT_NUMBER_MAX_LENGTH,
  USER_USERNAME_MAX_LENGTH,
  type CreateUserInput,
  type UpdateUserInput,
  type SetAccountStatusInput,
} from './domain/user-input';

// La proyeccion de la fila del listado y la de la ficha (R31, R32): ninguna de las dos lleva
// hash de credencial, y eso lo fija el TIPO, no una promesa.
export type { UserRow, UserDetail } from './domain/user-view';

// El contrato compartido de listado (QC-57, R36) y la lista blanca de campos consultables de
// usuarios: QC-67 la comprueba contra el contrato en vez de contra una copia escrita a mano.
export type { Page } from './domain/page';
export {
  type ListFilterKind,
  type ListFilterValue,
  type ListQuery,
  type ListQueryable,
  type ListSort,
  type SanitizedListQuery,
  type SortDirection,
  createListQuerySchema,
  sanitizeListQuery,
} from './domain/list-query';
export { USER_QUERYABLE } from './domain/user-queryable';

// Las SEIS factories de caso de uso (`design.md > 11`). Los tipos `*Deps` viajan con ellas:
// quien las cablea es `lib/composition`, y sin el tipo no podria declarar la dependencia.
export { createCreateUser, type CreateUserDeps } from './domain/create-user';
export { createGetUser, type GetUserDeps } from './domain/get-user';
export { createListUsers, type ListUsersDeps } from './domain/list-users';
export { createUpdateUser, type UpdateUserDeps } from './domain/update-user';
export { createDeleteUser, type DeleteUserDeps } from './domain/delete-user';
export {
  createSetUserAccountStatus,
  type SetUserAccountStatusDeps,
} from './domain/set-user-account-status';

// ---------------------------------------------------------------------------------------
// QC-94 T1 — La consulta del catalogo de roles (R15). Bloque NUEVO al final: no reordena ni
// reformatea ninguna de las lineas de arriba.
//
// Solo simbolos de `./domain`. En particular NO se reexporta `adapters/driving/role-actions`:
// QC-67 lo importa por su ruta exacta, y pasarlo por aqui meteria `'use server'` en el cierre
// transitivo del contrato.
// ---------------------------------------------------------------------------------------

// La forma de exigir CUALQUIERA de varios permisos alternativos (R1, R3). `assertAnyPermission`,
// su cuerpo compartido, se queda dentro del modulo: quien autoriza pasa por aqui.
export { requireAnyPermission } from './domain/actor';

// QC-94 T10 — La salida de la consulta y su caso de uso, SOLO de `./domain` (R15, R16). El tipo
// `ListRolesDeps` viaja con la factory: quien la cablea es `lib/composition`, y sin el tipo no
// podria declarar la dependencia. El PUERTO (`ports/role-catalog-repository.ts`) y el adaptador
// driven NO se reexportan: los ve solo el punto de composicion.
export type { RoleOption } from './domain/role-view';
export { createListRoles, type ListRolesDeps } from './domain/list-roles';

// QC-79 T17 (R32) — el enlace con el que una persona ESTABLECE su contrasena la primera vez.
// Bloque NUEVO al final: no reordena ni reformatea ninguna linea de arriba.
//
// Solo simbolos de `./domain`, igual que el bloque de QC-66. En particular **NO se reexporta
// `adapters/driving/credential-setup-actions`** (T18): meteria `'use server'` en el cierre
// transitivo del contrato y lo haria inimportable desde un componente de cliente
// (`guard-arquitectura-modulos.test.ts`, bloque del contrato). La pagina publica de T19 las
// importa por su RUTA EXACTA. Tampoco se reexporta nada de `ports/` ni de `adapters/driven/**`:
// los tres puertos nuevos los cablea `lib/composition`, que es el unico que necesita verlos.
// ---------------------------------------------------------------------------------------

// La vida del enlace (R8) y el centinela con el que nace una fila sin credencial utilizable (R4).
// Dominio puro: no arrastra ni Prisma ni servidor.
export {
  CREDENTIAL_SETUP_LINK_TTL_DAYS,
  CREDENTIAL_SETUP_LINK_TTL_MS,
  NO_CREDENTIAL_SENTINEL,
  credentialSetupLinkExpiresAt,
  evaluateLink,
  isCredentialSetupLinkLive,
  type CredentialSetupLink,
  type CredentialSetupLinkState,
} from './domain/credential-setup-link';

// Las dos clases nuevas con `code` estable del catalogo cerrado de QC-70 (R34): la respuesta
// UNICA e indistinguible de los seis rechazos del enlace (R22) y el rechazo distinguible del
// reenvio a alguien que ya no esta en `pending` (R15).
export { CredentialLinkInvalidError, UserNotPendingError } from './domain/errors';

// Los dos rechazos de FORMULARIO, que quedan FUERA del catalogo por **QC-70 R29** —el campo de
// diagnostico no se serializa al navegador, y su guardia es R30—: las reglas incumplidas son
// datos que la persona necesita para corregir, y por eso viajan en una variante propia del
// estado y no en un `ErrorState`. Es una **excepcion declarada** a la letra de QC-79 R34, no un
// cumplimiento suyo: ver `design.md > 11.3` y la cabecera de `domain/credential-rejected.ts`.
export {
  CredentialConfirmationMismatchError,
  CredentialPolicyRejectedError,
} from './domain/credential-rejected';

// Los esquemas de entrada de las dos mutaciones nuevas (R33) y sus tipos inferidos.
export {
  resendCredentialSetupLinkSchema,
  setCredentialWithLinkSchema,
  type ResendCredentialSetupLinkInput,
  type SetCredentialWithLinkInput,
} from './domain/credential-setup-input';

// Como acabo el correo del alta (R30): `sent`, `failed` —creado igual, con enlace vivo, y QC-67
// ofrece el reenvio— o `not_needed` cuando el administrador escribio la contrasena (R3).
export type { CreateUserMailOutcome, CreateUserResult } from './domain/create-user';

// Las DOS factories de caso de uso nuevas. Los tipos `*Deps` viajan con ellas: quien las cablea
// es `lib/composition`, y sin el tipo no podria declarar la dependencia.
export {
  createSetCredentialWithLink,
  type SetCredentialWithLinkDeps,
} from './domain/set-credential-with-link';
export {
  createIssueCredentialSetupLink,
  type IssueCredentialSetupLinkDeps,
  type IssueCredentialSetupLinkResult,
} from './domain/issue-credential-setup-link';

// ---------------------------------------------------------------------------------------
// QC-84 T10 — Los grupos de trabajo (R44). Bloque NUEVO al final: no reordena ni reformatea
// ninguna de las lineas de arriba.
//
// **Solo simbolos de `./domain`.** En particular NO se reexporta
// `adapters/driving/work-group-actions`: un `'use server'` en el cierre transitivo de este
// contrato lo volveria inimportable desde un componente de cliente. QC-85 importa las siete
// Server Actions por su RUTA EXACTA, igual que QC-67 con las de QC-66 y QC-94.
//
// El PUERTO (`ports/work-group-repository.ts`) y el adaptador driven tampoco salen por aqui:
// los ve solo el punto de composicion, que es el unico sitio que ata puerto -> adaptador.
// ---------------------------------------------------------------------------------------

// Las dos proyecciones de salida (R19, R26): dos claves cada una, y lo que NO llevan -ningun
// dato de credencial, ninguna marca de baja- lo fija el TIPO, no una promesa.
export type { WorkGroupRow, WorkGroupMemberRow } from './domain/work-group-view';

// Los cuatro esquemas del borde (R11, R14, R33) y sus tipos inferidos. Son los MISMOS que
// valida la Server Action y los que -manana- validara el formulario de QC-85: una sola
// definicion de la entrada, no dos que puedan diverger.
export {
  createWorkGroupSchema,
  renameWorkGroupSchema,
  workGroupMemberSchema,
  deleteWorkGroupSchema,
  WORK_GROUP_NAME_MAX_LENGTH,
  type CreateWorkGroupInput,
  type RenameWorkGroupInput,
  type WorkGroupMemberInput,
  type DeleteWorkGroupInput,
} from './domain/work-group-input';

// Las dos listas blancas de campos consultables (R27, R54): QC-85 comprueba contra el
// contrato en vez de contra una copia escrita a mano.
export {
  WORK_GROUP_QUERYABLE,
  WORK_GROUP_MEMBER_QUERYABLE,
} from './domain/work-group-queryable';

// Los SIETE errores nuevos (R43). Se exportan las CLASES, no sus textos: quien decide por el
// `code` -o por la clase- es QC-85, y el mensaje sale del catalogo unico de QC-70. Son tres
// codigos distintos de «ya pertenece pero no se ve» porque «pendiente», «inactiva» y
// «bloqueada» son tres frases y tres acciones distintas para quien las lee (`design.md > 7.2`).
export {
  WorkGroupNotFoundError,
  WorkGroupDuplicateNameError,
  WorkGroupMemberExistsError,
  WorkGroupMemberExistsPendingError,
  WorkGroupMemberExistsInactiveError,
  WorkGroupMemberExistsBlockedError,
  WorkGroupMemberNotFoundError,
} from './domain/errors';

// Las SIETE factories de caso de uso. Los tipos `*Deps` viajan con ellas: quien las cablea es
// `lib/composition`, y sin el tipo no podria declarar la dependencia. `PaginationPolicy` sale
// con `ListWorkGroupMembersDeps` porque el corte de la pagina de miembros vive en el dominio
// -despues del filtro del estado efectivo- y su aritmetica entra inyectada (`design.md > 5.3`).
export { createCreateWorkGroup, type CreateWorkGroupDeps } from './domain/create-work-group';
export { createRenameWorkGroup, type RenameWorkGroupDeps } from './domain/rename-work-group';
export { createDeleteWorkGroup, type DeleteWorkGroupDeps } from './domain/delete-work-group';
export {
  createAddWorkGroupMember,
  type AddWorkGroupMemberDeps,
} from './domain/add-work-group-member';
export {
  createRemoveWorkGroupMember,
  type RemoveWorkGroupMemberDeps,
} from './domain/remove-work-group-member';
export { createListWorkGroups, type ListWorkGroupsDeps } from './domain/list-work-groups';
export {
  createListWorkGroupMembers,
  type ListWorkGroupMembersDeps,
  type PaginationPolicy,
} from './domain/list-work-group-members';

// ---------------------------------------------------------------------------------------
// QC-87 T3 — Los DOS contratos con los que otro modulo pregunta por personas y por grupos de
// trabajo sin tocar `users`, `work_groups` ni `work_group_members` (`design.md > 2.2`).
// Bloque NUEVO al final: no reordena ni reformatea ninguna linea de arriba.
//
// Solo simbolos de `./domain`: son tipos e interfaces puros, asi que el contrato sigue
// importable desde un componente de cliente. El adaptador que los implementa
// (`adapters/driven/persistence/assignment-directory-prisma.ts`) NO sale por aqui: lo ve solo
// `lib/composition`, el unico sitio que ata puerto -> implementacion (R47).
// ---------------------------------------------------------------------------------------
export type { PersonRef, PeopleDirectory, PeopleRefFilters } from './domain/people-directory';
export type { WorkGroupSnapshot, WorkGroupDirectory } from './domain/work-group-directory';

// ---------------------------------------------------------------------------------------
// QC-23 T17 (`design.md > 8`) — los TRES casos de uso del cierre de sesion (R20-R32). Bloque
// NUEVO al final: no reordena ni reformatea ninguna de las lineas de arriba.
//
// Solo simbolos de `./domain`, igual que los bloques anteriores. En particular NO sale por aqui
// nada de `ports/` ni de `adapters/driven/**` -los ve solo `lib/composition`, que es el unico
// que ata puerto -> adaptador- y esta ficha no crea ningun `adapters/driving/**` que reexportar:
// no hay pagina, ruta, componente ni Server Action que la invoque (R51), y eso es de QC-101 y
// QC-53.
//
// Los tipos `*Deps` viajan con las factories: quien las cablea es `lib/composition`, y sin el
// tipo no podria declarar la dependencia.
// ---------------------------------------------------------------------------------------

export { createEndSession, type EndSessionDeps } from './domain/end-session';
export { createEndAllSessions, type EndAllSessionsDeps } from './domain/end-all-sessions';
export {
  createEndOtherSessions,
  type CurrentSession,
  type EndOtherSessionsDeps,
} from './domain/end-other-sessions';
