import type { UnitId } from './unit-catalog';

/** Nombre normalizado de la unidad de sistema con la que se cuentan los envases. La siembra
 *  la migracion `packaging_products_in_distribution`. */
export const PACKAGE_UNIT_NAME = 'unidad';

/** Lo implementa un adaptador driven de `unidades` y lo cablea `lib/composition`. */
export interface PackageUnitSource {
  /** Id de la unidad de sistema de envases, o `null` si no esta sembrada o no es base. */
  findPackageUnitId(): Promise<UnitId | null>;
}
