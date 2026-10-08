import { z } from 'zod';

import {
  PAGE_SIZE_OPTIONS,
  type DataTableFilterValue,
  type DataTableParams,
} from '@/components/shared/data-table';
import type { ExecutionTraceListInput } from '@/lib/modules/asignaciones';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { DASHBOARD_ROUTE, executionTraceRoute } from '@/lib/shared/routes';

export const PAGE_PARAM = 'page';
export const PAGE_SIZE_PARAM = 'pageSize';
export const ORDER_NUMBER_PARAM = 'q';
export const PERSON_PARAM = 'persona';
export const FROM_PARAM = 'desde';
export const TO_PARAM = 'hasta';
export const CANCELLED_PARAM = 'cancelados';
export const CANCELLED_ON_VALUE = '1';

/** El caso de uso rechaza un texto mas largo: recortar aqui evita convertir la URL en un error. */
export const ORDER_NUMBER_MAX_LENGTH = 20;

export const FIRST_PAGE = 1;

export const PERSON_COLUMN_ID = 'persona';
export const LAST_AT_COLUMN_ID = 'lastAt';

export type ExecutionTraceListSearchParams = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

export type ExecutionTraceListParams = {
  readonly page: number;
  readonly pageSize: number;
  /** Vacio = sin filtro. */
  readonly orderNumber: string;
  readonly userId: string | null;
  readonly from: string | null;
  readonly to: string | null;
  readonly cancelledOnly: boolean;
};

const uuidSchema = z.string().uuid();

function firstValue(raw: string | readonly string[] | undefined): string | undefined {
  if (raw === undefined) return undefined;
  return typeof raw === 'string' ? raw : raw[0];
}

function parsePositiveInt(raw: string | undefined): number | undefined {
  if (raw === undefined || !/^\d+$/.test(raw)) return undefined;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : undefined;
}

function isPageSize(value: number): boolean {
  return PAGE_SIZE_OPTIONS.some((option) => option === value);
}

