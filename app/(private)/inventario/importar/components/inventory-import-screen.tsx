'use client';

import type { UnitView } from '@/lib/modules/unidades';

import { IMPORT_SCREEN_TESTID } from './import-texts';

export type InventoryImportScreenProps = {
  readonly units: readonly UnitView[];
};

export function InventoryImportScreen({ units }: InventoryImportScreenProps) {
  return <section data-testid={IMPORT_SCREEN_TESTID} data-units={units.length} className="flex flex-col gap-4" />;
}
