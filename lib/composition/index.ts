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
  createProduct,
  findAliveProductById,
  listAliveProducts,
  softDeleteAliveProduct,
  updateAliveProduct,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import {
  createPresentation,
  deletePresentationById,
  listPresentations,
  renamePresentation,
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
import type { ListQueryLog as UnidadesListQueryLog } from '@/lib/modules/unidades/ports/list-query-log';
import type { UnitRepository } from '@/lib/modules/unidades/ports/unit-repository';
import { createListUnits, type UnitCatalog } from '@/lib/modules/unidades';
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
};

const presentationRepository: PresentationRepository = {
  create: createPresentation,
  rename: renamePresentation,
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

/** Fachada del modulo `unidades` ya cableada (R40-R42). Es lo que consume la Server
 *  Action de listado (`adapters/driving/unit-actions.ts`). */
export const unidades = {
  listUnits: createListUnits({ units: unitRepository, log: unidadesListQueryLog }),} as const;


// ---------------------------------------------------------------------------------------
// `pedidos` (QC-34, T14, `design.md > 9`). Bloque NUEVO al final, mismo criterio que los de
// `recetas`, `proveedores` y `unidades`: no reordena ni reformatea NADA de lo de arriba
// -diff minimo, hay varias sesiones tocando este archivo-. Sus imports viven al final del
// bloque de imports, arriba.
//
// `unitCatalog` NO se vuelve a construir: se REUTILIZA la constante que QC-25 ya dejo
// cableada mas arriba (`design.md > 6.3`). Dos instancias del mismo puerto serian dos
// cableados que pueden divergir, y `unidades` no necesita ninguna ampliacion porque `units`
// no tiene borrado logico (QC-32 decision 11).
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
 * `cancelOrder` y `deleteOrder` reciben SOLO el repositorio: ninguno de los dos toca receta
 * ni unidad, y darles catalogos que no usan seria cablear una dependencia falsa.
 */
export const pedidos = {
  createOrder: createCreateOrder({
    orders: orderRepository,
    recipes: recipeCatalog,
    units: unitCatalog,
  }),
  getOrder: createGetOrder({
    orders: orderRepository,
    recipes: recipeCatalog,
    units: unitCatalog,
  }),
  listOrders: createListOrders({
    orders: orderRepository,
    recipes: recipeCatalog,
    units: unitCatalog,
    log: pedidosListQueryLog,
  }),
  updateOrder: createUpdateOrder({
    orders: orderRepository,
    recipes: recipeCatalog,
    units: unitCatalog,
  }),
  cancelOrder: createCancelOrder({ orders: orderRepository }),
  deleteOrder: createDeleteOrder({ orders: orderRepository }),
} as const;