/** `2026-02-30` casa con el patron pero no existe: se descarta igual que el caso de uso. */
function parseCivilDate(raw: string | undefined): string | null {
  if (raw === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw ? raw : null;
}

function parseOrderNumber(raw: string | undefined): string {
  // Recortar tras el `trim` puede dejar un espacio final: se vuelve a hacer `trim`.
  return raw?.trim().slice(0, ORDER_NUMBER_MAX_LENGTH).trim() ?? '';
}

function parsePerson(raw: string | undefined): string | null {
  return raw !== undefined && uuidSchema.safeParse(raw).success ? raw : null;
}

export function createDefaultExecutionTraceListParams(): ExecutionTraceListParams {
  return {
    page: FIRST_PAGE,
    pageSize: DEFAULT_PAGE_SIZE,
    orderNumber: '',
    userId: null,
    from: null,
    to: null,
    cancelledOnly: false,
  };
}

/** Ninguna entrada produce un error: lo que no se reconoce cae a su valor por defecto. */
export function parseExecutionTraceListParams(
  searchParams: ExecutionTraceListSearchParams | undefined,
): ExecutionTraceListParams {
  const rawPage = parsePositiveInt(firstValue(searchParams?.[PAGE_PARAM]));
  const rawPageSize = parsePositiveInt(firstValue(searchParams?.[PAGE_SIZE_PARAM]));

  return {
    page: rawPage === undefined || rawPage < FIRST_PAGE ? FIRST_PAGE : rawPage,
    pageSize: rawPageSize !== undefined && isPageSize(rawPageSize) ? rawPageSize : DEFAULT_PAGE_SIZE,
    orderNumber: parseOrderNumber(firstValue(searchParams?.[ORDER_NUMBER_PARAM])),
    userId: parsePerson(firstValue(searchParams?.[PERSON_PARAM])),
    from: parseCivilDate(firstValue(searchParams?.[FROM_PARAM])),
    to: parseCivilDate(firstValue(searchParams?.[TO_PARAM])),
    cancelledOnly: firstValue(searchParams?.[CANCELLED_PARAM]) === CANCELLED_ON_VALUE,
  };
}

export function buildExecutionTraceListQuery(params: ExecutionTraceListParams): string {
  const query = new URLSearchParams();
  query.set(PAGE_PARAM, String(params.page));
  query.set(PAGE_SIZE_PARAM, String(params.pageSize));
  if (params.orderNumber !== '') query.set(ORDER_NUMBER_PARAM, params.orderNumber);
  if (params.userId !== null) query.set(PERSON_PARAM, params.userId);
  if (params.from !== null) query.set(FROM_PARAM, params.from);
  if (params.to !== null) query.set(TO_PARAM, params.to);
  if (params.cancelledOnly) query.set(CANCELLED_PARAM, CANCELLED_ON_VALUE);
  return query.toString();
}

export function executionTraceListHref(params: ExecutionTraceListParams): string {
  return `${DASHBOARD_ROUTE}?${buildExecutionTraceListQuery(params)}`;
}

/** El detalle lleva la consulta de la lista para que «volver» la recupere. */
export function executionTraceDetailHref(orderId: string, params: ExecutionTraceListParams): string {
  return `${executionTraceRoute(orderId)}?${buildExecutionTraceListQuery(params)}`;
}

function sameFilters(a: ExecutionTraceListParams, b: ExecutionTraceListParams): boolean {
  return (
    a.orderNumber === b.orderNumber &&
    a.userId === b.userId &&
    a.from === b.from &&
    a.to === b.to &&
    a.cancelledOnly === b.cancelledOnly
  );
}

/** Un filtro nuevo es sobre el conjunto completo, no sobre la pagina en la que se estaba. */
export function withFiltersResetPage(
  current: ExecutionTraceListParams,
  next: ExecutionTraceListParams,
): ExecutionTraceListParams {
  return sameFilters(current, next) ? next : { ...next, page: FIRST_PAGE };
}

export function toExecutionTraceListInput(params: ExecutionTraceListParams): ExecutionTraceListInput {
  return {
    page: params.page,
    pageSize: params.pageSize === MAX_PAGE_SIZE ? MAX_PAGE_SIZE : DEFAULT_PAGE_SIZE,
    ...(params.orderNumber === '' ? {} : { orderNumber: params.orderNumber }),
    ...(params.userId === null ? {} : { userId: params.userId }),
    ...(params.from === null ? {} : { from: params.from }),
    ...(params.to === null ? {} : { to: params.to }),
    cancelledOnly: params.cancelledOnly,
  };
}

export function toDataTableParams(params: ExecutionTraceListParams): DataTableParams {
  const filters: Record<string, DataTableFilterValue> = {};
  if (params.userId !== null) filters[PERSON_COLUMN_ID] = { kind: 'select', values: [params.userId] };
  if (params.from !== null || params.to !== null) {
    filters[LAST_AT_COLUMN_ID] = { kind: 'dateRange', from: params.from, to: params.to };
  }
  return { page: params.page, pageSize: params.pageSize, sort: null, filters, search: params.orderNumber };
}

/**
 * El filtro de seleccion de la tabla admite varias personas y el caso de uso solo una: se queda la
 * ultima elegida, que es la que el usuario acaba de marcar.
 */
function personFrom(value: DataTableFilterValue | undefined): string | null {
  if (value?.kind !== 'select' || value.values.length === 0) return null;
  return parsePerson(value.values[value.values.length - 1]);
}

export function fromDataTableParams(
  current: ExecutionTraceListParams,
  next: DataTableParams,
): ExecutionTraceListParams {
  const dates = next.filters[LAST_AT_COLUMN_ID];
  const candidate: ExecutionTraceListParams = {
    page: next.page >= FIRST_PAGE ? next.page : FIRST_PAGE,
    pageSize: isPageSize(next.pageSize) ? next.pageSize : DEFAULT_PAGE_SIZE,
    orderNumber: parseOrderNumber(next.search),
    userId: personFrom(next.filters[PERSON_COLUMN_ID]),
    from: dates?.kind === 'dateRange' ? parseCivilDate(dates.from ?? undefined) : null,
    to: dates?.kind === 'dateRange' ? parseCivilDate(dates.to ?? undefined) : null,
    cancelledOnly: current.cancelledOnly,
  };
  return withFiltersResetPage(current, candidate);
}
