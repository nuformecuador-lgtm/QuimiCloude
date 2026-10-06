import Papa from 'papaparse';

import type { SpreadsheetReadResult } from '../../../ports/spreadsheet-reader';

const BOM = '﻿';

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    return text.startsWith(BOM) ? text.slice(BOM.length) : text;
  } catch {
    return null;
  }
}

/**
 * `;` o `,`, el que aparezca en la cabecera fuera de comillas, y `;` si estan los dos. Se fija aqui y
 * no con la deteccion de la libreria, que mira tambien las filas de datos, donde la coma decimal abunda.
 */
export function detectCsvDelimiter(text: string): ';' | ',' {
  let quoted = false;
  let comma = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '\n' || char === '\r')) break;
    else if (!quoted && char === ';') return ';';
    else if (!quoted && char === ',') comma = true;
  }
  return comma ? ',' : ';';
}

export function readCsv(bytes: Uint8Array): SpreadsheetReadResult {
  const text = decodeUtf8(bytes);
  if (text === null) return { kind: 'unreadable' };

  // Las filas en blanco se conservan para que el numero de fila sea el de la hoja.
  const parsed = Papa.parse<string[]>(text, {
    delimiter: detectCsvDelimiter(text),
    header: false,
    skipEmptyLines: false,
  });
  if (parsed.errors.some((error) => error.type === 'Quotes')) return { kind: 'unreadable' };

  return {
    kind: 'ok',
    rows: parsed.data.map((row) => row.map((text) => ({ text, origin: 'text' as const }))),
  };
}
