// lib/composition/index.ts — PUNTO UNICO DE COMPOSICION.
// Aqui, y solo aqui, se elige QUE implementacion concreta cumple cada puerto.
// Prohibido importar adaptadores driving desde aqui: la flecha va driving -> composicion (R12).
import {
  createCredentialPolicy,
  createResolveSession,
  createVerifyCredentials,
  seedInitialAccess,
} from '@/lib/modules/identity';
import { readInitialAdminCredentialsFromEnv } from '@/lib/modules/identity/adapters/driven/config/initial-access-credentials-env';
import { findActiveSessionUserById } from '@/lib/modules/identity/adapters/driven/persistence/session-user-prisma';
import { withInitialAccessTransaction } from '@/lib/modules/identity/adapters/driven/persistence/initial-access-repository-prisma';
import {
  compareAndSetLoginAttempt,
  findActiveByUsername,
  setLoginAttempt,
} from '@/lib/modules/identity/adapters/driven/persistence/user-credentials-prisma';
import { isBreachedCredential } from '@/lib/modules/identity/adapters/driven/security/breached-credential-list';
import {
  createPasswordHash,
  verifyPasswordHash,
} from '@/lib/modules/identity/adapters/driven/security/password-hash';
import {
  clearSession,
  readSessionClaims,
  startSession,
} from '@/lib/modules/identity/adapters/driven/session/session-cookie';
import type { BreachedCredentialList } from '@/lib/modules/identity/ports/breached-credential-list';
import type { LoginAttemptRecorder } from '@/lib/modules/identity/ports/login-attempt-recorder';
import type { PasswordHasher } from '@/lib/modules/identity/ports/password-hasher';
import type { SessionProvider } from '@/lib/modules/identity/ports/session-provider';
import type { SessionReader } from '@/lib/modules/identity/ports/session-reader';
import type { SessionUserReader } from '@/lib/modules/identity/ports/session-user-reader';
import type { SessionWriter } from '@/lib/modules/identity/ports/session-writer';
import type { UserCredentialsReader } from '@/lib/modules/identity/ports/user-credentials-reader';
import {
  createCreatePresentation,
  createCreateProduct,
  createDeletePresentation,
  createDeleteProduct,
  createGetProduct,
  createListPresentations,
  createListProducts,
  createUpdatePresentation,
  createUpdateProduct,
} from '@/lib/modules/inventario';
import { findProductRefs } from '@/lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma';
import {
  addBatchToAlive,
  createProduct,
  createWithFirstBatch,
  findAliveIdByName,
  findAliveProductById,
  listAliveProducts,
  softDeleteAliveProduct,
  updateAliveProduct,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import {
  createPresentation,
  deletePresentationById,
  listPresentations,
  replacePresentation,
} from '@/lib/modules/inventario/adapters/driven/persistence/presentation-prisma';
import type { ListQueryLog } from '@/lib/modules/inventario/ports/list-query-log';
import type { PresentationRepository } from '@/lib/modules/inventario/ports/presentation-repository';
import type { ProductRepository } from '@/lib/modules/inventario/ports/product-repository';
import type { ProductCatalog } from '@/lib/modules/inventario';
import { logIgnoredListQueryFields } from '@/lib/shared/observability/list-query-log';
import { findUnitRefs } from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma';
import {
  listUnits,
  listUnitsPage,
} from '@/lib/modules/unidades/adapters/driven/persistence/unit-prisma';
import {
  create as createUnitRow,
  deleteById as deleteUnitById,
  findOwnership as findUnitOwnership,
  hasDerivedUnits,
  update as updateUnitRow,
} from '@/lib/modules/unidades/adapters/driven/persistence/unit-write-prisma';
import type { ListQueryLog as UnidadesListQueryLog } from '@/lib/modules/unidades/ports/list-query-log';
import type { UnitRepository } from '@/lib/modules/unidades/ports/unit-repository';
import type { UnitWriteRepository } from '@/lib/modules/unidades/ports/unit-write-repository';
import {
  createCreateUnit,
  createDeleteUnit,
  createListUnits,
  createUpdateUnit,
  type UnitCatalog,
} from '@/lib/modules/unidades';
import {
  createCreateRecipe,
  createDeleteRecipe,
  createGetRecipe,
  createListRecipes,
  createUpdateRecipe,
} from '@/lib/modules/recetas';
import {
  createRecipe,
  findAliveRecipeById,
  listAliveRecipes,
  replaceAliveRecipe,
  softDeleteAliveRecipe,
} from '@/lib/modules/recetas/adapters/driven/persistence/recipe-prisma';
import {
  recipeImagePublicUrl,
  removeRecipeImage,
  uploadRecipeImage,
} from '@/lib/modules/recetas/adapters/driven/storage/recipe-image-supabase';
import type { ListQueryLog as RecetasListQueryLog } from '@/lib/modules/recetas/ports/list-query-log';
import type { RecipeImageStorage } from '@/lib/modules/recetas/ports/recipe-image-storage';
import type { RecipeRepository } from '@/lib/modules/recetas/ports/recipe-repository';
import {
  createCreateCatalogLine,
  createCreateSupplier,
  createDeleteCatalogLine,
  createDeleteSupplier,
  createGetSupplier,
  createListCatalogLines,
  createListSuppliers,
  createUpdateCatalogLine,
  createUpdateSupplier,
} from '@/lib/modules/proveedores';
import {
  createSupplier,
  findAliveSupplierById,
  listAliveSuppliers,
  softDeleteAliveSupplier,
  updateAliveSupplier,
} from '@/lib/modules/proveedores/adapters/driven/persistence/supplier-prisma';
import {
  createCatalogLine,
  listCatalogLinesBySupplierAlive,
  replaceAliveCatalogLine,
  softDeleteAliveCatalogLine,
} from '@/lib/modules/proveedores/adapters/driven/persistence/supplier-catalog-line-prisma';
import type { ListQueryLog as ProveedoresListQueryLog } from '@/lib/modules/proveedores/ports/list-query-log';
import type { SupplierCatalogRepository } from '@/lib/modules/proveedores/ports/supplier-catalog-repository';
import type { SupplierRepository } from '@/lib/modules/proveedores/ports/supplier-repository';
import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';
import {
  createCancelOrder,
  createCreateOrder,
  createDeleteOrder,
  createGetOrder,
  createListOrders,
  createUpdateOrder,
} from '@/lib/modules/pedidos';
import {
  cancelAliveOrder,
  createOrder,
  findAliveOrderById,
  listAliveOrders,
  softDeleteAliveOrder,
  updateAliveOrder,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma';
import type { ListQueryLog as PedidosListQueryLog } from '@/lib/modules/pedidos/ports/list-query-log';
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository';
import { findRecipeRefsIncludingDeleted } from '@/lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import { readRequestIdHeader } from '@/lib/modules/observabilidad/adapters/driven/request-id-headers';
import type { RequestIdHeaderReader } from '@/lib/modules/errores';
// QC-66 T15 — la administracion de usuarios. Las SEIS factories salen del CONTRATO del modulo
// (`@/lib/modules/identity`, solo dominio) y los dos puertos que cablean, de `ports/`; el adaptador
// driving de T14 NO se importa desde aqui (la flecha va driving -> composicion).
import {
  createCreateUser,
  createDeleteUser,
  createGetUser,
  createListUsers,
  createSetUserAccountStatus,
  createUpdateUser,
} from '@/lib/modules/identity';
import {
  applyGuardedChange,
  create as createUserRow,
  findAliveInCompany,
  listAliveInCompany,
  updateAliveInCompany,
} from '@/lib/modules/identity/adapters/driven/persistence/user-admin-prisma';
import type { ListQueryLog as IdentityListQueryLog } from '@/lib/modules/identity/ports/list-query-log';
import type { UserAdminRepository } from '@/lib/modules/identity/ports/user-admin-repository';
// QC-79 T17 (`design.md > 9.2`) — los tres puertos nuevos del enlace de credencial. Se importa
// SOLO dominio del barrel y adaptadores por su ruta exacta, igual que el bloque de QC-66 de
// arriba; las dos Server Actions de T18 NO se importan aqui (la flecha va driving -> composicion).
import {
  createIssueCredentialSetupLink,
  createSetCredentialWithLink,
} from '@/lib/modules/identity';
import { readMailTransportFromEnv } from '@/lib/modules/identity/adapters/driven/config/mail-config-env';
import { sendCredentialSetupLink as sendCredentialSetupLinkToOutbox } from '@/lib/modules/identity/adapters/driven/mail/credential-setup-mailer-outbox';
import { sendCredentialSetupLink as sendCredentialSetupLinkWithResend } from '@/lib/modules/identity/adapters/driven/mail/credential-setup-mailer-resend';
import {
  applyCredentialAndActivate,
  issueForPendingUser,
} from '@/lib/modules/identity/adapters/driven/persistence/credential-setup-link-prisma';
import { credentialSetupSecretCrypto } from '@/lib/modules/identity/adapters/driven/security/credential-setup-secret-crypto';
import type { CredentialSetupLinkRepository } from '@/lib/modules/identity/ports/credential-setup-link-repository';
import type { CredentialSetupMailer } from '@/lib/modules/identity/ports/credential-setup-mailer';
import type { CredentialSetupSecretFactory } from '@/lib/modules/identity/ports/credential-setup-secret-factory';
// QC-94 T8 — la consulta del catalogo de roles. La factory sale del CONTRATO del modulo
// (`@/lib/modules/identity`, solo dominio), el puerto de `ports/` y la implementacion del adaptador
// driven; el adaptador driving de T9 NO se importa desde aqui (la flecha va driving -> composicion).
import { createListRoles } from '@/lib/modules/identity';
import { listAllRoles } from '@/lib/modules/identity/adapters/driven/persistence/role-catalog-prisma';
import type { RoleCatalogRepository } from '@/lib/modules/identity/ports/role-catalog-repository';
// QC-84 T10 — los grupos de trabajo. Las SIETE factories salen del CONTRATO del modulo
// (`@/lib/modules/identity`, solo dominio), el puerto de `ports/` y la implementacion del adaptador
// driven; el adaptador driving de T9 NO se importa desde aqui (la flecha va driving -> composicion).
// `listAliveInCompany` llega RENOMBRADA porque el adaptador la exporta con el nombre del metodo del
// puerto y ese nombre ya lo ocupa el listado de usuarios, unas lineas mas arriba.
import {
  createAddWorkGroupMember,
  createCreateWorkGroup,
  createDeleteWorkGroup,
  createListWorkGroupMembers,
  createListWorkGroups,
  createRemoveWorkGroupMember,
  createRenameWorkGroup,
} from '@/lib/modules/identity';
import {
  addMemberAliveInCompany,
  createInCompany,
  listAliveInCompany as listWorkGroupsAliveInCompany,
  listMembersAliveInCompany,
  removeMemberAliveInCompany,
  renameAliveInCompany,
  softDeleteAliveInCompany,
} from '@/lib/modules/identity/adapters/driven/persistence/work-group-prisma';
import type { PaginationPolicy } from '@/lib/modules/identity';
import type { WorkGroupRepository } from '@/lib/modules/identity/ports/work-group-repository';
// QC-87 T11 (`design.md > 2.3`) — asignar responsables a un pedido. Las CUATRO factories salen del
// CONTRATO del modulo (`@/lib/modules/asignaciones`, solo dominio); los TRES adaptadores driven
// nuevos, por su ruta exacta —el de `pedidos`, el de `identity` y el propio de `asignaciones`—, y
// los tipos de los cuatro puertos, de los barriles de sus modulos y de `ports/`. Las Server
// Actions de T12 NO se importan aqui (la flecha va driving -> composicion).
import {
  createAssignResponsibles,
  createListOrderResponsibles,
  createRemoveWorkGroupFromOrder,
  createUnassignResponsible,
} from '@/lib/modules/asignaciones';
import { createOrderAssignmentRepository } from '@/lib/modules/asignaciones/adapters/driven/persistence/order-assignment-prisma';
import type { OrderAssignmentRepository } from '@/lib/modules/asignaciones/ports/order-assignment-repository';
import { findAliveOrderTargetById } from '@/lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma';
import type { OrderCatalog } from '@/lib/modules/pedidos';
import { assignmentDirectoryPrisma } from '@/lib/modules/identity/adapters/driven/persistence/assignment-directory-prisma';
import type { PeopleDirectory, WorkGroupDirectory } from '@/lib/modules/identity';

const breachedCredentialList: BreachedCredentialList = { includes: isBreachedCredential };
// QC-19: una sola instancia de la politica, la misma que se expone en la fachada y la que
// recibe el seed (R18). Dos instancias serian dos cableados que pueden divergir.
const checkCredentialPolicy = createCredentialPolicy({ breached: breachedCredentialList });
const passwordHasher: PasswordHasher = { hash: createPasswordHash, verify: verifyPasswordHash };
const userCredentialsReader: UserCredentialsReader = { findActiveByUsername };
const loginAttemptRecorder: LoginAttemptRecorder = {
  compareAndSet: compareAndSetLoginAttempt,
  set: setLoginAttempt,
};
const sessionWriter: SessionWriter = { startSession };
const sessionReader: SessionReader = { readClaims: readSessionClaims };
const sessionUserReader: SessionUserReader = { findActiveById: findActiveSessionUserById };
// QC-48 (T8, `design.md > 6`): UNA SOLA instancia de la cadena de cortes, y de ella salen las DOS
// salidas. Dos construcciones serian dos cableados que pueden divergir —mismo criterio que
// `checkCredentialPolicy` en QC-19— y con ellos dos definiciones de «hay sesion», que es
// justamente lo que R21 prohibe.
const resolveSession = createResolveSession({ session: sessionReader, users: sessionUserReader });
const sessionProvider: SessionProvider = {
  getSessionUser: async () => (await resolveSession())?.user ?? null,
  // R19: `null` en exactamente los mismos casos que `getSessionUser`, por construccion.
  getSessionContext: async () => (await resolveSession())?.context ?? null,
  endSession: clearSession,
};

// ---------------------------------------------------------------------------------------
// QC-66 T15 (`design.md > 11`) — el cableado de la administracion de usuarios. Va AQUI, y no
// en un bloque al final del archivo, por una razon de ejecucion y no de gusto: el objeto
// `identity` de abajo se evalua en su propia linea, asi que una constante declarada despues
// estaria en su zona muerta. No se reordena ni se reformatea NADA de lo de arriba ni de lo de
// abajo: esto se inserta entero entre dos bloques existentes.
// ---------------------------------------------------------------------------------------

/** QC-57 (T7, R6): la MISMA implementacion unica de `lib/shared/observability/list-query-log.ts`
 *  que cablean los otros cinco modulos con listado, vista por el puerto que declara `identity`.
 *  Seis puertos con la misma forma, una sola implementacion. */
const identityListQueryLog: IdentityListQueryLog = { ignoredFields: logIgnoredListQueryFields };

/** `UserAdminRepository` cableado con el adaptador driven de `identity` (`design.md > 11`): los
 *  seis casos de uso solo conocen el TIPO, nunca esta implementacion. `create` llega renombrada
 *  porque el adaptador la exporta con el nombre del metodo del puerto. */
const userAdminRepository: UserAdminRepository = {
  create: createUserRow,
  findAliveInCompany,
  listAliveInCompany,
  updateAliveInCompany,
  applyGuardedChange,
};

/**
 * AQUI VIVIA el cableado de `InitialCredentialFactory` (QC-66 R15): la fabrica que generaba una
 * contrasena al azar y devolvia SOLO su hash.
 *
 * **QC-79 R4 lo deja sin ningun consumidor**, con esas palabras y no disimulado: el alta ya no
 * genera ninguna contrasena al azar, y el seed de QC-6 nunca uso esta fabrica -usa
 * `readInitialAdminCredentialsFromEnv`, ahi abajo en `seedInitialAccess`-. Un cableado que no ata
 * ningun puerto a ningun caso de uso es codigo muerto, y dejarlo declarado solo servia para que
 * `eslint` avisara de el en cada corrida.
 *
 * **Lo que NO se ha borrado, a proposito**: el puerto
 * (`ports/initial-credential-factory.ts`), el adaptador
 * (`adapters/driven/security/initial-credential-factory-crypto.ts`) y sus tests
 * (`tests/unit/identity/usuarios/credential-factory.test.ts`) siguen enteros. QC-89 -restablecer
 * la contrasena de OTRA persona- es quien previsiblemente los necesita, y volver a atarlos es
 * reescribir estas cuatro lineas.
 */

// ---------------------------------------------------------------------------------------
// QC-79 T17 (R26, R32) — el enlace con el que una persona establece su contrasena la primera
// vez. Tres puertos, tres adaptadores, y NINGUNA decision de negocio en este archivo.
//
// `passwordHasher` y `checkCredentialPolicy` se REUTILIZAN de arriba —los de QC-5 y QC-19—: no
// se construye un segundo hasher ni una segunda politica. Dos politicas serian exactamente la
// «puerta lateral» que R23 prohibe, y dos hashers, dos costes de bcrypt que pueden divergir.
// ---------------------------------------------------------------------------------------

/** R9, R10: el secreto del enlace (`randomBytes(32)` + base64url) y su huella (SHA-256 hex). El
 *  dominio solo conoce el TIPO; el secreto en claro no existe fuera del adaptador y del correo. */
const credentialSetupSecrets: CredentialSetupSecretFactory = credentialSetupSecretCrypto;

/** R11, R12, R19, R20, R22: las dos transacciones de `design.md > 4.5` y `> 4.6`. El dominio
 *  nunca ve una transaccion: pide una operacion y traduce el resultado discriminado. */
const credentialSetupLinkRepository: CredentialSetupLinkRepository = {
  issueForPendingUser,
  applyCredentialAndActivate,
};

/**
 * R26, R28 y `design.md > 9.2` — EL TRANSPORTE SE ELIGE EN LA INVOCACION, no al importar este
 * modulo. Si `readMailTransportFromEnv()` se llamara aqui fuera, la suite entera —que importa
 * `lib/composition` para cualquier cosa— necesitaria la configuracion de correo para arrancar, y
 * un valor equivocado tumbaria tests que no tienen nada que ver con el correo.
 *
 * `resend` es el valor POR DEFECTO (sin la variable, el transporte real); `outbox` es el buzon en
 * disco que hace posible el E2E de R41 y que se niega a arrancar en produccion. Los dos cumplen el
 * MISMO puerto, asi que cambiar de uno a otro es esta linea y nada mas.
 */
const credentialSetupMailer: CredentialSetupMailer = {
  sendCredentialSetupLink: (input) =>
    readMailTransportFromEnv() === 'outbox'
      ? sendCredentialSetupLinkToOutbox(input)
      : sendCredentialSetupLinkWithResend(input),
};

/**
 * QC-94 T8 (`design.md > 5`) — `RoleCatalogRepository` cableado con el adaptador driven de
 * `identity`. UN solo metodo y de SOLO LECTURA: el caso de uso solo conoce el TIPO, nunca esta
 * implementacion, y escribir un rol no es expresable a traves de este puerto (R17).
 */
const roleCatalogRepository: RoleCatalogRepository = { listAll: listAllRoles };

/**
 * QC-84 T10 (`design.md > 5`) — `WorkGroupRepository` cableado con el adaptador driven de
 * `identity`. Los siete casos de uso solo conocen el TIPO, nunca esta implementacion: es la unica
 * forma de que `company_id` y `deleted_at IS NULL` (R8, R9) vivan en un solo sitio.
 */
const workGroupRepository: WorkGroupRepository = {
  createInCompany,
  renameAliveInCompany,
  softDeleteAliveInCompany,
  listAliveInCompany: listWorkGroupsAliveInCompany,
  listMembersAliveInCompany,
  addMemberAliveInCompany,
  removeMemberAliveInCompany,
};

/**
 * QC-84 T10 (`design.md > 5.3`) — la aritmetica de paginacion de la lista de MIEMBROS, inyectada
 * REAL desde `lib/shared/pagination`: el mismo defecto de 10 y el mismo tope de 25 que usa el
 * resto de la aplicacion (R51).
 *
 * Entra por `deps` y no se importa desde el dominio porque `domain/` no puede ver `lib/shared/**`,
 * y el corte de esa pagina tiene que vivir en el dominio —DESPUES del filtro del estado efectivo—
 * o el total prometeria personas que la pantalla nunca muestra (R52). Mismo reparto que
 * `recetas.listRecipes` unas lineas mas abajo; el listado de GRUPOS, en cambio, sigue paginando en
 * SQL dentro del adaptador, porque su filtro si es expresable en el `WHERE`.
 */
const workGroupMemberPagination: PaginationPolicy = { toOffsetLimit, buildPage };

/** Fachada del modulo `identity` ya cableada. Es lo que consumen acciones, rutas y layouts. */
export const identity = {
  // La clave conserva nombre y firma: por eso `login-action.ts` no cambia (R16).
  verifyCredentials: createVerifyCredentials({
    users: userCredentialsReader,
    attempts: loginAttemptRecorder,
    hasher: passwordHasher,
    session: sessionWriter,
  }),
  passwordHasher,
  ...sessionProvider,
  // QC-6: siembra roles y usuario inicial. Invocable como `identity.seedInitialAccess()`,
  // sin argumentos: el repositorio, el hasher y el proveedor de credenciales ya estan
  // cableados aqui (`design.md > 5`). Solo lo consume `scripts/seed.ts`.
  // La invocacion corre dentro de `withInitialAccessTransaction`: es lo que hace cierto
  // R13 (`design.md > 5.2`, "los pasos 4 y 5 corren dentro de una unica
  // `prisma.$transaction`"). Si el alta del usuario falla, los roles creados en la misma
  // corrida tampoco quedan comiteados.
  // QC-19: la politica de credenciales, ya cableada con la lista de filtradas. Quien fija
  // o cambia una contrasena la llama ANTES de hashear (`design.md > 7`).
  checkCredentialPolicy,
  seedInitialAccess: () =>
    withInitialAccessTransaction((repository) =>
      seedInitialAccess({
        repository,
        passwordHasher,
        credentials: readInitialAdminCredentialsFromEnv,
        // R18: el seed evalua la politica antes de hashear; aqui se le entrega la misma
        // funcion que expone la fachada.
        checkCredentialPolicy,
      }),
    ),
  // QC-66 T15 (`design.md > 11`) — los SEIS casos de uso de la administracion de usuarios, ya
  // cableados. Claves NUEVAS al final del objeto: ninguna de las de arriba se toca.
  //
  // El ACTOR NO se resuelve aqui, mismo criterio que los otros cinco modulos (R5): cada caso de
  // uso lo recibe por parametro, y quien lo construye con las dos caras de la sesion
  // -`getSessionUser` y `getSessionContext`, arriba en este mismo objeto- es la Server Action de
  // T14 (R6). `lib/composition` no conoce cookies ni sesion; solo ata puerto -> adaptador.
  // QC-79 T17 (R4): el alta YA NO recibe `credentials: initialCredentialFactory`. No se genera
  // ninguna contrasena al azar —eso ENMIENDA QC-66 R15—; con contrasena escrita se evalua la
  // politica y se hashea, y sin ella se emite el enlace y se intenta enviarlo.
  // El puerto `InitialCredentialFactory` y su adaptador siguen existiendo -los necesitara
  // QC-89-, pero su CABLEADO se retira aqui: ver el bloque de arriba.
  createUser: createCreateUser({
    users: userAdminRepository,
    checkCredentialPolicy,
    passwordHasher,
    secrets: credentialSetupSecrets,
    links: credentialSetupLinkRepository,
    mailer: credentialSetupMailer,
  }),
  getUser: createGetUser({ users: userAdminRepository }),
  listUsers: createListUsers({ users: userAdminRepository, log: identityListQueryLog }),
  updateUser: createUpdateUser({ users: userAdminRepository }),
  deleteUser: createDeleteUser({ users: userAdminRepository }),
  setUserAccountStatus: createSetUserAccountStatus({ users: userAdminRepository }),
  // QC-79 T17 — las DOS factories nuevas, en claves NUEVAS al final: ninguna de las de arriba se
  // toca. El ACTOR tampoco se resuelve aqui —el reenvio lo recibe por parametro de la Server
  // Action de T18 (R14)— y el caso de uso publico NO TIENE actor, que es R18 escrito en su firma.
  setCredentialWithLink: createSetCredentialWithLink({
    checkCredentialPolicy,
    passwordHasher,
    secrets: credentialSetupSecrets,
    links: credentialSetupLinkRepository,
  }),
  issueCredentialSetupLink: createIssueCredentialSetupLink({
    secrets: credentialSetupSecrets,
    links: credentialSetupLinkRepository,
    mailer: credentialSetupMailer,
  }),
  // QC-94 T8 (`design.md > 5`) — la consulta del catalogo de roles, la pieza que le falta a QC-67
  // para pintar el selector. Clave NUEVA al FINAL del objeto: ninguna de las de arriba se toca.
  //
  // El ACTOR tampoco se resuelve aqui (R5): lo construye la Server Action de T9 con las dos caras
  // de la sesion. Y no se le pasa ninguna empresa: el catalogo es GLOBAL (R11).
  listRoles: createListRoles({ roles: roleCatalogRepository }),
  // QC-84 T10 (`design.md > 8`) — los SIETE casos de uso de los grupos de trabajo, ya cableados.
  // Claves NUEVAS al FINAL del objeto: ninguna de las de arriba se toca.
  //
  // El ACTOR tampoco se resuelve aqui (R5): lo construye la Server Action de T9 con las dos caras
  // de la sesion. Y la EMPRESA no se pasa a ninguna: la lleva el actor y la aplica el puerto (R8).
  createWorkGroup: createCreateWorkGroup({ workGroups: workGroupRepository }),
  renameWorkGroup: createRenameWorkGroup({ workGroups: workGroupRepository }),
  deleteWorkGroup: createDeleteWorkGroup({ workGroups: workGroupRepository }),
  addWorkGroupMember: createAddWorkGroupMember({ workGroups: workGroupRepository }),
  removeWorkGroupMember: createRemoveWorkGroupMember({ workGroups: workGroupRepository }),
  listWorkGroups: createListWorkGroups({
    workGroups: workGroupRepository,
    log: identityListQueryLog,
  }),
  // La paginacion entra por `deps` y el `now` del filtro por parametro en cada llamada: el dominio
  // no tiene reloj propio ni puede importar `lib/shared/**`.
  listWorkGroupMembers: createListWorkGroupMembers({
    workGroups: workGroupRepository,
    pagination: workGroupMemberPagination,
    log: identityListQueryLog,
  }),
} as const;

/**
 * QC-57 (T7, R6): UNICA implementacion del puerto `ListQueryLog`, la de
 * `lib/shared/observability/list-query-log.ts`. El puerto esta declarado en los cinco modulos
 * con listado -el dominio no puede importar `lib/shared/**`-; aqui, que si puede, se ata puerto
 * -> implementacion, que es lo unico que hace este archivo.
 *
 * Se tipa con el puerto de `inventario` porque es el modulo que lo consume en esta linea; los
 * otros cuatro modulos declaran el suyo con la MISMA forma y cablean la MISMA funcion.
 */
const inventarioListQueryLog: ListQueryLog = { ignoredFields: logIgnoredListQueryFields };

const productRepository: ProductRepository = {
  create: createProduct,
  findAliveById: findAliveProductById,
  updateAlive: updateAliveProduct,
  softDeleteAlive: softDeleteAliveProduct,
  listAlive: listAliveProducts,
  // QC-90 (T7, `design.md > 7`): las tres del alta con su primer lote. Nada mas cambia aqui
  // -`createProduct: createCreateProduct({ products: productRepository })` sigue igual-,
  // porque el alta que ya existia es la MISMA que ahora escribe el lote (`design.md > 10 C`).
  findAliveIdByName,
  createWithFirstBatch,
  addBatchToAlive,
};

const presentationRepository: PresentationRepository = {
  create: createPresentation,
  replace: replacePresentation,
  deleteById: deletePresentationById,
  list: listPresentations,
};

/**
 * Fachada del modulo `inventario` ya cableada (T11, `design.md > 3`, `> 7`). Es lo que
 * consumen las Server Actions de T12.
 *
 * El ACTOR NO se resuelve aqui: cada caso de uso lo recibe por parametro (R1, D17). Quien
 * lo obtiene es la Server Action, pidiendolo al contrato ya cableado de `identity`
 * (`identity.getSessionUser()`, arriba en este mismo archivo) y construyendo
 * `{ id, roleName }` con lo que devuelve `SessionUser`. `lib/composition` no conoce
 * cookies ni sesion; solo ata puerto -> adaptador.
 */
export const inventario = {
  createProduct: createCreateProduct({ products: productRepository }),
  updateProduct: createUpdateProduct({ products: productRepository }),
  deleteProduct: createDeleteProduct({ products: productRepository }),
  getProduct: createGetProduct({ products: productRepository }),
  listProducts: createListProducts({ products: productRepository, log: inventarioListQueryLog }),
  createPresentation: createCreatePresentation({ presentations: presentationRepository }),
  updatePresentation: createUpdatePresentation({ presentations: presentationRepository }),
  deletePresentation: createDeletePresentation({ presentations: presentationRepository }),
  listPresentations: createListPresentations({
    presentations: presentationRepository,
    log: inventarioListQueryLog,
  }),
} as const;

// El modulo `unidades` (QC-32) siembra su catalogo con su propia migracion. `recetas`
// (QC-25) es el primer CONSUMIDOR de `UnitCatalog`: implementa el adaptador driven
// (`lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma.ts`) y lo
// cablea aqui, mas abajo, para sus casos de uso de alta y edicion (R50).

// ---------------------------------------------------------------------------------------
// `recetas` (QC-25, T12). Bloque nuevo, separado a proposito: no reordena ni reformatea
// nada de `identity` ni de `inventario` arriba -diff minimo, hay otra sesion (QC-22)
// tocando este mismo archivo en paralelo-.
// ---------------------------------------------------------------------------------------

/** `ProductCatalog` cableado con el adaptador driven DE INVENTARIO (`design.md > 6`):
 *  es el hueco que QC-24 dejo abierto en el contrato publico de `inventario` y que T9
 *  llena. `recetas` solo conoce el TIPO `ProductCatalog`, nunca esta implementacion. */
const productCatalog: ProductCatalog = { findRefs: findProductRefs };

/** `UnitCatalog` cableado con el adaptador driven DE UNIDADES (R50): `recetas` solo
 *  conoce el TIPO `UnitCatalog`, nunca esta implementacion. */
const unitCatalog: UnitCatalog = { findRefs: findUnitRefs };

const recipeRepository: RecipeRepository = {
  create: createRecipe,
  findAliveById: findAliveRecipeById,
  listAlive: listAliveRecipes,
  replaceAlive: replaceAliveRecipe,
  softDeleteAlive: softDeleteAliveRecipe,
};

/** `RecipeImageStorage` cableado con el adaptador de Supabase Storage (T11). Ninguna de
 *  sus tres funciones se INVOCA aqui -solo se referencian-, asi que construir esta
 *  fachada no lee ninguna variable de entorno ni toca la red (R43): el adaptador solo
 *  lee su configuracion cuando el caso de uso llama de verdad a `upload`/`remove`/
 *  `publicUrl`. */
const recipeImageStorage: RecipeImageStorage = {
  upload: uploadRecipeImage,
  remove: removeRecipeImage,
  publicUrl: recipeImagePublicUrl,
};

/** QC-57 (T7, R6): el MISMO `logIgnoredListQueryFields` que `inventario`, visto por el puerto
 *  que declara `recetas`. Cinco puertos con la misma forma, una sola implementacion. */
const recetasListQueryLog: RecetasListQueryLog = { ignoredFields: logIgnoredListQueryFields };

/**
 * Fachada del modulo `recetas` ya cableada (T12, `design.md > 3`, `> 11`). Es lo que
 * consume la Server Action de T13.
 *
 * `toOffsetLimit`/`buildPage` se inyectan aqui, REALES, importados de
 * `lib/shared/pagination` (R31): `list-recipes.ts` no puede importar `lib/shared/**`
 * desde `domain/` (R40), asi que recibe la aritmetica de paginacion como dependencia, y
 * este es el unico sitio que puede darsela.
 *
 * El ACTOR NO se resuelve aqui, mismo criterio que `inventario` arriba (R1, D17): cada
 * caso de uso lo recibe por parametro, y quien lo obtiene es la Server Action.
 */
export const recetas = {
  createRecipe: createCreateRecipe({
    recipes: recipeRepository,
    products: productCatalog,
    units: unitCatalog,
    images: recipeImageStorage,
  }),
  getRecipe: createGetRecipe({ recipes: recipeRepository, products: productCatalog, images: recipeImageStorage }),
  listRecipes: createListRecipes({
    recipes: recipeRepository,
    images: recipeImageStorage,
    log: recetasListQueryLog,
    toOffsetLimit,
    buildPage,
  }),
  updateRecipe: createUpdateRecipe({
    recipes: recipeRepository,
    products: productCatalog,
    units: unitCatalog,
    images: recipeImageStorage,
  }),
  deleteRecipe: createDeleteRecipe({ recipes: recipeRepository }),
} as const;

// ---------------------------------------------------------------------------------------
// `proveedores` (QC-43, T13). Bloque NUEVO al final, igual criterio que el de `recetas`:
// no reordena ni reformatea nada de lo de arriba -diff minimo, hay otras sesiones tocando
// este archivo-. Sus imports viven al final del bloque de imports, arriba.
//
// `productCatalog` NO se vuelve a construir: se REUTILIZA la constante que QC-25 ya dejo
// cableada mas arriba (`design.md > 10`). Dos instancias del mismo puerto serian dos
// cableados que pueden divergir.
// ---------------------------------------------------------------------------------------

/** QC-57 (T7, R6): la MISMA implementacion de `lib/shared/observability`, tipada con el puerto
 *  que declara `proveedores`. Los cinco modulos declaran el suyo con la misma forma y cablean
 *  esta misma funcion; este archivo es el unico sitio donde puerto e implementacion se atan. */
const proveedoresListQueryLog: ProveedoresListQueryLog = {
  ignoredFields: logIgnoredListQueryFields,
};

const supplierRepository: SupplierRepository = {
  create: createSupplier,
  findAliveById: findAliveSupplierById,
  updateAlive: updateAliveSupplier,
  softDeleteAlive: softDeleteAliveSupplier,
  listAlive: listAliveSuppliers,
};

const supplierCatalogRepository: SupplierCatalogRepository = {
  create: createCatalogLine,
  replaceAlive: replaceAliveCatalogLine,
  softDeleteAlive: softDeleteAliveCatalogLine,
  listBySupplierAlive: listCatalogLinesBySupplierAlive,
};

/**
 * Fachada del modulo `proveedores` ya cableada (T13, `design.md > 10`). Es lo que consumen
 * las dos Server Actions de T14.
 *
 * El ACTOR NO se resuelve aqui, mismo criterio que `inventario` y `recetas`: cada caso de
 * uso lo recibe por parametro y quien lo obtiene de `identity.getSessionUser()` es la
 * Server Action (R5, decision cerrada 11).
 *
 * La paginacion tampoco se inyecta: a diferencia de `recetas`, el adaptador driven de
 * `proveedores` usa `toOffsetLimit`/`buildPage` directamente (R45, `design.md > 8`), asi
 * que el dominio no necesita recibirla.
 */
export const proveedores = {
  createSupplier: createCreateSupplier({ suppliers: supplierRepository }),
  updateSupplier: createUpdateSupplier({ suppliers: supplierRepository }),
  deleteSupplier: createDeleteSupplier({ suppliers: supplierRepository }),
  getSupplier: createGetSupplier({ suppliers: supplierRepository }),
  listSuppliers: createListSuppliers({
    suppliers: supplierRepository,
    log: proveedoresListQueryLog,
  }),
  // QC-52 (R18, decision cerrada 3): las dos factories del catalogo PIERDEN
  // `products: productCatalog`. `proveedores` ya no conoce `inventario` por ninguna via, y
  // este archivo es el unico sitio desde el que podria volver a atarlas.
  //
  // `productCatalog` NO se borra ni se toca: sigue arriba, cableado, porque `recetas` lo
  // usa en tres de sus casos de uso. Lo que desaparece son las dos lineas que se lo
  // pasaban a `proveedores`.
  createCatalogLine: createCreateCatalogLine({ catalog: supplierCatalogRepository }),
  updateCatalogLine: createUpdateCatalogLine({ catalog: supplierCatalogRepository }),
  deleteCatalogLine: createDeleteCatalogLine({ catalog: supplierCatalogRepository }),
  listCatalogLines: createListCatalogLines({
    catalog: supplierCatalogRepository,
    log: proveedoresListQueryLog,
  }),
};

// ---------------------------------------------------------------------------------------
// `unidades` (QC-26, T6). Bloque nuevo, separado a proposito: no reordena ni reformatea
// nada de lo existente arriba -diff minimo, hay otras sesiones tocando este mismo
// archivo en paralelo-.
// ---------------------------------------------------------------------------------------

/** `UnitRepository` cableado con el adaptador driven DE UNIDADES (`design.md > 9`,
 *  R40): el caso de uso de listado solo conoce el TIPO `UnitRepository`, nunca esta
 *  implementacion. */
const unitRepository: UnitRepository = { listAll: listUnits, listPage: listUnitsPage };

/** QC-57 (T7, R6): la misma implementacion unica del log, vista por el puerto de `unidades`. */
const unidadesListQueryLog: UnidadesListQueryLog = { ignoredFields: logIgnoredListQueryFields };

/** `UnitWriteRepository` cableado con el adaptador driven DE UNIDADES (QC-38, `design.md > 8`):
 *  los tres casos de uso de escritura solo conocen el TIPO `UnitWriteRepository`, nunca esta
 *  implementacion. */
const unitWriteRepository: UnitWriteRepository = {
  findOwnership: findUnitOwnership,
  hasDerivedUnits,
  create: createUnitRow,
  update: updateUnitRow,
  deleteById: deleteUnitById,
};

/** Fachada del modulo `unidades` ya cableada (R40-R42, y QC-38 R6, R7, R11-R26 para las tres
 *  fabricas nuevas). Es lo que consumen las cuatro Server Actions de
 *  `adapters/driving/unit-actions.ts`. */
export const unidades = {
  listUnits: createListUnits({ units: unitRepository, log: unidadesListQueryLog }),
  createUnit: createCreateUnit({ units: unitWriteRepository }),
  updateUnit: createUpdateUnit({ units: unitWriteRepository }),
  deleteUnit: createDeleteUnit({ units: unitWriteRepository }),
} as const;


// ---------------------------------------------------------------------------------------
// `pedidos` (QC-34, T14, `design.md > 9`). Bloque NUEVO al final, mismo criterio que los de
// `recetas`, `proveedores` y `unidades`: no reordena ni reformatea NADA de lo de arriba
// -diff minimo, hay varias sesiones tocando este archivo-. Sus imports viven al final del
// bloque de imports, arriba.
//
// QC-35bis (2026-09-07): este bloque REUTILIZABA `unitCatalog` -la constante que QC-25 dejo
// cableada mas arriba- para los cuatro casos de uso de pedido que tocaban la unidad. Al salir la
// unidad del pedido, `pedidos` dejo de necesitarlo: ninguno de sus seis casos de uso recibe ya el
// catalogo de `unidades`. La constante sigue viva mas arriba, para `recetas`, que si la usa.
// ---------------------------------------------------------------------------------------

/** `RecipeCatalog` cableado con el adaptador driven DE RECETAS (`design.md > 6.2`, R43,
 *  R44): `recetas` es el UNICO autorizado a consultar `prisma.recipe`, y `pedidos` solo
 *  conoce el TIPO. Es el hueco que QC-33 R32 previo -«todo lo que sepa de una receta le
 *  llegue por los contratos publicos, que DEBEN publicarlo»- y que QC-34 llena.
 *
 *  `findRefsIncludingDeleted`, y no una consulta de solo vivas, porque un pedido conserva su
 *  receta aunque la den de baja y la fila tiene que seguir diciendo que se pidio (R44). */
const recipeCatalog: RecipeCatalog = { findRefsIncludingDeleted: findRecipeRefsIncludingDeleted };

/** QC-57 (T7, R6): misma implementacion, tipada con el puerto que declara `pedidos`. */
const pedidosListQueryLog: PedidosListQueryLog = { ignoredFields: logIgnoredListQueryFields };

const orderRepository: OrderRepository = {
  create: createOrder,
  findAliveById: findAliveOrderById,
  listAlive: listAliveOrders,
  updateAlive: updateAliveOrder,
  cancelAlive: cancelAliveOrder,
  softDeleteAlive: softDeleteAliveOrder,
};

/**
 * Fachada del modulo `pedidos` ya cableada (T14, `design.md > 9`). Es lo que consumen las
 * Server Actions de T15.
 *
 * El ACTOR NO se resuelve aqui, mismo criterio que `inventario`, `recetas` y `proveedores`
 * (R1, R5): cada caso de uso lo recibe por parametro y quien lo obtiene de
 * `identity.getSessionUser()` es la Server Action. `lib/composition` no conoce cookies ni
 * sesion; solo ata puerto -> adaptador.
 *
 * La paginacion tampoco se inyecta: como en `proveedores`, el adaptador driven de `pedidos`
 * usa `toOffsetLimit`/`buildPage` directamente (R37, `design.md > 10`), asi que el dominio
 * no necesita recibirla.
 *
 * `cancelOrder` y `deleteOrder` reciben SOLO el repositorio: ninguno de los dos toca la receta,
 * y darles catalogos que no usan seria cablear una dependencia falsa. Desde el 2026-09-07 los
 * otros cuatro reciben SOLO el catalogo de recetas, por el mismo motivo.
 */
export const pedidos = {
  createOrder: createCreateOrder({ orders: orderRepository, recipes: recipeCatalog }),
  getOrder: createGetOrder({ orders: orderRepository, recipes: recipeCatalog }),
  listOrders: createListOrders({
    orders: orderRepository,
    recipes: recipeCatalog,
    log: pedidosListQueryLog,
  }),
  updateOrder: createUpdateOrder({ orders: orderRepository, recipes: recipeCatalog }),
  cancelOrder: createCancelOrder({ orders: orderRepository }),
  deleteOrder: createDeleteOrder({ orders: orderRepository }),
} as const;

// ---------------------------------------------------------------------------------------
// `observabilidad` (QC-71, T7). Bloque NUEVO al final, mismo criterio que los anteriores: no
// reordena ni reformatea nada de lo de arriba. Su import vive al final del bloque de imports.
//
// Es el UNICO sitio del repo donde la lectura de la cabecera se ata a su implementacion. El
// traductor de `errores` la recibe por parametro y no conoce `next/headers` (R9, y
// `docs/architecture.md > Punto unico de composicion`): sin este cableado, el dominio tendria
// que importar el framework, que es exactamente lo que la regla de dependencias prohibe.
//
// La fachada del BORDE (`newRequestId`) NO esta aqui, sino en `lib/composition/edge.ts`: este
// archivo cablea Prisma y el borde no puede cargarlo (R3). Son dos mitades del mismo punto de
// composicion, no dos puntos.
// ---------------------------------------------------------------------------------------

/** Fachada del modulo `observabilidad` ya cableada. La consumen los siete adaptadores driving,
 *  que se la pasan al traductor unico de errores (`createErrorStateTranslator`). */
export const observabilidad = {
  readRequestIdHeader: readRequestIdHeader satisfies RequestIdHeaderReader,
} as const;

// ---------------------------------------------------------------------------------------
// `asignaciones` (QC-87, T11, `design.md > 2.3`). Bloque NUEVO al final, mismo criterio que los
// de `recetas`, `proveedores`, `unidades` y `pedidos`: no reordena ni reformatea NADA de lo de
// arriba. Sus imports viven al final del bloque de imports.
//
// Es el UNICO archivo que ata puerto -> implementacion para este modulo (R47): ningun otro
// archivo de produccion puede importar sus adaptadores driven, y lo vigila
// `tests/guards/guard-arquitectura-modulos.test.ts`.
//
// CUATRO puertos y TRES adaptadores nuevos, ninguno de ellos de `asignaciones` salvo el ultimo:
// el pedido lo responde `pedidos`, la persona y el grupo los responde `identity`, y cada modulo
// lo hace con un adaptador SUYO. `asignaciones` no toca `prisma.order`, `prisma.user` ni
// `prisma.workGroup` por ninguna via.
// ---------------------------------------------------------------------------------------

/** `OrderCatalog` cableado con el adaptador driven DE PEDIDOS (`design.md > 2.1`): mismo patron
 *  que `RecipeCatalog` arriba. `asignaciones` solo conoce el TIPO, y por el solo puede saber si
 *  el pedido esta VIVO y en que ESTADO —ni el numero, ni la receta, ni las cantidades—. */
const orderCatalog: OrderCatalog = { findAliveById: findAliveOrderTargetById };

/**
 * `PeopleDirectory` y `WorkGroupDirectory` cableados con el MISMO adaptador driven DE IDENTITY
 * (`design.md > 2.2`): un solo objeto que cumple las dos interfaces, y por eso dos constantes que
 * apuntan a la misma implementacion en vez de dos construcciones que puedan divergir.
 *
 * El `now` NO se resuelve aqui: los dos contratos lo reciben POR PARAMETRO en cada llamada,
 * porque el estado efectivo de una cuenta depende del reloj (QC-78 R7, R8) y una cuenta bloqueada
 * por plazo vencido vuelve sola a `active` sin ninguna escritura.
 */
const peopleDirectory: PeopleDirectory = assignmentDirectoryPrisma;
const workGroupDirectory: WorkGroupDirectory = assignmentDirectoryPrisma;

/**
 * `OrderAssignmentRepository` cableado con el adaptador driven de `asignaciones`
 * (`design.md > 3`). Se INVOCA la fabrica SIN argumento, que es la forma que su propia
 * documentacion reserva para este archivo: sin cliente explicito habla por el `PrismaClient`
 * global.
 *
 * Que sea una FABRICA y no un objeto ya construido es R27 y no un gusto: el dia que la operacion
 * gane una segunda escritura, quien abre la transaccion le pasa el cliente transaccional a esta
 * misma fabrica y el dominio sigue sin conocer Prisma. Hoy la atomicidad la da la UNICA sentencia
 * de `insertMissing` (`INSERT ... ON CONFLICT DO NOTHING`), que Postgres ejecuta entera o nada.
 * Por eso aqui se cablea el cliente global: no hay ninguna transaccion abierta que cerrar desde
 * este archivo, y abrirla aqui seria meter una decision de ejecucion en el punto de composicion.
 */
const orderAssignmentRepository: OrderAssignmentRepository = createOrderAssignmentRepository();

/**
 * Fachada del modulo `asignaciones` ya cableada (T11, `design.md > 2.3`). Es lo que consumen las
 * tres Server Actions y la consulta de T12.
 *
 * El ACTOR NO se resuelve aqui, mismo criterio que los otros seis modulos (R1, R4): cada caso de
 * uso lo recibe por parametro, y quien lo construye con las dos caras de la sesion
 * —`getSessionUser` y `getSessionContext`, arriba en el objeto `identity`— es el adaptador driving
 * de T12. Y la EMPRESA tampoco se pasa: la lleva el actor (R5) y la aplican los puertos (R7).
 *
 * El `now` de las TRES escrituras entra por PARAMETRO en cada llamada —`assignResponsibles(actor,
 * input, now)`—: el dominio no tiene reloj propio.
 */
export const asignaciones = {
  assignResponsibles: createAssignResponsibles({
    assignments: orderAssignmentRepository,
    orders: orderCatalog,
    people: peopleDirectory,
    groups: workGroupDirectory,
  }),
  removeWorkGroupFromOrder: createRemoveWorkGroupFromOrder({
    orders: orderCatalog,
    assignments: orderAssignmentRepository,
  }),
  unassignResponsible: createUnassignResponsible({
    orders: orderCatalog,
    assignments: orderAssignmentRepository,
  }),
  // El `now` de la CONSULTA es el unico del modulo que viaja por `deps`, y se cablea EXPLICITO a
  // proposito: `ListOrderResponsiblesDeps` lo declara opcional con `?? new Date()`, y dejarlo sin
  // cablear haria que el unico lector del reloj de todo el modulo fuera un defecto silencioso
  // dentro del dominio. Con esta linea, el reloj real entra SIEMPRE desde el punto de composicion
  // —igual que el resto del modulo lo pasa por parametro (QC-78)— y el defecto queda solo para los
  // tests que no lo inyectan.
  listOrderResponsibles: createListOrderResponsibles({
    orders: orderCatalog,
    assignments: orderAssignmentRepository,
    people: peopleDirectory,
    now: () => new Date(),
  }),
} as const;
