/**
 * La vista previa de una importacion de catalogo: interpreta (o reclasifica), clasifica cada fila,
 * empareja o respeta su imagen y firma lo que hace falta para mostrar. Nunca escribe nada.
 *
 * Pasos, en este orden -abrir la revision no puede filtrar si un archivo existe, esta en otra
 * empresa o su tanda no es de catalogo, asi que los cuatro casos dan el mismo rechazo-:
 *   1. Permiso, antes de leer nada.
 *   2. Leer el archivo (mismo rechazo si no existe, no esta listo o su tanda no es catalogo).
 *   3. Interpretar el texto de la IA solo si no llegan filas ya revisadas; si llegan, son esas
 *      las que se reclasifican y la interpretacion no se repite.
 *   4. Resolver presentaciones y lineas vivas por identidad, para clasificar y para mostrar el
 *      costo actual de una fila que cambia.
 *   5. Listar y firmar los recortes del archivo, para el selector de imagen.
 *   6. Clasificar y emparejar o respetar la imagen de cada fila: por pagina si no hay filas
 *      editadas; si las hay, la imagen es la que trae la fila solo si es un recorte real de este
 *      archivo y empresa (rechazar la confirmacion por una imagen ajena es cosa de la confirmacion,
 *      no de esta vista previa).
 *
 * `createPresentation` e `importLines` viven en `CatalogImportDeps` porque la confirmacion
 * comparte el mismo tipo de dependencias; esta funcion no los toca.
 *
 * La sugerencia de unidad de una presentacion nueva es una funcion pura aparte que la pantalla
 * llama con la lista de unidades que ya carga; por eso esta vista previa publica el texto de
 * unidad leido, no un identificador ya elegido.
 */
import { requirePermission, DOCUMENT_UPLOAD_PERMISSION, type Actor } from './actor';
import { extractCatalogFromText, type ExtractedLine } from './catalog-extraction';
import { previewCatalogImportInputSchema, type ReviewedLineInput } from './catalog-import-input';
import {
  classifyCatalogImportRows,
  type AliveCatalogLine,
  type ClassifiedLine,
  type ClassifyRowInput,
  type PresentationMatch,
} from './classify-catalog-import';
import { pairCropsWithLines, type CropPairingRow } from './crop-pairing';
import { isCropPathOf } from './document-path';
import { ValidationError } from './errors';
import { READ_LINK_TTL_SECONDS } from './limits';

import type { CropCatalog } from '../ports/crop-catalog';
import type { DocumentBatchRepository } from '../ports/document-batch-repository';

import {
  createFindCatalogLinesByIdentity,
  createImportCatalogLines,
  normalizeSupplierName,
} from '@/lib/modules/proveedores';
import {
  createCreatePresentation,
  normalizePresentationName,
  type PresentationCatalog,
} from '@/lib/modules/inventario';
import type { UnitCatalog } from '@/lib/modules/unidades';

/** El caso de uso de `proveedores` ya construido, no su fabrica: quien lo cablea es
 *  `lib/composition` (T14), nunca este modulo. */
type FindAliveCatalogLinesByIdentity = ReturnType<typeof createFindCatalogLinesByIdentity>;
/** Idem para la escritura por identidad: `confirm-catalog-import.ts` (T10) es quien la invoca. */
type ImportCatalogLines = ReturnType<typeof createImportCatalogLines>;
/** Idem para el alta de presentacion de `inventario`: tambien de uso exclusivo de T10. */
type CreatePresentation = ReturnType<typeof createCreatePresentation>;

/** Dependencias compartidas por la vista previa y la confirmacion: un solo tipo para que no haya
 *  dos copias que puedan divergir. */
export type CatalogImportDeps = {
  readonly repository: DocumentBatchRepository;
  readonly crops: CropCatalog;
  readonly presentations: PresentationCatalog;
  readonly createPresentation: CreatePresentation;
  readonly units: UnitCatalog;
  readonly catalog: {
    readonly findAliveByIdentity: FindAliveCatalogLinesByIdentity;
    readonly importLines: ImportCatalogLines;
  };
  readonly now?: () => Date;
};

export type CatalogImportPreviewCrop = { readonly path: string; readonly url: string };

/** Una presentacion nueva vista una sola vez, aunque la nombren varias filas. */
export type CatalogImportNewPresentation = {
  readonly presentation: string;
  /** La unidad tal como la leyo la IA, o `null` si la fila viene de una edicion del revisor. */
  readonly readUnit: string | null;
};

