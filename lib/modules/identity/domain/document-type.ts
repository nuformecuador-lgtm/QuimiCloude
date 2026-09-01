/**
 * Tipos de documento de identidad admitidos.
 *
 * El conjunto cerrado vive en la tabla `document_types` y la FK de `users` es quien lo
 * hace cumplir (`design.md > 3`); esto es solo la contrapartida en TypeScript para que
 * las features 3 y 4 no escriban el literal `'CC'` a mano.
 *
 * Anadir un tipo nuevo es un `INSERT` en `document_types`, no un cambio de esquema. Si
 * ademas hace falta referenciarlo desde codigo, se anade aqui su constante y se suma a
 * `DOCUMENT_TYPE_CODES`.
 */
export const DOCUMENT_TYPE_CC = 'CC'

/** Codigos de tipo de documento conocidos por el codigo, no por la base. */
export const DOCUMENT_TYPE_CODES = [DOCUMENT_TYPE_CC] as const

/** Union derivada de `DOCUMENT_TYPE_CODES`: hoy, `'CC'`. */
export type DocumentTypeCode = (typeof DOCUMENT_TYPE_CODES)[number]
