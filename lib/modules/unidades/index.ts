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

// QC-26 (R40-R42): la unica operacion de lectura del catalogo completo, para el
// selector de unidad del formulario de recetas. El contrato NUNCA reexporta la Server
// Action (`adapters/driving/unit-actions.ts`) ni nada con 'use server': eso rompe la
// invariante de que este barrel es importable desde un componente de cliente.
export { createListUnits, MAX_UNITS } from './domain/list-units';
export type { ListUnitsDeps } from './domain/list-units';
export { requireAdmin } from './domain/actor';
export type { Actor } from './domain/actor';
export { UnidadesError, UnauthorizedError, ValidationError } from './domain/errors';

// QC-57 (R27-R29): el listado acepta el contrato generico de consulta y su pagina es OPCIONAL.
// `isUnitPage` es el discriminante en tiempo de ejecucion de `UnitListResult` -sin consulta se
// devuelve el catalogo entero; con `page` o `pageSize`, una `Page<UnitRef>`-. Son SOLO tipos y
// una funcion pura: el barrel no gana nada de servidor por publicarlos, y es lo que QC-39
// necesita para pintar la pantalla sin conocer el adaptador.
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
