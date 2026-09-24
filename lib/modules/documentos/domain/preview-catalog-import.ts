/**
 * La vista previa de una importacion de catalogo: interpreta (o reclasifica), clasifica cada fila,
 * empareja o respeta su imagen y firma lo que hace falta para MOSTRAR -nunca escribe nada (R8).
 *
 * LOS PASOS, EN ESTE ORDEN, y el orden ES el requisito (`design.md > 5.1`):
 *
 *   1. `requirePermission(actor, DOCUMENT_UPLOAD_PERMISSION)` — PRIMERA LINEA, antes de leer el
 *      archivo, sus recortes o el catalogo (R31).
 *   2. `repository.readFileForReview`: archivo ausente, de otra empresa, no en `done` o de una
 *      tanda que no es `catalogo` dan EL MISMO rechazo (R3), sin decir cual de los cuatro ocurrio.
 *   3. Interpretar el texto de la IA -SOLO si no llegan `lines` ya revisadas-; con `lines`, son
 *      esas las que se reclasifican (R10) y la interpretacion no se repite.
 *   4. Resolver las presentaciones nombradas y las lineas vivas por identidad, para poder
 *      clasificar y para poder MOSTRAR el costo actual de una fila que «cambia» (R9). El caso de
 *      uso de `proveedores` que resuelve las vivas propaga `supplier_not_found` (R4): esta
 *      funcion no lo comprueba aparte, lo deja subir.
 *   5. Listar los recortes del archivo y firmar su lectura, para el selector de imagen (R24) y
 *      para la imagen de cada fila.
 *   6. Clasificar, y emparejar o respetar la imagen de cada fila: emparejando por pagina
 *      (`pairCropsWithLines`) solo cuando NO llegaron `lines` editadas; con `lines`, la imagen es
 *      la que trae la fila SI es un recorte real de este archivo y esta empresa, o ninguna si no
 *      (R24, R25, R26 -aqui solo se descarta la imagen ajena; RECHAZAR la confirmacion entera por
 *      ese motivo es cosa de `confirm-catalog-import.ts`, no de la vista previa).
 *
 * Este caso de uso no toca ningun puerto de ESCRITURA: `createPresentation` e `importLines` viven
 * en `CatalogImportDeps` unicamente porque `confirm-catalog-import.ts` (T10) comparte el mismo
 * tipo de dependencias -y por eso, si alguno de los dos se invocara desde aqui, seria un error de
 * este archivo, no de quien lo cablea.
 *
 * La sugerencia de unidad de una presentacion nueva (R19) NO sale de aqui: es una funcion PURA,
 * `suggestUnitId`, que la pantalla llama con la lista de unidades que ya carga aparte
 * (`design.md > 5.5`, `> 10.1`: R19 no figura entre los requisitos de esta pieza). Por eso
 * `CatalogImportPreview` publica el texto de unidad LEIDO por fila -y, una vez por presentacion
 * nueva- pero ningun identificador de unidad ya elegido.
 *
 * Dominio puro: solo su propio `domain/`, sus `ports/` y los barriles de otros modulos.
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

/**
 * Dependencias COMPARTIDAS por la vista previa y la confirmacion (`design.md > 5.1`): un solo
 * tipo para que T10 no declare una copia que pudiera divergir de esta.
 */
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

/** Una presentacion nueva vista una sola vez, aunque la nombren varias filas (R17). */
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
  /** Solo tiene sentido para filas extraidas: es la clave del emparejamiento por pagina (R25). */
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
 *  las dos cosas, sin repetir: son las que hace falta preguntar por su linea viva (R9). Una fila
 *  sin nombre o sin presentacion resuelta no aporta ninguna clave -va a clasificar como
 *  «incompleta» o «nueva» sin necesitar esta consulta-. */
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
 *  este archivo, o si ya no esta en la lista vigente de recortes (R24, R26). */
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

/** Las presentaciones nuevas -sin resolver a ninguna existente- vistas una sola vez (R17),
 *  emparejadas con la unidad que se leyo la PRIMERA vez que aparecieron. */
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
    // 1. Antes que nada, y sin excepcion (R31).
    requirePermission(actor, DOCUMENT_UPLOAD_PERMISSION);

    const parsed = previewCatalogImportInputSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { supplierId, documentFileId, lines } = parsed.data;

    // 2. Archivo ausente, de otra empresa, no en `done` o de una tanda que no es `catalogo`: EL
    //    MISMO rechazo en los cuatro casos, sin tocar ningun otro puerto (R3).
    const file = await deps.repository.readFileForReview(documentFileId, actor.companyId);
    if (file === null || file.status !== 'done' || file.strategy !== 'catalogo') {
      throw new ValidationError();
    }

    // 3. Interpretar SOLO si no llegan filas ya revisadas (R7, R10).
    const rows: readonly PreviewRow[] =
      lines === undefined
        ? extractCatalogFromText(file.extractedText ?? '').lines.map(fromExtractedLine)
        : lines.map(fromReviewedLine);

    // 4. Presentaciones por nombre y lineas vivas por identidad. `findAliveByIdentity` propaga
    //    `SupplierNotFoundError` (R4) sin que esta funcion tenga que comprobarlo aparte.
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

    // 5. Recortes del archivo, firmados para el selector (R24).
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
