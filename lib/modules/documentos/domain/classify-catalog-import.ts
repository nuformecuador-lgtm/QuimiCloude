/**
 * Clasifica cada fila de una importacion de catalogo en exactamente una clase, comparando su
 * identidad -nombre normalizado del proveedor y presentacion resuelta- contra las presentaciones y
 * las lineas vivas que ya existen en la empresa.
 *
 * La validez de cada campo se decide reutilizando, campo a campo, los esquemas de `proveedores` y
 * `inventario`: ningun patron se reescribe aqui. La comparacion de costo es sobre la cadena decimal,
 * nunca `Number(...)`.
 *
 * Dominio puro: sin base de datos ni framework.
 */

import { createCatalogLineSchema, normalizeSupplierName } from '@/lib/modules/proveedores';
import { createPresentationSchema, normalizePresentationName } from '@/lib/modules/inventario';

export type ClassKind = 'nueva' | 'cambia' | 'sin cambios' | 'incompleta' | 'duplicada';

/** Una fila tal como llega a clasificar: extraida de la IA o editada por el revisor. */
export type ClassifyRowInput = {
  readonly name: string | null;
  readonly presentation: string | null;
  readonly cost: string | null;
  readonly minPurchase: string | null;
  readonly deliveryTime: number | null;
  readonly material: string | null;
  readonly measurements: unknown;
};

/** Una presentacion de la empresa, resuelta por nombre normalizado. */
export type PresentationMatch = {
  readonly id: string;
  readonly nameNormalized: string;
};

/** Una linea viva del catalogo del proveedor, identificada por nombre normalizado y presentacion. */
export type AliveCatalogLine = {
  readonly nameNormalized: string;
  readonly presentationId: string;
  readonly cost: string;
};

export type ClassifiedLine = {
  readonly kind: ClassKind;
  /** Nombres de los campos invalidos; solo tiene elementos cuando `kind === 'incompleta'`. */
  readonly invalidFields: readonly string[];
  /** Presentacion resuelta, o `null` si el nombre leido no casa con ninguna de la empresa. */
  readonly presentationId: string | null;
  /** Costo de la linea viva, solo presente en «cambia» y «sin cambios». */
  readonly currentCost: string | null;
  /** Costo de la fila, solo presente en «cambia» y «sin cambios». */
  readonly newCost: string | null;
};

/**
 * Un campo por validar y como comprobarlo, reutilizando `createCatalogLineSchema` (`proveedores`)
 * y `createPresentationSchema.shape.name` (`inventario`) campo a campo. El orden es el de la fila: dice
 * que campo esta mal en el orden en que aparece en la fila.
 */
const FIELD_VALIDATORS: ReadonlyArray<{
  readonly field: string;
  readonly isValid: (row: ClassifyRowInput) => boolean;
}> = [
  { field: 'name', isValid: (row) => createCatalogLineSchema.shape.name.safeParse(row.name).success },
  {
    field: 'presentation',
    isValid: (row) => createPresentationSchema.shape.name.safeParse(row.presentation).success,
  },
  { field: 'cost', isValid: (row) => createCatalogLineSchema.shape.cost.safeParse(row.cost).success },
  {
    field: 'minPurchase',
    isValid: (row) => createCatalogLineSchema.shape.minPurchase.safeParse(row.minPurchase).success,
  },
  {
    field: 'deliveryTime',
    isValid: (row) => createCatalogLineSchema.shape.deliveryTime.safeParse(row.deliveryTime).success,
  },
  {
    field: 'material',
    isValid: (row) => createCatalogLineSchema.shape.material.safeParse(row.material).success,
  },
  {
    field: 'measurements',
    isValid: (row) => createCatalogLineSchema.shape.measurements.safeParse(row.measurements).success,
  },
];

function invalidFieldsOf(row: ClassifyRowInput): readonly string[] {
  return FIELD_VALIDATORS.filter(({ isValid }) => !isValid(row)).map(({ field }) => field);
}

/** Cadena de todos ceros: `'0'`, `'0.0'`, `'00.0000'`. Mismo criterio que `catalog-line-input.ts`. */
const ZERO_ONLY = /^0+(\.0*)?$/;

/**
 * Normaliza una cadena decimal quitando ceros de relleno, sin pasar por `Number(...)`: `'12.5'` y
 * `'12.5000'` deben comparar iguales, y una cadena de mas de 15 digitos no cabe en un `number`
 * sin perder precision.
 */
function normalizeDecimal(value: string): string {
  const [integerPart, fractionPart = ''] = value.split('.');
  const integer = integerPart.replace(/^0+(?=\d)/, '');
  const fraction = fractionPart.replace(/0+$/, '');
  return `${integer}.${fraction}`;
}

function sameCost(a: string, b: string): boolean {
  if (ZERO_ONLY.test(a) && ZERO_ONLY.test(b)) return true;
  return normalizeDecimal(a) === normalizeDecimal(b);
}

/**
 * Clasifica todas las filas de un documento a la vez: la deteccion de «duplicada» necesita ver las
 * filas anteriores del MISMO documento, asi que no puede ser una funcion fila a fila.
 */
export function classifyCatalogImportRows(
  rows: readonly ClassifyRowInput[],
  presentations: readonly PresentationMatch[],
  aliveLines: readonly AliveCatalogLine[],
): readonly ClassifiedLine[] {
  const presentationsByName = new Map(presentations.map((p) => [p.nameNormalized, p]));
  const aliveByIdentity = new Map(aliveLines.map((line) => [`${line.nameNormalized}::${line.presentationId}`, line]));
  const seenIdentities = new Set<string>();

  return rows.map((row) => {
    const invalidFields = invalidFieldsOf(row);
    if (invalidFields.length > 0) {
      return { kind: 'incompleta', invalidFields, presentationId: null, currentCost: null, newCost: null };
    }

    const nameNormalized = normalizeSupplierName(row.name as string);
    const presentationNormalized = normalizePresentationName(row.presentation as string);
    const match = presentationsByName.get(presentationNormalized) ?? null;
    const identityKey = `${nameNormalized}::${match !== null ? match.id : `~${presentationNormalized}`}`;

    if (seenIdentities.has(identityKey)) {
      return {
        kind: 'duplicada',
        invalidFields: [],
        presentationId: match?.id ?? null,
        currentCost: null,
        newCost: null,
      };
    }
    seenIdentities.add(identityKey);

    if (match === null) {
      return { kind: 'nueva', invalidFields: [], presentationId: null, currentCost: null, newCost: null };
    }

    const alive = aliveByIdentity.get(`${nameNormalized}::${match.id}`) ?? null;
    if (alive === null) {
      return { kind: 'nueva', invalidFields: [], presentationId: match.id, currentCost: null, newCost: null };
    }

    const rowCost = row.cost as string;
    const kind: ClassKind = sameCost(alive.cost, rowCost) ? 'sin cambios' : 'cambia';
    return { kind, invalidFields: [], presentationId: match.id, currentCost: alive.cost, newCost: rowCost };
  });
}
