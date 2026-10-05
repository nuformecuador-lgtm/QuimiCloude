// lib/composition/index.ts — PUNTO UNICO DE COMPOSICION.
// Aqui, y solo aqui, se elige QUE implementacion concreta cumple cada puerto.
// Prohibido importar adaptadores driving desde aqui: la flecha va driving -> composicion (R12).
import {
  createCredentialPolicy,
  createEndAllSessions,
  createEndOtherSessions,
  createEndSession,
  createResolveSession,
  createVerifyCredentials,
  seedInitialAccess,
} from '@/lib/modules/identity';
import {
  readInitialAdminCredentialsFromEnv,
  readInitialMaestroCredentialsFromEnv,
} from '@/lib/modules/identity/adapters/driven/config/initial-access-credentials-env';
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
// QC-23 T5 — la fabrica del identificador de sesion. El cableado COMPLETO de la ficha (los tres
// casos de uso nuevos, el eraser, el repositorio de revocaciones y el log) es T17; aqui solo se
// ata este puerto, que es el que `verifyCredentials` necesita para poder emitir un `sid` (R2).
import { sessionIdCrypto } from '@/lib/modules/identity/adapters/driven/session/session-id-crypto';
import type { SessionIdFactory } from '@/lib/modules/identity/ports/session-id-factory';
// QC-23 T10 — el registro del servidor de la comprobacion de sesion. Se cablea AQUI, y no en
// T17, porque `createResolveSession` lo exige desde ya: sin el, el `catch` que falla cerrado
// (R16, R17) quedaria vacio y el arbol no compilaria. El resto del cableado de la ficha sigue
// siendo T17.
import { createSessionCheckLogConsole } from '@/lib/modules/identity/adapters/driven/observability/session-check-log-console';
import type { SessionCheckLog } from '@/lib/modules/identity/ports/session-check-log';
// QC-23 T17 (`design.md > 8`) — lo que falta del cableado de la ficha: el almacen de la
// revocacion y el puerto que retira la cookie. Solo adaptadores DRIVEN y contratos de modulo:
// `lib/composition` no importa ningun driving (R46).
import {
  revokeSession,
  stampAll,
} from '@/lib/modules/identity/adapters/driven/persistence/session-revocation-prisma';
import type { SessionEraser } from '@/lib/modules/identity/ports/session-eraser';
import type { SessionRevocationRepository } from '@/lib/modules/identity/ports/session-revocation-repository';
import type { UserCredentialsReader } from '@/lib/modules/identity/ports/user-credentials-reader';
import {
  createAdjustBatchStock,
  createCreatePresentation,
  createCreateProduct,
  createCreateRawMaterial,
  createDeletePresentation,
  createDeleteProduct,
  createGetProduct,
  createListBatchMovements,
  createListFinishedStock,
  createListOrderBatches,
  createListPresentations,
  createListProductBatches,
  createListProductFormUnits,
  createListProducts,
  createUpdatePresentation,
  createUpdateProduct,
} from '@/lib/modules/inventario';
import {
  findCostingBatches,
  findProductRefs,
  findProductsByNormalizedNames,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma';
import { findBatchMovements } from '@/lib/modules/inventario/adapters/driven/persistence/batch-movement-prisma';
import {
  findPackagingCostingBatches,
  findPackagingRefs,
} from '@/lib/modules/inventario/adapters/driven/persistence/packaging-catalog-prisma';
import {
  addBatchToAlive,
  adjustBatchStock,
  createProduct,
  createWithFirstBatch,
  findAliveIdByNameInPresentationUnit,
  findAliveIdByNameInUnit,
  findAlivePackagingByName,
  findAliveProductById,
  findBatchesOfAliveProduct,
  findBatchesOfOrder,
  findFinishedGoodsReceipts,
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
import {
  findPresentationRefs,
  findPresentationsByNormalizedNames,
} from '@/lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma';
import {
  createMaterialReservations,
  createReservationQueries,
} from '@/lib/modules/inventario/adapters/driven/persistence/reservation-prisma';
import { createFinishedGoodsIntake } from '@/lib/modules/inventario/adapters/driven/persistence/finished-goods-prisma';
import { listStockGroups } from '@/lib/modules/inventario/adapters/driven/persistence/finished-stock-prisma';
import type { FinishedOrderRepository } from '@/lib/modules/inventario/ports/finished-order-repository';
import type { ListQueryLog } from '@/lib/modules/inventario/ports/list-query-log';
import type { OrderNumberFormatter } from '@/lib/modules/inventario/ports/order-number-formatter';
import type { PresentationRepository } from '@/lib/modules/inventario/ports/presentation-repository';
import type { ProductRepository } from '@/lib/modules/inventario/ports/product-repository';
import type {
  OrderNumberDirectory,
  PackagingCatalog,
  PresentationCatalog,
  ProductCatalog,
  ProductNameLookup,
  ReservationQueries,
  StockIncreaseListener,
} from '@/lib/modules/inventario';
import { logIgnoredListQueryFields } from '@/lib/shared/observability/list-query-log';
import { forModule } from '@/lib/shared/observability/logger';
import { findPackageUnitId, findUnitRefs, listVisibleUnitRefs } from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma';
import {
  findUnitRefsSharingBaseInCompany,
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
  createCreateRecipeVersion,
  createDeleteRecipe,
  createGetRecipe,
  createListRecipeVersions,
  createListRecipes,
  createUpdateRecipe,
  createUpdateRecipeVersion,
} from '@/lib/modules/recetas';
import {
  createRecipe,
  createRecipeVersion,
  findAliveRecipeById,
  listAliveRecipes,
  listAliveRecipeVersions,
  replaceAliveRecipe,
  replaceAliveRecipeWithPropagation,
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
  createFindCatalogLinesByIdentity,
  createGetSupplier,
  createImportCatalogLines,
  createListCatalogLines,
  createListShowcaseLines,
  createListSuppliers,
  createListSupplierShowcase,
  createUpdateCatalogLine,
  createUpdateSupplier,
  type CatalogImageUrl,
} from '@/lib/modules/proveedores';
// La importacion por identidad de un catalogo. El adaptador y el puerto son
// de uso EXCLUSIVO de esta operacion -por eso no se cablean junto al resto de `proveedores`, mas
// abajo- y quien los necesita es solo `documentos`, en su propio bloque, al final de este archivo.
import {
  findAliveCatalogLinesByIdentities,
  upsertCatalogLinesByIdentity,
} from '@/lib/modules/proveedores/adapters/driven/persistence/supplier-catalog-import-prisma';
import type { SupplierCatalogImportRepository } from '@/lib/modules/proveedores/ports/supplier-catalog-import-repository';
import {
  createSupplier,
  findAliveSupplierById,
  listAliveSuppliers,
  listShowcaseAliveSuppliers,
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
  createExpireStaleOrders,
  createFindCoverage,
  createFinishPacking,
  createGetOrder,
  createListAliveSummariesByIds,
  createListAliveSummariesInCompany,
  createListOrders,
  createQuoteOrderCost,
  createQuoteOrderPresentationAvailability,
  createReviewBlockedOrders,
  createStartPacking,
  createTransitionOrder,
  createUpdateOrder,
  createUpdateOrderPresentationLines,
  formatOrderNumber,
} from '@/lib/modules/pedidos';
import {
  createOrderWriteRepository,
  findAliveOrderById,
  findBlockedOrderIds,
  findExpirableOrders,
  listAliveOrders,
  startPackingAliveOrder,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma';
import { findOrderNumberTextsByIds } from '@/lib/modules/pedidos/adapters/driven/persistence/order-number-directory-prisma';
import {
  withOrderTransaction,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-unit-of-work-prisma';
import { verifyCronSecret } from '@/lib/modules/pedidos/adapters/driven/config/cron-secret-env';
import type { ListQueryLog as PedidosListQueryLog } from '@/lib/modules/pedidos/ports/list-query-log';
import type { OrderPackingRepository } from '@/lib/modules/pedidos/ports/order-packing-repository';
import type { OrderSummaryReader } from '@/lib/modules/pedidos/ports/order-summary-reader';
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository';
import type { OrderTransactionScope, OrderUnitOfWork } from '@/lib/modules/pedidos/ports/order-unit-of-work';
import {
  createRecipeExecutionReader,
  findAliveRecipeByNormalizedName,
  findRecipeExecutionContentById,
  findRecipeIdsMatchingName,
  findRecipeRefsIncludingDeleted,
} from '@/lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma';
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
  createFinishAssignedOrder,
  createFinishPacking as createFinishPackingOrder,
  createGetAssignedOrderExecution,
  createGetPackingOrder,
  createListAssignedOrders,
  createListCompanyOrders,
  createListFinishedOrders,
  createListOrderResponsibles,
  createListPackingOrders,
  createListResponsibleCandidates,
  createListResponsiblesForOrders,
  createRemoveWorkGroupFromOrder,
  createStartAssignedOrder,
  createStartPacking as createStartPackingOrder,
  createUnassignResponsible,
} from '@/lib/modules/asignaciones';
import { createOrderAssignmentRepository } from '@/lib/modules/asignaciones/adapters/driven/persistence/order-assignment-prisma';
import type { OrderAssignmentRepository } from '@/lib/modules/asignaciones/ports/order-assignment-repository';
import {
  findAliveOrderTargetById,
  listAliveOrderSummariesByIds,
  listAliveOrderSummariesInCompany,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma';
import type { OrderCatalog } from '@/lib/modules/pedidos';
import { assignmentDirectoryPrisma } from '@/lib/modules/identity/adapters/driven/persistence/assignment-directory-prisma';
import { listActiveCompanyIds } from '@/lib/modules/identity/adapters/driven/persistence/company-directory-prisma';
import type { PeopleDirectory, WorkGroupDirectory } from '@/lib/modules/identity';
// `documentos` — las DOS factories salen del CONTRATO del modulo (solo dominio), los dos puertos de
// `ports/` y las dos implementaciones de `adapters/driven/` por su ruta exacta. La Server Action del
// modulo NO se importa desde aqui: la flecha va driving -> composicion.
import {
  createConfirmCatalogImport,
  createConfirmFormulaImport,
  createConvertPdfs,
  createCropCatalogImages,
  createDownloadDocument,
  createEnqueueBatch,
  createGetBatchStatus,
  createIssueReadLink,
  createIssueUploadLinks,
  createPreviewCatalogImport,
  createPreviewFormulaImport,
  createProcessPdfByStrategy,
  createReadPdfWithAi,
  createRunDocumentJob,
  type CatalogImportDeps,
  type FormulaImportDeps,
} from '@/lib/modules/documentos';
import { readWithAnthropic } from '@/lib/modules/documentos/adapters/driven/ai/ai-reader-anthropic';
import { readCannedText } from '@/lib/modules/documentos/adapters/driven/ai/ai-reader-canned';
import { documentsE2EDoublesEnabled } from '@/lib/modules/documentos/adapters/driven/config/e2e-doubles-env';
import { readProcessingConfigFromEnv } from '@/lib/modules/documentos/adapters/driven/config/processing-config-env';
import { readStrategyPromptFromEnv } from '@/lib/modules/documentos/adapters/driven/config/strategy-prompt-env';
import { cropImage } from '@/lib/modules/documentos/adapters/driven/image/image-cropper-sharp';
import { createStrategyRunLogConsole } from '@/lib/modules/documentos/adapters/driven/observability/strategy-run-log-console';
import { createCropRegionLogConsole } from '@/lib/modules/documentos/adapters/driven/observability/crop-region-log-console';
import {
  countPages,
  extractPdfText,
  renderPages,
} from '@/lib/modules/documentos/adapters/driven/pdf/pdf-converter-unpdf';
import { documentBatchRepositoryPrisma } from '@/lib/modules/documentos/adapters/driven/persistence/document-batch-repository-prisma';
import { createProcessingQueueInline } from '@/lib/modules/documentos/adapters/driven/queue/processing-queue-inline';
import { processingQueueQstash } from '@/lib/modules/documentos/adapters/driven/queue/processing-queue-qstash';
import { queueSignatureQstash } from '@/lib/modules/documentos/adapters/driven/queue/queue-signature-qstash';
import { documentStorageMemory } from '@/lib/modules/documentos/adapters/driven/storage/document-storage-memory';
import {
  createDocumentSignedReadUrl,
  createDocumentSignedUpload,
  downloadDocument,
  removeDocument,
} from '@/lib/modules/documentos/adapters/driven/storage/document-storage-supabase';
import { uploadCrop } from '@/lib/modules/documentos/adapters/driven/storage/crop-storage-supabase';
import { cropStorageMemory } from '@/lib/modules/documentos/adapters/driven/storage/crop-storage-memory';
import {
  cropPublicUrl,
  listCrops,
} from '@/lib/modules/documentos/adapters/driven/storage/crop-catalog-supabase';
import { cropCatalogMemory } from '@/lib/modules/documentos/adapters/driven/storage/crop-catalog-memory';
import type { AiReader } from '@/lib/modules/documentos/ports/ai-reader';
import type { CropCatalog } from '@/lib/modules/documentos/ports/crop-catalog';
import type { CropStorage } from '@/lib/modules/documentos/ports/crop-storage';
import type { DocumentBatchRepository } from '@/lib/modules/documentos/ports/document-batch-repository';
import type { DocumentStorage } from '@/lib/modules/documentos/ports/document-storage';
import type { ImageCropper } from '@/lib/modules/documentos/ports/image-cropper';
import type { PdfConverter } from '@/lib/modules/documentos/ports/pdf-converter';
import type { ProcessingConfig } from '@/lib/modules/documentos/ports/processing-config';
import type { ProcessingQueue } from '@/lib/modules/documentos/ports/processing-queue';
import type { QueueSignature } from '@/lib/modules/documentos/ports/queue-signature';
import type { StrategyPrompt } from '@/lib/modules/documentos/ports/strategy-prompt';
import type { StrategyRunLog } from '@/lib/modules/documentos/ports/strategy-run-log';
import type { CropRegionLog } from '@/lib/modules/documentos/ports/crop-region-log';
import type { DocumentJobLog } from '@/lib/modules/documentos/ports/document-job-log';
import { requestScoped } from '@/lib/shared/request-scope';
// `clientes`. Imports al final del bloque, bloque de cableado al final del archivo: no
// reordena ni reformatea nada de lo que hay arriba.
import {
  createCreateCustomer,
  createDeleteCustomer,
  createGetCustomer,
  createListCustomers,
  createUpdateCustomer,
} from '@/lib/modules/clientes';
import {
  createCustomer,
  findAliveCustomerById,
  listAliveCustomers,
  softDeleteAliveCustomer,
  updateAliveCustomer,
} from '@/lib/modules/clientes/adapters/driven/persistence/customer-prisma';
import type { ListQueryLog as ClientesListQueryLog } from '@/lib/modules/clientes/ports/list-query-log';
import type { CustomerRepository } from '@/lib/modules/clientes/ports/customer-repository';

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
// QC-23 T5 (R1, R2): el UNICO sitio donde `SessionIdFactory` se ata a su implementacion.
const sessionIds: SessionIdFactory = sessionIdCrypto;
const sessionReader: SessionReader = { readClaims: readSessionClaims };
const sessionUserReader: SessionUserReader = { findActiveById: findActiveSessionUserById };
// QC-48 (T8, `design.md > 6`): UNA SOLA instancia de la cadena de cortes, y de ella salen las DOS
// salidas. Dos construcciones serian dos cableados que pueden divergir —mismo criterio que
// `checkCredentialPolicy` en QC-19— y con ellos dos definiciones de «hay sesion», que es
// justamente lo que R21 prohibe.
// QC-23 T10 (R16, R17): el UNICO sitio donde `SessionCheckLog` se ata a su implementacion. La
// LECTURA de la cabecera del identificador de peticion entra por parametro en el adaptador —no en
// el dominio—, que es el reparto que fijo QC-71 R9 para el traductor unico de errores.
const sessionCheckLog: SessionCheckLog = createSessionCheckLogConsole(readRequestIdHeader);
const resolveSession = createResolveSession({
  session: sessionReader,
  users: sessionUserReader,
  log: sessionCheckLog,
});
// QC-104 T3 (R1, R12, `design.md > 2.5`): la sesion se resuelve UNA sola vez por peticion, y las
// DOS proyecciones de abajo salen de esa MISMA lectura —asi el identificador del usuario y el de
// su contexto no pueden discrepar (R12)—. Fuera de una peticion NO se memoiza nada y cada llamada
// lee, que es lo que protege al inicio de sesion (R7, `design.md > 2.7`).
const resolveSessionOncePerRequest = requestScoped(() => resolveSession());
// ---------------------------------------------------------------------------------------
// QC-23 T17 (`design.md > 8`) — el cableado de la revocacion de sesiones. Bloque NUEVO: no
// reordena ni reformatea ninguna de las lineas de arriba. `resolveSession` se sigue
// construyendo UNA SOLA VEZ y de esa unica instancia salen las DOS proyecciones (QC-48 R21):
// esa estructura no se toca.
//
// Va AQUI, entre dos bloques existentes, y NO al final del archivo, por la MISMA razon de
// EJECUCION que dejo escrita QC-66 unas lineas mas abajo: `sessionProvider` y el objeto
// `identity` se evaluan en su propia linea, asi que una constante declarada despues estaria en
// su zona muerta y el modulo reventaria al cargarse. Es una desviacion de la LETRA de
// `design.md > 8` -«un bloque al final»- y no de su fondo: no se toca nada de lo que ya habia.
//
// Los dos puertos se atan a su implementacion AQUI y solo aqui (R46).
// ---------------------------------------------------------------------------------------

/** R22 — retirar la cookie, con el MISMO `clearSession` que hasta hoy se cableaba directo a la
 *  fachada. No cambia el adaptador: cambia quien lo llama (`design.md > 5.1`). */
const sessionEraser: SessionEraser = { clear: clearSession };

/** El almacen de la revocacion (R10, R25, R39): las dos escrituras transaccionales, cada una con
 *  su purga dentro. Sin ningun metodo de listado, que es la decision cerrada 12 escrita en el
 *  TIPO. El UNICO archivo del repo con `prisma.revokedSession` es su adaptador; aqui solo se
 *  elige que sea el. */
const sessionRevocations: SessionRevocationRepository = { revokeSession, stampAll };

const sessionProvider: SessionProvider = {
  getSessionUser: async () => (await resolveSessionOncePerRequest())?.user ?? null,
  // R19: `null` en exactamente los mismos casos que `getSessionUser`, por construccion.
  getSessionContext: async () => (await resolveSessionOncePerRequest())?.context ?? null,
  // QC-23 T17 (R20-R24, `design.md > 5.1`): `endSession` DEJA DE SER un cableado directo a
  // `clearSession` y pasa a ser el CASO DE USO, que lee el `sid` en curso, registra su cierre
  // -y purga de paso las caducadas de esa persona- y despues retira la cookie, siempre.
  //
  // **La clave conserva su nombre y su firma -sin parametros y sin valor de retorno-, asi que
  // `logout-action.ts` NO CAMBIA NI UNA LINEA** (R21, contrato congelado por QC-11) y su test
  // sigue verde sin tocarlo: esa es la red de esta migracion. Cambia el EFECTO, no la firma.
  endSession: createEndSession({
    session: sessionReader,
    revocations: sessionRevocations,
    cookie: sessionEraser,
    log: sessionCheckLog,
  }),
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
    ids: sessionIds,
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
        maestroCredentials: readInitialMaestroCredentialsFromEnv,
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
  // QC-23 T17 (`design.md > 8`) — los DOS casos de uso de cierre en bloque, ya cableados. Claves
  // NUEVAS al FINAL del objeto: ninguna de las de arriba se toca.
  //
  // El ACTOR NO se resuelve aqui, mismo criterio que los otros seis modulos (R29): cada uno lo
  // recibe por PARAMETRO y lo construye quien invoque -que hoy no es nadie, y manana sera QC-101
  // con el boton del administrador y QC-53 con el del usuario (R51)-. `lib/composition` no
  // conoce cookies ni sesion; solo ata puerto -> adaptador.
  //
  // Ninguna de las dos crea pagina, ruta, componente ni Server Action: esa mitad es de otra
  // ficha, a proposito.
  endAllSessions: createEndAllSessions({ revocations: sessionRevocations }),
  endOtherSessions: createEndOtherSessions({
    revocations: sessionRevocations,
    sessions: sessionWriter,
    ids: sessionIds,
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
  findAliveIdByNameInPresentationUnit,
  findAliveIdByNameInUnit,
  findAlivePackagingByName,
  createWithFirstBatch,
  addBatchToAlive,
  adjustBatchStock,
  findBatchesOfAliveProduct,
  findBatchMovements,
};

const finishedOrderRepository: FinishedOrderRepository = { findBatchesOfOrder, listStockGroups };

/** El formato del numero de pedido es de `pedidos`; `inventario` solo declara el hueco. */
const orderNumberFormatter: OrderNumberFormatter = { format: formatOrderNumber };

const presentationRepository: PresentationRepository = {
  create: createPresentation,
  replace: replacePresentation,
  deleteById: deletePresentationById,
  list: listPresentations,
};

/** `OrderNumberDirectory` cableado con el adaptador driven DE PEDIDOS: `inventario` solo conoce
 *  el TIPO, para el historial de un lote. Declarado ANTES de la fachada de `inventario` -y no
 *  junto al resto de lo de `pedidos`, mas abajo- porque `listBatchMovements` lo necesita ya
 *  cableado: un `const` no existe antes de su linea. */
const orderNumberDirectory: OrderNumberDirectory = { findNumberTexts: findOrderNumberTextsByIds };

/**
 * El aviso de existencia que sube, atado a la revision de los pedidos bloqueados de `pedidos`.
 * Va antes de la fachada de `inventario`, que lo necesita; `reviewBlockedOrders` se declara mas
 * abajo y solo se lee cuando llega un aviso, con el modulo ya cargado. Nunca lanza: el lote o el
 * ajuste ya estan escritos y un fallo aqui no puede devolverlos como error.
 */
const blockedOrdersLog = forModule('pedidos');

const stockIncreaseListener: StockIncreaseListener = {
  async onStockIncreased({ companyId, now }) {
    try {
      const result = await reviewBlockedOrders({ companyId, now });
      if (result.failed.length > 0) {
        // El logger solo admite primitivas; `failed` lleva unicamente ids y codigos.
        blockedOrdersLog.error('blocked_orders_review_failed', {
          companyId,
          failedCount: result.failed.length,
          failed: JSON.stringify(result.failed),
        });
      }
    } catch {
      // Sin el error: su mensaje puede traer datos de la consulta.
      blockedOrdersLog.error('blocked_orders_review_failed', { companyId, stage: 'blocked_ids' });
    }
  },
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
  createProduct: createCreateProduct({
    products: productRepository,
    stockIncreases: stockIncreaseListener,
    packageUnit: { findPackageUnitId },
    units: { findRefs: findUnitRefs },
  }),
  createRawMaterial: createCreateRawMaterial({ products: productRepository }),
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
  // Claves nuevas al final: ninguna de las de arriba se toca.
  adjustBatchStock: createAdjustBatchStock({
    products: productRepository,
    stockIncreases: stockIncreaseListener,
  }),
  listProductBatches: createListProductBatches({ products: productRepository }),
  // Se nombra el adaptador importado y no la constante `peopleDirectory`, que apunta al mismo
  // objeto pero se declara mas abajo: un `const` no existe antes de su linea.
  // `orderNumberDirectory`, en cambio, SI esta declarada arriba (a proposito, por la misma
  // razon): `listBatchMovements` la necesita.
  listBatchMovements: createListBatchMovements({
    products: productRepository,
    people: assignmentDirectoryPrisma,
    orders: orderNumberDirectory,
  }),
  listOrderBatches: createListOrderBatches({ finishedOrders: finishedOrderRepository }),
  listFinishedStock: createListFinishedStock({
    finishedOrders: finishedOrderRepository,
    orderNumbers: orderNumberFormatter,
    log: inventarioListQueryLog,
  }),
  // El adaptador y no `unitCatalog`, que se declara mas abajo.
  listProductFormUnits: createListProductFormUnits({ units: { listVisibleRefs: listVisibleUnitRefs } }),
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

/** Solo para el servidor de `pedidos`: validar el envase de cada linea del reparto y costearlo. */
const packagingCatalog: PackagingCatalog = {
  findRefs: findPackagingRefs,
  findCostingBatches: findPackagingCostingBatches,
};

/** `ProductCatalog` cableado con el adaptador driven DE INVENTARIO (`design.md > 6`):
 *  es el hueco que QC-24 dejo abierto en el contrato publico de `inventario` y que T9
 *  llena. `recetas` solo conoce el TIPO `ProductCatalog`, nunca esta implementacion. */
const productCatalog: ProductCatalog = {
  findRefs: findProductRefs,
  findCostingBatches,
  findFinishedGoodsReceipts,
};

const presentationCatalog: PresentationCatalog = {
  findRefs: findPresentationRefs,
  findByNormalizedNames: findPresentationsByNormalizedNames,
};

/** `ProductNameLookup` cableado con el adaptador driven DE INVENTARIO: resolucion de
 *  ingredientes POR NOMBRE. Interfaz propia, no un metodo mas de `ProductCatalog`. */
const productNameLookup: ProductNameLookup = {
  findAliveByNormalizedNames: findProductsByNormalizedNames,
};

/** `UnitCatalog` cableado con el adaptador driven DE UNIDADES (R50): `recetas` solo
 *  conoce el TIPO `UnitCatalog`, nunca esta implementacion. `findRefsSharingBaseInCompany`
 *  la estrena `asignaciones`, mas abajo. */
const unitCatalog: UnitCatalog = {
  findRefs: findUnitRefs,
  findRefsSharingBaseInCompany: findUnitRefsSharingBaseInCompany,
  listVisibleRefs: listVisibleUnitRefs,
};

const recipeRepository: RecipeRepository = {
  create: createRecipe,
  findAliveById: findAliveRecipeById,
  listAlive: listAliveRecipes,
  replaceAlive: replaceAliveRecipe,
  softDeleteAlive: softDeleteAliveRecipe,
  createVersion: createRecipeVersion,
  listAliveVersions: listAliveRecipeVersions,
  replaceAliveWithPropagation: replaceAliveRecipeWithPropagation,
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
    images: recipeImageStorage,
  }),
  deleteRecipe: createDeleteRecipe({ recipes: recipeRepository }),
  createRecipeVersion: createCreateRecipeVersion({ recipes: recipeRepository, products: productCatalog }),
  updateRecipeVersion: createUpdateRecipeVersion({ recipes: recipeRepository, products: productCatalog }),
  listRecipeVersions: createListRecipeVersions({ recipes: recipeRepository }),
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
  listShowcaseAlive: listShowcaseAliveSuppliers,
};

const supplierCatalogRepository: SupplierCatalogRepository = {
  create: createCatalogLine,
  replaceAlive: replaceAliveCatalogLine,
  softDeleteAlive: softDeleteAliveCatalogLine,
  listBySupplierAlive: listCatalogLinesBySupplierAlive,
};

/**
 * La URL publica de un recorte sale del MISMO bucket que ya lee
 * `cropCatalog`, mas abajo -mismo criterio de bifurcacion por `documentsE2EDoublesEnabled()`-.
 * Declarada AQUI, antes de la fachada de `proveedores`, porque sus tres casos de uso capturan
 * esta dependencia al construirse.
 */
const catalogImageUrl: CatalogImageUrl = {
  publicUrl: (path) =>
    documentsE2EDoublesEnabled() ? cropCatalogMemory.publicUrl(path) : cropPublicUrl(path),
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
  createCatalogLine: createCreateCatalogLine({ catalog: supplierCatalogRepository, units: unitCatalog }),
  updateCatalogLine: createUpdateCatalogLine({ catalog: supplierCatalogRepository, units: unitCatalog }),
  deleteCatalogLine: createDeleteCatalogLine({ catalog: supplierCatalogRepository }),
  listCatalogLines: createListCatalogLines({
    catalog: supplierCatalogRepository,
    log: proveedoresListQueryLog,
    images: catalogImageUrl,
  }),
  // La vista de catalogo visual. Claves nuevas al final: ninguna de las de arriba se toca.
  listSupplierShowcase: createListSupplierShowcase({
    suppliers: supplierRepository,
    images: catalogImageUrl,
  }),
  listShowcaseLines: createListShowcaseLines({
    catalog: supplierCatalogRepository,
    images: catalogImageUrl,
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
 *  receta aunque la den de baja y la fila tiene que seguir diciendo que se pidio (R44).
 *  `findExecutionContentById` la estrena `asignaciones`, mas abajo. */
const recipeCatalog: RecipeCatalog = {
  findRefsIncludingDeleted: findRecipeRefsIncludingDeleted,
  findExecutionContentById: findRecipeExecutionContentById,
  findIdsMatchingName: findRecipeIdsMatchingName,
  findAliveByNormalizedName: findAliveRecipeByNormalizedName,
};

/** QC-57 (T7, R6): misma implementacion, tipada con el puerto que declara `pedidos`. */
const pedidosListQueryLog: PedidosListQueryLog = { ignoredFields: logIgnoredListQueryFields };

/** Puerto de LECTURA de `pedidos` (`ports/order-repository.ts`): la fila previa de una edicion,
 *  cancelacion o borrado, y el listado. La escritura ya no vive aqui: se movio entera a
 *  `orderUnitOfWork`, abajo. */
const orderRepository: OrderRepository = {
  findAliveById: findAliveOrderById,
  listAlive: listAliveOrders,
  findBlockedIds: findBlockedOrderIds,
};

/**
 * `OrderUnitOfWork.run` sobre `withOrderTransaction`: abre la transaccion y construye, con el
 * MISMO `tx`, el repositorio de escritura de `pedidos`, las reservas de `inventario` y el
 * lector de contenido de receta, para que las tres lecturas y escrituras vean la misma
 * instantanea sin abrir una segunda conexion mientras esta retiene la suya. Sin `unitCatalog`:
 * la necesidad ya llega en la unidad del producto, asi que `createMaterialReservations` no
 * convierte nada.
 */
const orderUnitOfWork: OrderUnitOfWork = {
  run: (work) =>
    withOrderTransaction((tx) => {
      const scope: OrderTransactionScope = {
        orders: createOrderWriteRepository(tx),
        reservations: createMaterialReservations(tx),
        recipes: createRecipeExecutionReader(tx),
        finishedGoods: createFinishedGoodsIntake(tx),
      };
      return work(scope);
    }),
};

/** Lectura de la cobertura de un pedido, FUERA de transaccion, sobre el cliente global:
 *  `findCoverage` la usa una vez por pagina. */
const reservationQueries: ReservationQueries = createReservationQueries();

/**
 * El proceso diario: recorre las empresas de `identity` una por una y,
 * para cada una, sus candidatos con el `findExpirableOrders` de `pedidos` -ninguna consulta lee
 * pedidos de mas de una empresa a la vez-.
 */
const expireStaleOrders = createExpireStaleOrders({
  listCompanyIds: listActiveCompanyIds,
  findExpirable: findExpirableOrders,
  unitOfWork: orderUnitOfWork,
  now: () => new Date(),
});

/** La revision de bloqueados que dispara `stockIncreaseListener`. No va en la fachada `pedidos`:
 *  no lleva actor y ninguna Server Action la llama. */
const reviewBlockedOrders = createReviewBlockedOrders({
  orders: orderRepository,
  recipes: recipeCatalog,
  products: productCatalog,
  units: unitCatalog,
  packaging: packagingCatalog,
  unitOfWork: orderUnitOfWork,
});

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
 * `cancelOrder` y `deleteOrder` reciben `orders` (SOLO lectura, para la comprobacion previa de
 * estado) y `unitOfWork` (para liberar): ninguno de los dos toca la receta, y darles catalogos
 * que no usan seria cablear una dependencia falsa. `getOrder` y `listOrders` reciben `recipes`,
 * `presentations` y `units` -para la etiqueta de `unitId`-, pero no
 * `products` ni `unitOfWork`: no calculan ningun importe ni apartan nada. `createOrder` y
 * `updateOrder` son los dos que si costean y aparta, asi que son los dos que reciben tambien
 * `products` y `unitOfWork`.
 */
export const pedidos = {
  createOrder: createCreateOrder({
    recipes: recipeCatalog,
    products: productCatalog,
    units: unitCatalog,
    presentations: presentationCatalog,
    packaging: packagingCatalog,
    unitOfWork: orderUnitOfWork,
  }),
  getOrder: createGetOrder({
    orders: orderRepository,
    recipes: recipeCatalog,
    presentations: presentationCatalog,
    packaging: packagingCatalog,
    // La unidad vuelve al pedido: `getOrder` vuelve a necesitar `units`.
    units: unitCatalog,
  }),
  listOrders: createListOrders({
    orders: orderRepository,
    recipes: recipeCatalog,
    presentations: presentationCatalog,
    packaging: packagingCatalog,
    // Mismo motivo que `getOrder`, una llamada por pagina.
    units: unitCatalog,
    log: pedidosListQueryLog,
  }),
  updateOrder: createUpdateOrder({
    orders: orderRepository,
    recipes: recipeCatalog,
    products: productCatalog,
    units: unitCatalog,
    presentations: presentationCatalog,
    packaging: packagingCatalog,
    unitOfWork: orderUnitOfWork,
  }),
  cancelOrder: createCancelOrder({ orders: orderRepository, unitOfWork: orderUnitOfWork }),
  deleteOrder: createDeleteOrder({ orders: orderRepository, unitOfWork: orderUnitOfWork }),
  findCoverage: createFindCoverage({ reservations: reservationQueries }),
  quoteOrderCost: createQuoteOrderCost({
    recipes: recipeCatalog,
    products: productCatalog,
    units: unitCatalog,
    packaging: packagingCatalog,
  }),
  // El proceso diario y su puerta: sin usuario delante, asi que ninguno de los dos recibe actor.
  // El handler los llama en ese orden -primero la puerta- y `lib/composition` no impone el
  // orden por su cuenta.
  verifyCronSecret,
  expireStaleOrders,
  // La edicion ACOTADA del reparto y la unidad: aparta los envases, asi que va en la unidad de
  // trabajo compartida con `inventario`. `recipes` y `products` son para recalcular el importe.
  updateOrderPresentationLines: createUpdateOrderPresentationLines({
    recipes: recipeCatalog,
    products: productCatalog,
    packaging: packagingCatalog,
    presentations: presentationCatalog,
    units: unitCatalog,
    unitOfWork: orderUnitOfWork,
  }),
  // «Cuanto queda disponible», de solo lectura. Los catalogos del reparto de
  // `updateOrderPresentationLines`, sin transaccion: no escribe nada.
  quoteOrderPresentationAvailability: createQuoteOrderPresentationAvailability({
    packaging: packagingCatalog,
    presentations: presentationCatalog,
    units: unitCatalog,
  }),
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

/** `OrderCatalog` cableado con el adaptador driven DE PEDIDOS: mismo patron que `RecipeCatalog`
 *  arriba. `asignaciones` solo conoce el TIPO, y por el solo puede saber si el pedido esta VIVO
 *  y en que ESTADO —ni el numero, ni la receta, ni las cantidades—.
 *
 *  `transitionAliveById` ya no es la funcion cruda de `order-catalog-prisma.ts`: es
 *  `createTransitionOrder`, que abre `orderUnitOfWork` y, si el destino es `ENTREGADO`,
 *  consume el material en la misma transaccion. */
/** `OrderPackingRepository` cableado con la escritura cruda de Comenzar (`order-prisma.ts`): un
 *  `UPDATE` condicional fuera de `orderUnitOfWork`, sin abrir la transaccion compartida con
 *  `inventario`. Terminar no vive aqui: abre `orderUnitOfWork` directamente. */
const orderPackingRepository: OrderPackingRepository = {
  startPackingAlive: startPackingAliveOrder,
};

const orderSummaryReader: OrderSummaryReader = {
  listAliveByIds: listAliveOrderSummariesByIds,
  listAliveInCompany: listAliveOrderSummariesInCompany,
};

const orderCatalog: OrderCatalog = {
  findAliveById: findAliveOrderTargetById,
  listAliveSummariesByIds: createListAliveSummariesByIds({ summaries: orderSummaryReader, packaging: packagingCatalog }),
  listAliveSummariesInCompany: createListAliveSummariesInCompany({
    summaries: orderSummaryReader,
    packaging: packagingCatalog,
  }),
  // Finalizar ya no da de alta ningun lote, asi que `createTransitionOrder`
  // ya no necesita `recipeCatalog`/`productCatalog`/`unitCatalog` -esos catalogos siguen
  // cableados mas abajo para quien todavia los usa-.
  transitionAliveById: createTransitionOrder({ unitOfWork: orderUnitOfWork }),
  startPackingAliveById: createStartPacking({ packing: orderPackingRepository }),
  // Terminar SI necesita los tres catalogos globales -receta y coste del lote, mismo criterio
  // que Finalizar usaba antes de dejar de dar de alta el lote- y `presentationCatalog`, para
  // rechazar en profundidad una linea sin contenido copiado ni vigente.
  finishPackingAliveById: createFinishPacking({
    packing: orderPackingRepository,
    unitOfWork: orderUnitOfWork,
    recipes: recipeCatalog,
    products: productCatalog,
    units: unitCatalog,
    presentations: presentationCatalog,
    packaging: packagingCatalog,
  }),
};

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
  // QC-102 T5 - la QUINTA operacion: los responsables de VARIOS pedidos a la vez, que es lo que
  // el listado pide una vez por pagina (`QC-102 design.md > 2.5`). MISMO `orderAssignmentRepository`
  // y MISMO `peopleDirectory` que los otros cuatro casos de uso: ningun adaptador nuevo.
  //
  // **SIN `OrderCatalog`**, y no es un olvido: el hallazgo H3 de QC-102 lo deja escrito. Comprobar
  // que cada pedido de la pagina existe costaria una consulta POR PEDIDO -lo que su R4 prohibe-,
  // asi que un identificador desconocido devuelve su entrada VACIA (R7). La empresa la sigue
  // aplicando el puerto con la del actor (R3).
  listResponsiblesForOrders: createListResponsiblesForOrders({
    assignments: orderAssignmentRepository,
    people: peopleDirectory,
    now: () => new Date(),
  }),
  listAssignedOrders: createListAssignedOrders({
    assignments: orderAssignmentRepository,
    orders: orderCatalog,
    recipes: recipeCatalog,
    people: peopleDirectory,
    presentations: presentationCatalog,
    units: unitCatalog,
    now: () => new Date(),
  }),
  // La pantalla de ejecucion. MISMO `orderCatalog`, `recipeCatalog` y
  // `orderAssignmentRepository` que el resto del modulo; `productCatalog` es el mismo que usa
  // `recetas` mas arriba, y `unitCatalog` el mismo que usa `recetas` para sus dos escrituras.
  getAssignedOrderExecution: createGetAssignedOrderExecution({
    assignments: orderAssignmentRepository,
    orders: orderCatalog,
    recipes: recipeCatalog,
    units: unitCatalog,
    products: productCatalog,
    presentations: presentationCatalog,
  }),
  startAssignedOrder: createStartAssignedOrder({
    assignments: orderAssignmentRepository,
    orders: orderCatalog,
    recipes: recipeCatalog,
    units: unitCatalog,
    products: productCatalog,
    presentations: presentationCatalog,
    now: () => new Date(),
  }),
  finishAssignedOrder: createFinishAssignedOrder({
    assignments: orderAssignmentRepository,
    orders: orderCatalog,
    people: peopleDirectory,
    groups: workGroupDirectory,
    now: () => new Date(),
  }),
  // Claves NUEVAS al final: ninguna de las de arriba se toca. MISMOS `orderCatalog`,
  // `recipeCatalog`, `presentationCatalog`, `orderAssignmentRepository` y `peopleDirectory` que
  // el resto del modulo: ningun adaptador nuevo.
  listFinishedOrders: createListFinishedOrders({
    orders: orderCatalog,
    assignments: orderAssignmentRepository,
    recipes: recipeCatalog,
    people: peopleDirectory,
    presentations: presentationCatalog,
    units: unitCatalog,
    now: () => new Date(),
  }),
  listCompanyOrders: createListCompanyOrders({
    orders: orderCatalog,
    assignments: orderAssignmentRepository,
    recipes: recipeCatalog,
    people: peopleDirectory,
    presentations: presentationCatalog,
    units: unitCatalog,
    now: () => new Date(),
  }),
  listResponsibleCandidates: createListResponsibleCandidates({
    people: peopleDirectory,
    now: () => new Date(),
  }),
  // `listPackingOrders` y `getPackingOrder` comparten los MISMOS `orderCatalog`,
  // `orderAssignmentRepository`, `recipeCatalog`, `presentationCatalog` y `peopleDirectory` del
  // resto del modulo, mas `productCatalog` -el mismo que usa `recetas` y la ejecucion, arriba-
  // para los envases. `startPacking` y `finishPacking` solo necesitan `orderCatalog`: ningun
  // adaptador nuevo.
  listPackingOrders: createListPackingOrders({
    orders: orderCatalog,
    assignments: orderAssignmentRepository,
    recipes: recipeCatalog,
    people: peopleDirectory,
    presentations: presentationCatalog,
    units: unitCatalog,
    products: productCatalog,
    now: () => new Date(),
  }),
  getPackingOrder: createGetPackingOrder({
    orders: orderCatalog,
    assignments: orderAssignmentRepository,
    recipes: recipeCatalog,
    people: peopleDirectory,
    presentations: presentationCatalog,
    units: unitCatalog,
    products: productCatalog,
    now: () => new Date(),
  }),
  startPacking: createStartPackingOrder({
    orders: orderCatalog,
    now: () => new Date(),
  }),
  finishPacking: createFinishPackingOrder({
    orders: orderCatalog,
    now: () => new Date(),
  }),
} as const;

// ---------------------------------------------------------------------------------------
// `documentos`. Bloque NUEVO al final, mismo criterio que los anteriores: no reordena ni
// reformatea NADA de lo de arriba. Sus imports viven al final del bloque de imports.
//
// Es el UNICO archivo que ata puerto -> implementacion para este modulo: ningun otro archivo de
// produccion puede importar sus adaptadores driven, y lo vigila
// `tests/guards/guard-arquitectura-modulos.test.ts`.
//
// Los adaptadores exportan sus funciones con nombres DISTINTOS de los metodos del puerto —el
// almacenamiento, porque `download` o `createSignedUpload` a secas no dirian de que son en un
// archivo con nueve modulos; la conversion, porque `extractText` es tambien el nombre de la
// funcion de la libreria—, asi que las claves del objeto son las del PUERTO y el valor, la funcion
// del adaptador.
// ---------------------------------------------------------------------------------------

/**
 * `DocumentStorage` cableado con el adaptador del bucket PRIVADO de estos PDFs. Ninguna de sus
 * cuatro funciones se INVOCA aqui —solo se referencian—, asi que construir esta fachada no lee ni
 * una variable de entorno ni toca la red: el adaptador resuelve su configuracion en cada llamada
 * real. Importar este archivo con las variables del Storage vacias sigue funcionando.
 */
const documentStorageSupabase: DocumentStorage = {
  createSignedUpload: createDocumentSignedUpload,
  createSignedReadUrl: createDocumentSignedReadUrl,
  download: downloadDocument,
  remove: removeDocument,
};

/**
 * La UNICA bifurcacion por entorno del modulo, repetida para sus tres puertos externos y vigilada
 * por `tests/guards/guard-dobles-e2e.test.ts`: sin la variable puesta se elige el adaptador REAL,
 * siempre.
 *
 * Se consulta EN CADA LLAMADA, no al construir estas fachadas, por el mismo motivo que el resto de
 * la configuracion de este archivo: importar `lib/composition` no lee ni una variable de entorno.
 */
function selectedDocumentStorage(): DocumentStorage {
  return documentsE2EDoublesEnabled() ? documentStorageMemory : documentStorageSupabase;
}

const documentStorage: DocumentStorage = {
  createSignedUpload: (path) => selectedDocumentStorage().createSignedUpload(path),
  createSignedReadUrl: (path, expiresInSeconds) =>
    selectedDocumentStorage().createSignedReadUrl(path, expiresInSeconds),
  download: (path) => selectedDocumentStorage().download(path),
  remove: (path) => selectedDocumentStorage().remove(path),
};

/**
 * `PdfConverter` cableado con el adaptador que es el UNICO archivo del repositorio que importa la
 * libreria de PDF. Tampoco se invoca nada aqui: el par nativo de rasterizado se carga dentro de
 * `renderPages`, de modo que cablear esta fachada no carga ningun binario.
 */
const pdfConverter: PdfConverter = {
  countPages,
  extractText: extractPdfText,
  renderPages,
};

/**
 * `AiReader` cableado con el adaptador de Claude; el de Gemini se conserva sin cablear como
 * futuro respaldo. La clave del objeto es la del PUERTO
 * (`read`) y el valor, la funcion del adaptador (`readWithAnthropic`) —se llaman distinto a
 * proposito, igual que `documentStorage` y `pdfConverter` arriba—. Aqui no se invoca nada,
 * solo se referencia, asi que construir esta fachada no lee ninguna variable de entorno ni
 * toca la red: la suite entera arranca sin claves de IA.
 */
const aiReader: AiReader = {
  read: (request) =>
    documentsE2EDoublesEnabled() ? readCannedText(request) : readWithAnthropic(request),
};

/**
 * La lectura con IA, construida UNA vez: la publica la fachada y la reutiliza el procesamiento por
 * estrategia. Dos construcciones serian dos cableados que pueden divergir.
 */
const readPdfWithAi = createReadPdfWithAi({ ai: aiReader, converter: pdfConverter });

/** `StrategyRunLog` cableado con la unica implementacion que hay: una linea en el registro. */
const strategyRunLog: StrategyRunLog = createStrategyRunLogConsole();

/**
 * `StrategyPrompt` cableado con el adaptador que lee el texto del entorno. Se REFERENCIA, no
 * se invoca: construir esta fachada no lee ninguna variable.
 */
const strategyPrompt: StrategyPrompt = { promptFor: readStrategyPromptFromEnv };

/**
 * El procesamiento por estrategia, construido UNA vez: lo usa la fachada de abajo y lo necesita
 * `runDocumentJob`. Dos construcciones serian dos cableados que pueden divergir.
 */
const processPdfByStrategy = createProcessPdfByStrategy({
  readPdfWithAi,
  countPages: pdfConverter.countPages,
  log: strategyRunLog,
  prompt: strategyPrompt,
});

// ---------------------------------------------------------------------------------------
// `documentos` — el procesamiento en cola. Bloque nuevo dentro del mismo modulo, no reordena nada
// de lo de arriba: la firma, la cola y la persistencia de la tanda se atan aqui y solo aqui.
//
// El puerto `QueueSignature` NO envuelve ningun caso de uso: verificar una firma no comprueba
// permiso ni empresa, y es la unica autorizacion del webhook, asi que se publica tal cual
// -- mismo criterio que `documentStorage` de arriba, un objeto que cumple el puerto y nada mas.
// ---------------------------------------------------------------------------------------

const documentBatchRepository: DocumentBatchRepository = documentBatchRepositoryPrisma;
const queueSignature: QueueSignature = queueSignatureQstash;

// ---------------------------------------------------------------------------------------
// `documentos` — el recorte de las imagenes de un catalogo.
// ---------------------------------------------------------------------------------------

/** Se REFERENCIA, no se invoca: cablear esta fachada no toca ningun PNG. */
const imageCropper: ImageCropper = { crop: cropImage };

/** Bucket PROPIO de estos recortes, distinto del de `documentStorage` de arriba. */
const cropStorage: CropStorage = {
  upload: (path, png) =>
    documentsE2EDoublesEnabled() ? cropStorageMemory.upload(path, png) : uploadCrop(path, png),
};

/**
 * `CropCatalog`, la lectura de esos mismos recortes para mostrarlos en la revision. Mismo criterio
 * de bifurcacion que `cropStorage`: se consulta la variable EN CADA LLAMADA.
 */
const cropCatalog: CropCatalog = {
  list: (companyId, documentFileId) =>
    documentsE2EDoublesEnabled()
      ? cropCatalogMemory.list(companyId, documentFileId)
      : listCrops(companyId, documentFileId),
  publicUrl: (path) =>
    documentsE2EDoublesEnabled() ? cropCatalogMemory.publicUrl(path) : cropPublicUrl(path),
};

/** `CropRegionLog` cableado con la unica implementacion que hay: una linea en el registro. */
const cropRegionLog: CropRegionLog = createCropRegionLogConsole();

/** Reutiliza el MISMO `pdfConverter` y el MISMO `aiReader` que ya cablea el resto del modulo. */
const cropCatalogImages = createCropCatalogImages({
  converter: pdfConverter,
  ai: aiReader,
  cropper: imageCropper,
  storage: cropStorage,
  log: cropRegionLog,
});

/**
 * El trabajo de la cola, construido UNA vez: lo publica la fachada y lo necesita la cola en linea,
 * que lo ejecuta en este mismo proceso en vez de publicar nada. Dos construcciones serian dos
 * cableados que pueden divergir.
 */
const documentJobLog: DocumentJobLog = forModule('documentos');

const runDocumentJob = createRunDocumentJob({
  repository: documentBatchRepository,
  storage: documentStorage,
  processPdfByStrategy,
  cropCatalogImages,
  log: documentJobLog,
});

const processingQueue: ProcessingQueue = {
  publish: (message) =>
    documentsE2EDoublesEnabled()
      ? createProcessingQueueInline({ run: runDocumentJob }).publish(message)
      : processingQueueQstash.publish(message),
};

/**
 * `ProcessingConfig` cableado con la lectura de entorno, pero DIFERIDA: cada metodo relee al
 * invocarse, nunca al construir esta fachada, para que importar `lib/composition` sin las
 * variables de la cola configuradas siga funcionando.
 */
const processingConfig: ProcessingConfig = {
  timeoutSeconds: () => readProcessingConfigFromEnv().timeoutSeconds(),
  maxRetries: () => readProcessingConfigFromEnv().maxRetries(),
};

// ---------------------------------------------------------------------------------------
// `documentos` — la vista previa y la confirmacion de una importacion de catalogo.
//
// `SupplierCatalogImportRepository` cableado con el adaptador driven DE PROVEEDORES: las dos
// operaciones son de uso EXCLUSIVO de esta importacion (findAliveByIdentity/importLines viven en
// `CatalogImportDeps`, no en la fachada `proveedores`), asi que se cablean aqui, en el bloque de
// `documentos`, y no junto al resto de `proveedores` mas arriba.
// ---------------------------------------------------------------------------------------

const supplierCatalogImportRepository: SupplierCatalogImportRepository = {
  findAliveByIdentities: findAliveCatalogLinesByIdentities,
  upsertCostByIdentity: upsertCatalogLinesByIdentity,
};

/**
 * `CatalogImportDeps`, compartido por la vista previa y la confirmacion (un solo tipo, para que
 * no haya dos copias que puedan divergir). `createPresentation` es el MISMO caso de uso que ya
 * cablea `inventario` mas arriba -dos construcciones serian dos cableados que pueden divergir-, y
 * `presentations`/`units` son los MISMOS catalogos que ya usa `recetas`.
 */
const catalogImportDeps: CatalogImportDeps = {
  repository: documentBatchRepository,
  crops: cropCatalog,
  presentations: presentationCatalog,
  createPresentation: inventario.createPresentation,
  units: unitCatalog,
  catalog: {
    findAliveByIdentity: createFindCatalogLinesByIdentity({ catalog: supplierCatalogImportRepository }),
    importLines: createImportCatalogLines({ catalog: supplierCatalogImportRepository }),
  },
};

const previewCatalogImport = createPreviewCatalogImport(catalogImportDeps);
const confirmCatalogImport = createConfirmCatalogImport(catalogImportDeps);

/**
 * Compartido por la vista previa y la confirmacion de una importacion de formula.
 * `recipeCatalog` y `productCatalog` son los MISMOS que ya usan `recetas` y `pedidos`
 * mas arriba -dos instancias del mismo puerto serian dos cableados que pueden divergir-;
 * `inventario.createRawMaterial`, `recetas.createRecipe` y `recetas.updateRecipe` son los
 * casos de uso ya cableados en sus propias fachadas.
 */
const formulaImportDeps: FormulaImportDeps = {
  repository: documentBatchRepository,
  recipes: recipeCatalog,
  products: productCatalog,
  productNames: productNameLookup,
  createRawMaterial: inventario.createRawMaterial,
  createRecipe: recetas.createRecipe,
  updateRecipe: recetas.updateRecipe,
};

const previewFormulaImport = createPreviewFormulaImport(formulaImportDeps);
const confirmFormulaImport = createConfirmFormulaImport(formulaImportDeps);

/**
 * Fachada del modulo `documentos` ya cableada. Es lo que consume su Server Action.
 *
 * El ACTOR NO se resuelve aqui, mismo criterio que el resto de modulos: cada caso de uso lo recibe
 * por parametro, y quien lo obtiene de las dos caras de la sesion es el adaptador driving.
 * `lib/composition` no conoce cookies ni sesion; solo ata puerto -> adaptador.
 *
 * El RELOJ de la emision se inyecta aqui, REAL y explicito: `IssueUploadLinksDeps` lo declara
 * opcional con `() => new Date()` por defecto, y dejarlo sin cablear haria que el unico lector del
 * reloj del modulo fuera un defecto silencioso dentro del dominio. Este es el unico sitio que puede
 * darselo; el defecto queda para los tests que no lo inyectan.
 *
 * `convertPdfs` NO recibe actor ni reloj: la frontera de autorizacion es la emision de enlaces, y
 * quien convierte es el trabajo que procesa una tanda ya admitida.
 *
 * `runDocumentJob` tampoco recibe actor: no hay usuario delante, y su ambito de empresa sale
 * del `claim` sobre la propia fila.
 */
export const documentos = {
  issueUploadLinks: createIssueUploadLinks({
    storage: documentStorage,
    now: () => new Date(),
  }),
  convertPdfs: createConvertPdfs({ converter: pdfConverter }),
  // Las DOS operaciones de LECTURA salen por aqui como CASOS DE USO, no como las funciones del
  // puerto: reciben el actor, comprueban que la ruta cae bajo su empresa y solo entonces llaman al
  // almacenamiento. Cablear el puerto a pelo dejaria leer y descargar por ruta sin esa comprobacion,
  // que es justo lo que no puede existir cuando el aislamiento entre empresas ES la ruta.
  //
  // El plazo de la firma de lectura NO se cablea aqui: lo pone el caso de uso desde la definicion
  // unica del modulo. Tampoco se invoca ninguna de las dos: construir esta fachada sigue sin leer
  // una variable ni tocar la red.
  issueReadLink: createIssueReadLink({ storage: documentStorage }),
  downloadDocument: createDownloadDocument({ storage: documentStorage }),
  readPdfWithAi,
  // El procesamiento por estrategia recibe la LECTURA ya construida, no el puerto de IA: el plazo y
  // el tope de paginas son de ella. `countPages` es solo para el resumen que se registra. Tampoco
  // recibe actor, por el mismo motivo que `convertPdfs`.
  processPdfByStrategy,
  // Las TRES capacidades nuevas del procesamiento en cola. `enqueueBatch` es la unica que recibe
  // actor -- lo construye el adaptador driving con las dos caras de la sesion --, y las otras dos
  // ninguna: `runDocumentJob` porque no hay usuario delante, y `queueSignature` porque verificar
  // una firma no es un caso de uso del dominio.
  enqueueBatch: createEnqueueBatch({ repository: documentBatchRepository, queue: processingQueue }),
  runDocumentJob,
  getBatchStatus: createGetBatchStatus({
    repository: documentBatchRepository,
    config: processingConfig,
  }),
  queueSignature,
  // Las DOS operaciones nuevas de la revision de catalogo, ya cableadas con `catalogImportDeps`
  // de arriba. Claves NUEVAS al final: ninguna de las de arriba se toca.
  previewCatalogImport,
  confirmCatalogImport,
  // Las DOS operaciones de la revision de formula, ya cableadas con
  // `formulaImportDeps` de arriba. Claves NUEVAS al final, mismo criterio.
  previewFormulaImport,
  confirmFormulaImport,
} as const;

// ---------------------------------------------------------------------------------------
// `clientes`. Bloque nuevo al final: no reordena ni reformatea nada de lo de arriba.
// ---------------------------------------------------------------------------------------

/** La MISMA implementacion de `lib/shared/observability`, vista por el puerto que declara
 *  `clientes`. */
const clientesListQueryLog: ClientesListQueryLog = { ignoredFields: logIgnoredListQueryFields };

const customerRepository: CustomerRepository = {
  create: createCustomer,
  findAliveById: findAliveCustomerById,
  updateAlive: updateAliveCustomer,
  softDeleteAlive: softDeleteAliveCustomer,
  listAlive: listAliveCustomers,
};

/**
 * Fachada del modulo `clientes` ya cableada. Es lo que consume la Server Action.
 *
 * El ACTOR NO se resuelve aqui, mismo criterio que el resto de modulos: cada caso de uso lo
 * recibe por parametro, y quien lo obtiene de las dos caras de la sesion es la Server Action.
 */
export const clientes = {
  createCustomer: createCreateCustomer({ customers: customerRepository }),
  updateCustomer: createUpdateCustomer({ customers: customerRepository }),
  deleteCustomer: createDeleteCustomer({ customers: customerRepository }),
  getCustomer: createGetCustomer({ customers: customerRepository }),
  listCustomers: createListCustomers({ customers: customerRepository, log: clientesListQueryLog }),
} as const;
