import { STARTER_UNITS } from './starter-units';
import { normalizeUnitName } from './unit-name';

import type { UnitSeedRepository } from '../ports/unit-seed-repository';

/**
 * Caso de uso del seed arrancador (`design.md > 6.2`, R25, R26). Copia literal de la forma
 * de QC-6 (`lib/modules/identity/domain/seed-initial-access.ts`): nada de `upsert`, nada de
 * reescritura — el algoritmo LEE que falta y CREA exactamente eso.
 *
 * Lo que hace idempotente al seed NO es un `upsert`: un `upsert` pisaria un simbolo que
 * alguien haya cambiado a mano y R26 lo prohibe. Lo que lo hace idempotente es la lectura
 * previa por nombre normalizado. El seed NO modifica ninguna unidad existente: ni su
 * nombre, ni su simbolo, ni sus marcas de tiempo.
 *
 * Este archivo no conoce Prisma ni ningun framework: todo entra por el puerto, lo que
 * permite testearlo con dobles y sin base.
 */
export type SeedUnitsOutcome = {
  /** Nombres de las unidades creadas en ESTA corrida. Vacio si ya estaban todas. */
  readonly createdUnits: readonly string[];
};

export type SeedStarterUnitsDeps = {
  readonly repository: UnitSeedRepository;
};

export function createSeedStarterUnits(deps: SeedStarterUnitsDeps) {
  return async function seedStarterUnits(): Promise<SeedUnitsOutcome> {
    const { repository } = deps;

    // 1. Leer estado: de las cinco claves arrancadoras, cuales ya estan en el catalogo.
    // La comparacion va por `name_normalized` (R4), no por `name`.
    const wanted = STARTER_UNITS.map((unit) => ({
      unit,
      nameNormalized: normalizeUnitName(unit.name),
    }));
    const existing = await repository.findExistingNormalizedNames(
      wanted.map((candidate) => candidate.nameNormalized),
    );
    const alreadyThere = new Set(existing);

    // 2. Crear SOLO lo que falta. Ninguna rama toca una unidad existente.
    const createdUnits: string[] = [];
    for (const candidate of wanted) {
      if (alreadyThere.has(candidate.nameNormalized)) continue;
      await repository.createUnit({
        name: candidate.unit.name,
        nameNormalized: candidate.nameNormalized,
        symbol: candidate.unit.symbol,
      });
      // Se anota como presente para que dos claves iguales dentro del conjunto arrancador
      // no se intenten crear dos veces en la misma corrida.
      alreadyThere.add(candidate.nameNormalized);
      createdUnits.push(candidate.unit.name);
    }

    // 3. Devolver el resultado.
    return { createdUnits };
  };
}
