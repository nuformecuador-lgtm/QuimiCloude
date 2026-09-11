// lib/modules/errores/index.ts — CONTRATO PUBLICO del modulo `errores` (QC-70).
//
// Solo reexporta simbolos de ./domain. El modulo no tiene puertos ni adaptadores y no aporta
// ningun modelo a `db/schema.prisma`: no hay tabla de errores, el catalogo es codigo.
//
// Por que un MODULO y no `lib/shared/`: el `domain/` de los cinco modulos de negocio tiene que
// leer el mensaje al construir el error (R7), y `domain/**` no puede importar `lib/shared/**`
// (`docs/architecture.md > La regla de dependencias`). El barrel de otro modulo si esta
// permitido, desde `domain`, `driven`, `driving` y la UI. Mismo patron con el que QC-54 publica
// `ROLE_ADMINISTRADOR`. Alternativas descartadas, en `design.md > 2.3`.
export { ERROR_CODES, UNEXPECTED_ERROR_CODE } from './domain/error-codes';
export type { ErrorCode } from './domain/error-codes';
export { errorMessage } from './domain/error-message';
export { ERROR_MESSAGE_KEY, ERROR_MESSAGES_ES } from './domain/error-catalog';
export type { ErrorMessageKey } from './domain/error-catalog';
// QC-70 T2 (R10): la UNICA implementacion del traductor de error de dominio a estado
// serializable, y la forma CERRADA de ese estado. Los siete adaptadores driving la consumen
// desde aqui; ninguno vuelve a escribir la suya.
// QC-71 T7 (R7, R9, R16): `ErrorState` pasa a ser una UNION cerrada —el identificador es
// obligatorio en la rama del error inesperado e inexpresable en las catalogadas—, y la fabrica
// recibe la LECTURA de la cabecera como parametro. `RequestIdHeaderReader` es el tipo de esa
// funcion, y se publica para que `lib/composition` pueda tipar el cableado sin que el dominio
// declare ningun puerto nuevo.
export { createErrorStateTranslator } from './domain/error-state';
export type { ErrorState, RequestIdHeaderReader } from './domain/error-state';
