/**
 * Empareja los recortes de un archivo con las filas de su catalogo, pagina por pagina: la IA que
 * recorta y la que lee el catalogo no comparten indices, asi que la unica pista fiable es la
 * pagina. Dentro de cada pagina se empareja EN ORDEN -fila i con recorte i, recortes ordenados por
 * su `n`- solo si el numero de filas de esa pagina coincide con el numero de recortes de esa
 * pagina; si no coincide, ninguna fila de esa pagina se propone imagen.
 *
 * Dominio puro: solo interpreta la ruta que ya construyo `document-path.ts`.
 */

/** Una fila vista por este emparejamiento: solo importa la pagina que trajo el JSON de catalogo. */
export type CropPairingRow = {
  readonly page: number | null;
};

type ParsedCrop = {
  readonly path: string;
  readonly page: number;
  readonly n: number;
};

const CROP_FILENAME = /\/(\d+)-(\d+)\.png$/;

function parseCrop(path: string): ParsedCrop | null {
  const match = CROP_FILENAME.exec(path);
  if (match === null) return null;
  return { path, page: Number(match[1]), n: Number(match[2]) };
}

/**
 * Devuelve, para cada fila de `rows` (mismo orden y mismo largo), la ruta del recorte propuesto o
 * `null` si no hay ninguno o el emparejamiento de su pagina no es univoco.
 */
export function pairCropsWithLines(
  rows: readonly CropPairingRow[],
  crops: readonly string[],
): readonly (string | null)[] {
  const parsedCrops = crops
    .map(parseCrop)
    .filter((crop): crop is ParsedCrop => crop !== null);

  const cropsByPage = new Map<number, ParsedCrop[]>();
  for (const crop of parsedCrops) {
    const forPage = cropsByPage.get(crop.page) ?? [];
    forPage.push(crop);
    cropsByPage.set(crop.page, forPage);
  }
  for (const forPage of cropsByPage.values()) {
    forPage.sort((a, b) => a.n - b.n);
  }

  const rowIndexesByPage = new Map<number, number[]>();
  rows.forEach((row, index) => {
    if (row.page === null) return;
    const forPage = rowIndexesByPage.get(row.page) ?? [];
    forPage.push(index);
    rowIndexesByPage.set(row.page, forPage);
  });

  const result: (string | null)[] = rows.map(() => null);
  for (const [page, rowIndexes] of rowIndexesByPage) {
    const pageCrops = cropsByPage.get(page) ?? [];
    if (rowIndexes.length !== pageCrops.length) continue;
    rowIndexes.forEach((rowIndex, position) => {
      const crop = pageCrops[position];
      if (crop !== undefined) result[rowIndex] = crop.path;
    });
  }

  return result;
}
