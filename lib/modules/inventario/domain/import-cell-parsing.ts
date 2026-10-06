import { IMPORT_TYPE_LABELS, type ImportRowType } from './inventory-import-contract';

export type ImportCellOrigin = 'text' | 'number' | 'date';

export type ParsedImportDecimal =
  | { readonly kind: 'empty' }
  | { readonly kind: 'value'; readonly value: string }
  | { readonly kind: 'number_format_invalid' };

export type ParsedImportDate =
  | { readonly kind: 'empty' }
  | { readonly kind: 'value'; readonly value: string }
  | { readonly kind: 'invalid' };

export type ParsedImportPurchaseDate =
  | { readonly kind: 'value'; readonly value: string }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'future' };

const MAX_DECIMALS = 4;
const DECIMAL_SEPARATORS = /[.,]/g;
const GROUPED_DIGITS = /\d[\s  ']\d/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_FIRST_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeHeader(header: string): string {
  return foldText(header);
}

const TYPE_BY_LABEL = new Map<string, ImportRowType>(
  (Object.entries(IMPORT_TYPE_LABELS) as [ImportRowType, string][]).map(([type, label]) => [
    foldText(label),
    type,
  ]),
);

export function parseImportType(text: string): ImportRowType | null {
  return TYPE_BY_LABEL.get(foldText(text)) ?? null;
}

/**
 * Un solo separador decimal, coma o punto, y ninguno de miles: `1.234` con dos convenciones en
 * juego se leeria como mil o como uno segun quien lo escribio. Lo que no es un numero sale como
 * valor y lo rechaza el esquema del alta manual con el motivo de su columna.
 */
export function parseImportDecimal(text: string, origin: ImportCellOrigin = 'text'): ParsedImportDecimal {
  const trimmed = text.trim();
  if (trimmed === '') return { kind: 'empty' };

  const separators = trimmed.match(DECIMAL_SEPARATORS)?.length ?? 0;
  if (separators > 1 || GROUPED_DIGITS.test(trimmed)) return { kind: 'number_format_invalid' };

  const value = trimmed.replace(',', '.');
  // Un numero nativo de la hoja con mas decimales de los que guarda la base se redondearia sin aviso.
  if (origin === 'number' && (value.split('.')[1]?.length ?? 0) > MAX_DECIMALS) {
    return { kind: 'number_format_invalid' };
  }
  return { kind: 'value', value };
}

/**
 * `Date.UTC` desborda un dia fuera de rango (`2026-02-30` -> 2 de marzo) en vez de rechazarlo, y lee
 * los años `0000`-`0099` como 1900-1999: si las partes no vuelven iguales, la fecha no existe.
 */
function isCalendarDay(year: number, month: number, day: number): boolean {
  const instant = new Date(Date.UTC(year, month - 1, day));
  return (
    instant.getUTCFullYear() === year &&
    instant.getUTCMonth() === month - 1 &&
    instant.getUTCDate() === day
  );
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

export function parseImportDate(text: string): ParsedImportDate {
  const trimmed = text.trim();
  if (trimmed === '') return { kind: 'empty' };

  const iso = ISO_DATE.exec(trimmed);
  const dayFirst = iso ? null : DAY_FIRST_DATE.exec(trimmed);
  const parts = iso
    ? { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
    : dayFirst
      ? { year: Number(dayFirst[3]), month: Number(dayFirst[2]), day: Number(dayFirst[1]) }
      : null;

  if (parts === null || !isCalendarDay(parts.year, parts.month, parts.day)) return { kind: 'invalid' };
  return { kind: 'value', value: `${pad(parts.year, 4)}-${pad(parts.month, 2)}-${pad(parts.day, 2)}` };
}

/** Vacia vale hoy, igual que en el alta manual. `today` es `AAAA-MM-DD`, asi que se comparan como texto. */
export function parseImportPurchaseDate(text: string, today: string): ParsedImportPurchaseDate {
  const parsed = parseImportDate(text);
  if (parsed.kind === 'empty') return { kind: 'value', value: today };
  if (parsed.kind === 'invalid') return parsed;
  return parsed.value > today ? { kind: 'future' } : parsed;
}
