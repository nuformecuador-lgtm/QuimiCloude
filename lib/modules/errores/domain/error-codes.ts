/**
 * QC-70 (R1, R2, R3) — la lista CERRADA de codigos de error de la aplicacion.
 *
 * El codigo es una palabra estable en minusculas con guion bajo, nunca un numero ni un
 * identificador opaco (R3): siete pantallas deciden por el y en un log se lee tal cual.
 *
 * La lista es una tupla `as const`, asi que `ErrorCode` es la union de sus literales y un
 * codigo que no este aqui NO compila (R2). Anadir un codigo es anadir una linea aqui, su
 * clave en `error-catalog.ts` y su texto en `ERROR_MESSAGES_ES`; olvidar cualquiera de las
 * dos ultimas rompe el typecheck por los `satisfies` de ese archivo.
 *
 * NO contiene `not_found` ni `duplicate_name` (R16): cada caso concreto de «no existe» y de
 * «nombre repetido» tiene el suyo (R17, R18). Tampoco contiene ningun codigo de `identity`
 * (R25): su login devuelve a proposito un mensaje generico que fija QC-7.
 */
export const ERROR_CODES = [
  'unauthorized',
  'invalid_input',
  'unexpected',
  'product_not_found',
  'presentation_not_found',
  'presentation_duplicate_name',
  'presentation_in_use',
  'order_not_found',
  'recipe_not_found',
  'invalid_transition',
  'not_cancellable',
  'not_deletable',
  'duplicate_number',
  'supplier_not_found',
  'catalog_line_not_found',
  'supplier_duplicate_name',
  'duplicate_catalog_line',
  'recipe_duplicate_name',
  'unit_not_found',
  'unit_duplicate_name',
  'duplicate_symbol',
  'system_unit',
  'invalid_derivation',
  'unit_in_use',
  'incompatible_units',
] as const;

/** La union cerrada de los codigos declarados arriba (R2). */
export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * El codigo del error que NO es de dominio (R12): fallo de base, bug, cualquier cosa ajena a
 * las cinco familias. Su mensaje es neutro y el detalle real va al log del servidor (R13, R14).
 *
 * `satisfies` en vez de anotacion: conserva el tipo literal `'unexpected'` y a la vez obliga a
 * que siga estando en `ERROR_CODES`.
 */
export const UNEXPECTED_ERROR_CODE = 'unexpected' satisfies ErrorCode;