export type CatalogImportPreviewRow = {
  readonly kind: ClassifiedLine['kind'];
  readonly invalidFields: readonly string[];
  readonly name: string | null;
  readonly presentation: string | null;
  readonly presentationId: string | null;
  readonly readUnit: string | null;
  readonly cost: string | null;
  readonly currentCost: string | null;
  readonly newCost: string | null;
  readonly minPurchase: string | null;
  readonly deliveryTime: number | null;
  readonly material: string | null;
  readonly measurements: unknown;
  readonly imagePath: string | null;
  readonly imageUrl: string | null;
};

export type CatalogImportPreview = {
  readonly rows: readonly CatalogImportPreviewRow[];
  readonly crops: readonly CatalogImportPreviewCrop[];
  readonly newPresentations: readonly CatalogImportNewPresentation[];
};

/** Una fila ya reducida a la forma comun entre lo extraido y lo revisado, para que el resto de
 *  esta funcion no distinga su origen. */
type PreviewRow = {
  readonly name: string | null;
  readonly presentation: string | null;
  readonly readUnit: string | null;
  readonly cost: string | null;
  readonly minPurchase: string | null;
  readonly deliveryTime: number | null;
  readonly material: string | null;
  readonly measurements: unknown;
  /** Solo tiene sentido para filas extraidas: es la clave del emparejamiento por pagina. */
  readonly page: number | null;
  /** Solo tiene sentido para filas revisadas: la imagen que trae la fila, sin validar todavia. */
  readonly requestedImagePath: string | null;
};

function fromExtractedLine(line: ExtractedLine): PreviewRow {
  return {
    name: line.name,
    presentation: line.presentation,
    readUnit: line.unit,
    cost: line.cost,
    minPurchase: line.minPurchase,
    deliveryTime: line.deliveryTime,
    material: line.material,
    measurements: line.measurements,
    page: line.page,
    requestedImagePath: null,
  };
}

function fromReviewedLine(line: ReviewedLineInput): PreviewRow {
  return {
    name: line.name,
    presentation: line.presentation,
    readUnit: null,
    cost: line.cost,
    minPurchase: line.minPurchase,
    deliveryTime: line.deliveryTime,
    material: line.material,
    measurements: line.measurements,
    page: null,
    requestedImagePath: line.imagePath,
  };
}

function toClassifyRow(row: PreviewRow): ClassifyRowInput {
  return {
    name: row.name,
    presentation: row.presentation,
    cost: row.cost,
    minPurchase: row.minPurchase,
    deliveryTime: row.deliveryTime,
    material: row.material,
    measurements: row.measurements,
  };
}

/** Los nombres de presentacion normalizados y sin repetir de todas las filas, para una sola
 *  llamada a `findByNormalizedNames` (que ya exige nombres normalizados, no crudos). */
function distinctNormalizedPresentationNames(rows: readonly PreviewRow[]): readonly string[] {
  const names = new Set<string>();
  for (const row of rows) {
    if (typeof row.presentation !== 'string') continue;
    const normalized = normalizePresentationName(row.presentation);
    if (normalized !== '') names.add(normalized);
  }
  return [...names];
}

/** Las claves de identidad -nombre normalizado y presentacion resuelta- de las filas que tienen
 *  las dos cosas, sin repetir: son las que hace falta preguntar por su linea viva. Una fila sin
 *  nombre o sin presentacion resuelta no aporta ninguna clave, porque va a clasificar como
 *  incompleta o nueva sin necesitar esta consulta. */
function distinctIdentityKeys(
  rows: readonly PreviewRow[],
  presentations: readonly PresentationMatch[],
): readonly { nameNormalized: string; presentationId: string }[] {
  const byNormalizedName = new Map(presentations.map((match) => [match.nameNormalized, match]));
  const keys = new Map<string, { nameNormalized: string; presentationId: string }>();
  for (const row of rows) {
    if (typeof row.name !== 'string' || typeof row.presentation !== 'string') continue;
    const nameNormalized = normalizeSupplierName(row.name);
    if (nameNormalized === '') continue;
    const match = byNormalizedName.get(normalizePresentationName(row.presentation));
    if (match === undefined) continue;
    keys.set(`${nameNormalized}::${match.id}`, { nameNormalized, presentationId: match.id });
  }
  return [...keys.values()];
}

/** La imagen que trae una fila revisada, o ninguna si no es un recorte real de esta empresa y
 *  este archivo, o si ya no esta en la lista vigente de recortes. */
function resolveRequestedImagePath(
  requestedImagePath: string | null,
  cropPaths: readonly string[],
  companyId: string,
  documentFileId: string,
): string | null {
  if (requestedImagePath === null) return null;
  if (!isCropPathOf(requestedImagePath, companyId, documentFileId)) return null;
  return cropPaths.includes(requestedImagePath) ? requestedImagePath : null;
}

