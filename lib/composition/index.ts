// lib/composition/index.ts — PUNTO UNICO DE COMPOSICION.
// Aqui, y solo aqui, se elige QUE implementacion concreta cumple cada puerto.
// Prohibido importar adaptadores driving desde aqui: la flecha va driving -> composicion (R12).
import {
  createCredentialPolicy,
  createResolveSessionUser,
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
import type { PresentationRepository } from '@/lib/modules/inventario/ports/presentation-repository';
import type { ProductRepository } from '@/lib/modules/inventario/ports/product-repository';
import type { ProductCatalog } from '@/lib/modules/inventario';
import { findUnitRefs } from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma';
import { listUnits } from '@/lib/modules/unidades/adapters/driven/persistence/unit-prisma';
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
import type { RecipeImageStorage } from '@/lib/modules/recetas/ports/recipe-image-storage';
import type { RecipeRepository } from '@/lib/modules/recetas/ports/recipe-repository';
import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

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
const sessionProvider: SessionProvider = {
  getSessionUser: createResolveSessionUser({ session: sessionReader, users: sessionUserReader }),
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
  listProducts: createListProducts({ products: productRepository }),
  createPresentation: createCreatePresentation({ presentations: presentationRepository }),
  updatePresentation: createUpdatePresentation({ presentations: presentationRepository }),
  deletePresentation: createDeletePresentation({ presentations: presentationRepository }),
  listPresentations: createListPresentations({ presentations: presentationRepository }),
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
// `unidades` (QC-26, T6). Bloque nuevo, separado a proposito: no reordena ni reformatea
// nada de lo existente arriba -diff minimo, hay otras sesiones tocando este mismo
// archivo en paralelo-.
// ---------------------------------------------------------------------------------------

/** `UnitRepository` cableado con el adaptador driven DE UNIDADES (`design.md > 9`,
 *  R40): el caso de uso de listado solo conoce el TIPO `UnitRepository`, nunca esta
 *  implementacion. */
const unitRepository: UnitRepository = { listAll: listUnits };

/** Fachada del modulo `unidades` ya cableada (R40-R42). Es lo que consume la Server
 *  Action de listado (`adapters/driving/unit-actions.ts`). */
export const unidades = {
  listUnits: createListUnits({ units: unitRepository }),
} as const;
