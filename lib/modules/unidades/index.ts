// lib/modules/unidades/index.ts — CONTRATO PUBLICO del modulo `unidades`.
// Solo reexporta simbolos de ./domain. Debe poder importarse desde un componente de cliente sin
// arrastrar servidor: nada de 'use server', @prisma/client ni next/* en su cierre de imports.
// Los adaptadores driving que traiga QC-38 NO pasan por aqui.
export { normalizeUnitName } from './domain/unit-name';
export type { UnitCatalog, UnitId, UnitRef } from './domain/unit-catalog';
export { STARTER_UNITS, type StarterUnit } from './domain/starter-units';
export {
  createSeedStarterUnits,
  type SeedStarterUnitsDeps,
  type SeedUnitsOutcome,
} from './domain/seed-units';
