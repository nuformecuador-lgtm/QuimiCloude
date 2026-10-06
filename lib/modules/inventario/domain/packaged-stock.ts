// Dominio PURO: sin base de datos, sin framework, sin reloj. Cantidades como texto y aritmetica en
// `BigInt` escalado a cuatro decimales, como `decimal-quantity.ts`.

import type { UnitId } from '@/lib/modules/unidades';

const SCALE = 4;
const ZERO = BigInt(0);

const DECIMAL_PATTERN = /^-?\d+(?:\.\d{1,4})?$/;

/** Un lote de un producto terminado, con lo que su asiento `production` dice del pedido. */
export type PackagedStockBatch = {
  /** Existencia actual del lote, en la unidad de su presentacion. */
  readonly stock: string;
  /** Contenido de un envase con el que entro el lote; `null` si no se guardo. */
  readonly packageContent: string | null;
  /** Envases de la linea del reparto que origino el lote; `null` si el lote no viene de una. */
  readonly orderedPackages: number | null;
  readonly presentationName: string | null;
  readonly presentationUnitId: UnitId | null;
};

export type PackagedStockEntry = {
  readonly name: string;
  /** Envases enteros, como entero en texto. */
  readonly packages: string;
  /** Lo que no llena un envase, en `unitId`, sin ceros sobrantes; `null` si es cero. */
  readonly remainder: string | null;
  readonly unitId: UnitId;
};

function toScaled(raw: string): bigint {
  if (!DECIMAL_PATTERN.test(raw)) {
    throw new Error(`packaged-stock: no es un decimal valido: ${JSON.stringify(raw)}`);
  }
  const [whole = '', fraction = ''] = raw.split('.');
  return BigInt(whole + fraction.padEnd(SCALE, '0'));
}

function toCanonical(scaled: bigint): string {
  const digits = scaled.toString().padStart(SCALE + 1, '0');
  const cut = digits.length - SCALE;
  const fraction = digits.slice(cut).replace(/0+$/u, '');
  return fraction === '' ? digits.slice(0, cut) : `${digits.slice(0, cut)}.${fraction}`;
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Contenido por envase escalado, o `null` si el lote no trae linea del reparto con contenido. */
function orderedContent(batch: PackagedStockBatch): bigint | null {
  if (batch.orderedPackages === null || batch.packageContent === null) return null;
  const content = toScaled(batch.packageContent);
  return content > ZERO ? content : null;
}

type Group = { name: string; unitId: UnitId; packages: bigint; remainder: bigint };

/**
 * Existencia de un producto terminado contada en los envases de su pedido. Por lote con stock:
 * `envases = min(pedidos, floor(stock / contenido))`, y todo lo demas -tambien lo que exceda lo
 * pedido- va a `remainder`. Un lote sin linea del reparto o sin contenido aporta todo su stock
 * como resto, en la entrada de su presentacion. Se agrupa por nombre y unidad y se ordena por
 * nombre y luego unidad, comparando codigos para no depender del ICU del entorno.
 *
 * `undefined` si ningun lote con stock viene de una linea con contenido, o si alguno no tiene
 * presentacion: sin nombre al que asignar ese stock, la lista lo esconderia.
 */
export function summarizePackagedStock(
  batches: readonly PackagedStockBatch[],
): readonly PackagedStockEntry[] | undefined {
  const alive = batches.filter((batch) => toScaled(batch.stock) > ZERO);
  if (alive.some((batch) => batch.presentationName === null || batch.presentationUnitId === null)) return undefined;
  if (!alive.some((batch) => orderedContent(batch) !== null)) return undefined;

  const groups = new Map<string, Group>();
  for (const batch of alive) {
    const name = batch.presentationName ?? '';
    const unitId = batch.presentationUnitId ?? '';
    const stock = toScaled(batch.stock);
    const content = orderedContent(batch);

    let packages = ZERO;
    if (content !== null) {
      const fitting = stock / content;
      const ordered = BigInt(Math.max(batch.orderedPackages ?? 0, 0));
      packages = fitting < ordered ? fitting : ordered;
    }
    const remainder = stock - packages * (content ?? ZERO);

    const key = JSON.stringify([name, unitId]);
    const group = groups.get(key) ?? { name, unitId, packages: ZERO, remainder: ZERO };
    group.packages += packages;
    group.remainder += remainder;
    groups.set(key, group);
  }

  return [...groups.values()]
    .sort((a, b) => compareText(a.name, b.name) || compareText(a.unitId, b.unitId))
    .map((group) => ({
      name: group.name,
      packages: group.packages.toString(),
      remainder: group.remainder === ZERO ? null : toCanonical(group.remainder),
      unitId: group.unitId,
    }));
}