/** Las presentaciones nuevas -sin resolver a ninguna existente- vistas una sola vez, emparejadas
 *  con la unidad que se leyo la primera vez que aparecieron. */
function distinctNewPresentations(
  rows: readonly PreviewRow[],
  classified: readonly ClassifiedLine[],
): readonly CatalogImportNewPresentation[] {
  const byNormalizedName = new Map<string, CatalogImportNewPresentation>();
  rows.forEach((row, index) => {
    const line = classified[index];
    if (line === undefined || line.kind !== 'nueva' || line.presentationId !== null) return;
    if (typeof row.presentation !== 'string') return;
    const key = normalizePresentationName(row.presentation);
    if (key === '' || byNormalizedName.has(key)) return;
    byNormalizedName.set(key, { presentation: row.presentation, readUnit: row.readUnit });
  });
  return [...byNormalizedName.values()];
}

function toPreviewRow(
  row: PreviewRow,
  classified: ClassifiedLine,
  imagePath: string | null,
  imageUrl: string | null,
): CatalogImportPreviewRow {
  return {
    kind: classified.kind,
    invalidFields: classified.invalidFields,
    name: row.name,
    presentation: row.presentation,
    presentationId: classified.presentationId,
    readUnit: row.readUnit,
    cost: row.cost,
    currentCost: classified.currentCost,
    newCost: classified.newCost,
    minPurchase: row.minPurchase,
    deliveryTime: row.deliveryTime,
    material: row.material,
    measurements: row.measurements,
    imagePath,
    imageUrl,
  };
}

export function createPreviewCatalogImport(
  deps: CatalogImportDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<CatalogImportPreview> {
  return async function previewCatalogImport(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<CatalogImportPreview> {
    requirePermission(actor, DOCUMENT_UPLOAD_PERMISSION);

    const parsed = previewCatalogImportInputSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { supplierId, documentFileId, lines } = parsed.data;

    const file = await deps.repository.readFileForReview(documentFileId, actor.companyId);
    if (file === null || file.status !== 'done' || file.strategy !== 'catalogo') {
      throw new ValidationError();
    }

    const rows: readonly PreviewRow[] =
      lines === undefined
        ? extractCatalogFromText(file.extractedText ?? '').lines.map(fromExtractedLine)
        : lines.map(fromReviewedLine);

    // `findAliveByIdentity` propaga el proveedor no encontrado sin que esta funcion lo compruebe aparte.
    const presentationNames = distinctNormalizedPresentationNames(rows);
    const presentationsFound =
      presentationNames.length === 0
        ? []
        : await deps.presentations.findByNormalizedNames(presentationNames, actor.companyId);
    const presentationMatches: readonly PresentationMatch[] = presentationsFound.map((found) => ({
      id: found.id,
      nameNormalized: found.nameNormalized,
    }));

    const identityKeys = distinctIdentityKeys(rows, presentationMatches);
    const aliveByIdentity = await deps.catalog.findAliveByIdentity({ supplierId, keys: identityKeys }, actor);
    const aliveLines: readonly AliveCatalogLine[] = aliveByIdentity.map((line) => ({
      nameNormalized: line.nameNormalized,
      presentationId: line.presentationId,
      cost: line.cost,
    }));

    const classified = classifyCatalogImportRows(rows.map(toClassifyRow), presentationMatches, aliveLines);

    const cropPaths = await deps.crops.list(actor.companyId, documentFileId);
    const crops: readonly CatalogImportPreviewCrop[] = await Promise.all(
      cropPaths.map(async (path) => ({ path, url: await deps.crops.createSignedReadUrl(path, READ_LINK_TTL_SECONDS) })),
    );
    const cropUrlByPath = new Map(crops.map((crop) => [crop.path, crop.url]));

    // 6. Emparejar por pagina (sin `lines`) o respetar la imagen de la fila (con `lines`).
    const imagePaths: readonly (string | null)[] =
      lines === undefined
        ? pairCropsWithLines(
            rows.map((row): CropPairingRow => ({ page: row.page })),
            cropPaths,
          )
        : rows.map((row) =>
            resolveRequestedImagePath(row.requestedImagePath, cropPaths, actor.companyId, documentFileId),
          );

    const previewRows = rows.map((row, index) => {
      const imagePath = imagePaths[index] ?? null;
      const imageUrl = imagePath === null ? null : cropUrlByPath.get(imagePath) ?? null;
      return toPreviewRow(row, classified[index] as ClassifiedLine, imagePath, imageUrl);
    });

    return {
      rows: previewRows,
      crops,
      newPresentations: distinctNewPresentations(rows, classified),
    };
  };
}
