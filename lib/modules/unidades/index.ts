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
