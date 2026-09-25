// El doble de IA del recorrido de extremo a extremo: devuelve coordenadas de recorte cuando el
// prompt es el del recorte, el texto de formula cuando todas las partes son `pdf`, y el catalogo
// en cualquier otro caso. Todo el archivo es dominio puro sobre los textos exportados.

import { describe, expect, it } from 'vitest';

import {
  CANNED_CATALOG_CHANGES_LINE_NAME,
  CANNED_CATALOG_CHANGES_NEW_COST,
  CANNED_CATALOG_CHANGES_PRESENTATION,
  CANNED_CATALOG_NEW_LINE_NAME,
  CANNED_CATALOG_NEW_PRESENTATION,
  CANNED_CATALOG_NEW_UNIT_READ,
  CANNED_CATALOG_TEXT,
  CANNED_CROP_COORDINATES_TEXT,
  CANNED_FORMULA_EXISTING_PRODUCT_NAME,
  CANNED_FORMULA_MISSING_PERCENTAGE,
  CANNED_FORMULA_NEW_INGREDIENT_NAME,
  CANNED_FORMULA_NEW_INGREDIENT_PERCENTAGE,
  CANNED_FORMULA_PRESELECTED_PERCENTAGE,
  CANNED_FORMULA_RECIPE_NAME,
  CANNED_FORMULA_TEXT,
  CANNED_FORMULA_UNASSIGNED_QUANTITY,
  CANNED_FORMULA_UNASSIGNED_UNIT,
  readCannedText,
} from '@/lib/modules/documentos/adapters/driven/ai/ai-reader-canned';
import { extractCatalogFromText } from '@/lib/modules/documentos/domain/catalog-extraction';
import { extractCropCoordinates } from '@/lib/modules/documentos/domain/crop-coordinates';
import { CROP_COORDINATES_PROMPT } from '@/lib/modules/documentos/domain/crop-prompt';
import { extractFormulaFromText } from '@/lib/modules/documentos/domain/formula-extraction';

import type { AiDocumentPart } from '@/lib/modules/documentos/ports/ai-reader';

function request(prompt: string, parts: readonly AiDocumentPart[] = []) {
  return { prompt, parts, timeoutMs: 1000 };
}

const pdfPart: AiDocumentPart = { kind: 'pdf', bytes: new Uint8Array() };
const imagePart: AiDocumentPart = { kind: 'image', png: new Uint8Array(), pageNumber: 1 };

describe('documentos — el doble de IA de guion (R38, design.md > 9)', () => {
  it('con el prompt del recorte devuelve coordenadas que `extractCropCoordinates` acepta', async () => {
    const texto = await readCannedText(request(CROP_COORDINATES_PROMPT));
    expect(texto).toBe(CANNED_CROP_COORDINATES_TEXT);

    const coordenadas = extractCropCoordinates(texto, 'empresa-1/archivo-1.pdf');
    expect(coordenadas.images.length).toBeGreaterThan(0);
    expect(coordenadas.images.every((region) => region.page === 1)).toBe(true);
  });

  it('con partes `image` devuelve el catalogo que `extractCatalogFromText` interpreta entero', async () => {
    const texto = await readCannedText(request('cualquier otro prompt', [imagePart]));
    expect(texto).toBe(CANNED_CATALOG_TEXT);

    const extraccion = extractCatalogFromText(texto);
    expect(extraccion.lines.length).toBeGreaterThan(0);
    expect(extraccion.lines.every((line) => line.page === 1)).toBe(true);

    const nueva = extraccion.lines.find((line) => line.name === CANNED_CATALOG_NEW_LINE_NAME);
    expect(nueva?.presentation).toBe(CANNED_CATALOG_NEW_PRESENTATION);
    expect(nueva?.unit).toBe(CANNED_CATALOG_NEW_UNIT_READ);
    expect(nueva?.material).not.toBeNull();
    expect(nueva?.measurements).not.toBeNull();

    const cambia = extraccion.lines.find((line) => line.name === CANNED_CATALOG_CHANGES_LINE_NAME);
    expect(cambia?.presentation).toBe(CANNED_CATALOG_CHANGES_PRESENTATION);
    expect(cambia?.cost).toBe(CANNED_CATALOG_CHANGES_NEW_COST);
  });

  it('con partes solo `pdf` devuelve el texto de formula que `extractFormulaFromText` interpreta entero', async () => {
    const texto = await readCannedText(request('cualquier prompt, no se mira', [pdfPart]));
    expect(texto).toBe(CANNED_FORMULA_TEXT);

    const extraccion = extractFormulaFromText(texto);
    expect(extraccion.name).toBe(CANNED_FORMULA_RECIPE_NAME);
    expect(extraccion.ingredients).toHaveLength(3);

    const preseleccionado = extraccion.ingredients.find(
      (ingredient) => ingredient.name === CANNED_FORMULA_EXISTING_PRODUCT_NAME,
    );
    expect(preseleccionado?.percentage).toBe(CANNED_FORMULA_PRESELECTED_PERCENTAGE);

    const nueva = extraccion.ingredients.find((ingredient) => ingredient.name === CANNED_FORMULA_NEW_INGREDIENT_NAME);
    expect(nueva?.percentage).toBe(CANNED_FORMULA_NEW_INGREDIENT_PERCENTAGE);

    const sinPorcentaje = extraccion.ingredients.find((ingredient) => ingredient.name === null);
    expect(sinPorcentaje?.percentage).toBeNull();
    expect(sinPorcentaje?.quantity).toBe(CANNED_FORMULA_UNASSIGNED_QUANTITY);
    expect(sinPorcentaje?.unit).toBe(CANNED_FORMULA_UNASSIGNED_UNIT);

    const sumaConocida =
      Number(CANNED_FORMULA_PRESELECTED_PERCENTAGE) + Number(CANNED_FORMULA_NEW_INGREDIENT_PERCENTAGE);
    expect(sumaConocida + Number(CANNED_FORMULA_MISSING_PERCENTAGE)).toBe(100);

    expect(extraccion.steps).toHaveLength(3);
    expect(extraccion.steps[1].blocks).toHaveLength(2);
  });

  it('con el prompt del recorte pero SIN partes `pdf` sigue devolviendo coordenadas (el prompt manda primero)', async () => {
    const texto = await readCannedText(request(CROP_COORDINATES_PROMPT, [pdfPart]));
    expect(texto).toBe(CANNED_CROP_COORDINATES_TEXT);
  });

  it('el numero de lineas de la pagina 1 coincide con el numero de regiones de la pagina 1 (emparejamiento univoco)', async () => {
    const textoCatalogo = await readCannedText(request('otro prompt', [imagePart]));
    const textoRecorte = await readCannedText(request(CROP_COORDINATES_PROMPT));

    const lineasPagina1 = extractCatalogFromText(textoCatalogo).lines.filter((line) => line.page === 1);
    const regionesPagina1 = extractCropCoordinates(textoRecorte, 'empresa-1/archivo-1.pdf').images.filter(
      (region) => region.page === 1,
    );

    expect(lineasPagina1.length).toBe(regionesPagina1.length);
  });

  it('los tres textos son JSON puro: `JSON.parse` directo, sin recortar nada antes (R36, R37)', () => {
    expect(() => JSON.parse(CANNED_CROP_COORDINATES_TEXT)).not.toThrow();
    expect(() => JSON.parse(CANNED_CATALOG_TEXT)).not.toThrow();
    expect(() => JSON.parse(CANNED_FORMULA_TEXT)).not.toThrow();
  });
});
