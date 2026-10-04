// lib/modules/unidades/index.ts — CONTRATO PUBLICO del modulo `unidades`.
// Solo reexporta simbolos de ./domain. Debe poder importarse desde un componente de cliente sin
// arrastrar servidor: nada de 'use server', @prisma/client ni next/* en su cierre de imports.
// Los adaptadores driving que traiga QC-38 NO pasan por aqui.
//
// Hoy publica dos cosas y nada mas: la UNICA definicion de la normalizacion del nombre (R4) y
// los tipos con los que otro modulo puede hablar de una unidad sin tocar su tabla (R16, R19).
// El conjunto arrancador YA NO SE PUBLICA: lo insertan cuatro filas de la propia migracion
// (`db/migrations/20260903121404_units_catalog/migration.sql`, R25) y el aparato del seed
// —`STARTER_UNITS`, `createSeedStarterUnits`, su puerto y su adaptador— se retiro el
// 2026-09-03 por decision del humano (R26).
export { normalizeUnitName } from './domain/unit-name';
export type { UnitCatalog, UnitId, UnitRef } from './domain/unit-catalog';
export { PACKAGE_UNIT_NAME } from './domain/package-unit';
export type { PackageUnitSource } from './domain/package-unit';

// QC-26 (R40-R42): la unica operacion de lectura del catalogo completo, para el
// selector de unidad del formulario de recetas. El contrato NUNCA reexporta la Server
// Action (`adapters/driving/unit-actions.ts`) ni nada con 'use server': eso rompe la
// invariante de que este barrel es importable desde un componente de cliente.
export { createListUnits, MAX_UNITS } from './domain/list-units';
export type { ListUnitsDeps } from './domain/list-units';
export { requirePermission } from './domain/actor';
export type { Actor } from './domain/actor';
// QC-76 (R17, R18): el AMBITO de una consulta del catalogo. Tipo puro; lo exige el puerto de
// listado en su firma para que ninguna lectura se ejecute sin la empresa de quien pregunta.
export type { UnitScope } from './domain/unit-scope';
export { UnidadesError, UnauthorizedError, ValidationError } from './domain/errors';
// QC-38 (R30): los seis errores de negocio de las escrituras (alta, edicion y borrado). Mismo
// patron que los tres anteriores: `code` estable, y el adaptador driving los traduce sin mirar
// el texto (`docs/conventions.md > Manejo de errores`).
export {
  UnitNotFoundError,
  SystemUnitError,
  UnitDuplicateNameError,
  DuplicateSymbolError,
  InvalidDerivationError,
  UnitInUseError,
} from './domain/errors';

// QC-38 (R1): los TRES casos de uso de escritura -alta, edicion y borrado-. Solo las fabricas
// y sus tipos de deps: NUNCA una Server Action ('use server' no puede ser alcanzable desde
// este barrel, que un componente de cliente tiene que poder importar).
export { createCreateUnit } from './domain/create-unit';
export type { CreateUnitDeps } from './domain/create-unit';
export { createUpdateUnit } from './domain/update-unit';
export type { UpdateUnitDeps } from './domain/update-unit';
export { createDeleteUnit } from './domain/delete-unit';
export type { DeleteUnitDeps } from './domain/delete-unit';

// QC-76 (R22-R25): la conversion de una cantidad entre dos unidades que comparten unidad base.
// Es dominio PURO —sin base de datos, sin framework y sin estado—, asi que publicarla no
// arrastra nada de servidor al barrel. NADIE la llama todavia (R26, decision cerrada 18): el
// contrato la publica y `inventario`, `recetas` y `pedidos` siguen tratando la unidad como
// anotativa. La escala del resultado cuando la division no termina —12 decimales, truncando—
// vive en `CONVERSION_SCALE`, documentada en `domain/convert-quantity.ts`.
export { convertQuantity } from './domain/convert-quantity';
export type { UnitConversion } from './domain/convert-quantity';
export { IncompatibleUnitsError } from './domain/errors';

// QC-57 (R27-R29): el listado acepta el contrato generico de consulta y su pagina es OPCIONAL.
// `isUnitPage` es el discriminante en tiempo de ejecucion de `UnitListResult` -sin consulta se
// devuelve el catalogo entero; con `page` o `pageSize`, una `Page<UnitRef>`-. Son SOLO tipos y
// una funcion pura: el barrel no gana nada de servidor por publicarlos, y es lo que QC-39
// necesita para pintar la pantalla sin conocer el adaptador.
// QC-39 (R1, R2): la VISTA de unidad, o sea lo que el LISTADO devuelve por cada fila: los tres
// campos de `UnitRef` mas la equivalencia (`baseUnitId`, `factor` como TEXTO decimal) y
// `isSystem`. Es un tipo aparte y NO un `UnitRef` mas gordo: `UnitRef` sigue siendo lo que otro
// modulo sabe de una unidad -y lo que devuelve `UnitCatalog.findRefs`-, y como `UnitView` lo
// extiende, quien esta tipado con `UnitRef` sigue compilando sin estrechar nada (R3, R4).
export type { UnitView } from './domain/unit-view';
export { isUnitPage } from './domain/list-units';
export type { ListUnits, UnitListResult } from './domain/list-units';
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
export { UNIT_QUERYABLE } from './domain/unit-queryable';
