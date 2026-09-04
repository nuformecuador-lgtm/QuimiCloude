'use client';

import { useEffect, useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import type { DateRange } from 'react-day-picker';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

import type { DataTableFilterValue, DataTableTexts } from './data-table-types';

/**
 * Filtro de rango de fechas con atajos (`design.md > 6.1`, T9, R18).
 *
 * El calendario es **controlado**: `selected` sale de `value` (la forma canonica
 * `DataTableFilterValue` de `kind: 'dateRange'`) y cada cambio -manual o por atajo- se emite por
 * `onChange` con la MISMA forma que cualquier otro filtro (R16).
 *
 * **Sin `date-fns`**: los tres atajos se calculan con aritmetica nativa de `Date` (ver
 * `computeDateShortcutRange`, funcion pura y exportada para poder probarla sin montar nada).
 */

const TOUCH_TARGET = 'min-h-11 min-w-11';

/** Ancho de viewport (px) a partir del cual el calendario pinta dos meses (`design.md > 6.1`). */
const WIDE_CALENDAR_BREAKPOINT = 768;

const NARROW_CALENDAR_MONTHS = 1;
const WIDE_CALENDAR_MONTHS = 2;

/** Los tres atajos que R18 exige, mas alla de lo que trae la libreria (decision 6). */
export type DateShortcutKind = 'lastWeek' | 'lastMonth' | 'lastYear';

/** Ultimo dia del mes indicado: el dia 0 del mes SIGUIENTE es el ultimo del pedido. */
function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Resta meses a una fecha **acotando el dia al ultimo del mes destino**.
 *
 * `setMonth`/`setFullYear` NO valen aqui: desbordan. `new Date(2026, 2, 31).setMonth(1)` es
 * "31 de febrero", que JavaScript normaliza a marzo, asi que el 31 de cualquier mes el atajo
 * devolvia un rango que ni siquiera cubria el mes anterior (el 2026-05-31 daba 2026-05-01, sin
 * un solo dia de abril). Lo mismo con el 29 de febrero de un bisiesto al restar un año.
 *
 * El indice de mes se lleva a una cuenta absoluta antes de repartirlo en año y mes, para que el
 * cruce de año hacia atras no dependa del signo del resto.
 */
function subtractMonthsClamped(date: Date, months: number): Date {
  const absoluteMonth = date.getFullYear() * 12 + date.getMonth() - months;
  const targetYear = Math.floor(absoluteMonth / 12);
  const targetMonth = absoluteMonth - targetYear * 12;
  const day = Math.min(date.getDate(), lastDayOfMonth(targetYear, targetMonth));

  return new Date(targetYear, targetMonth, day);
}

/**
 * Calcula el rango `[from, to]` de un atajo con aritmetica nativa de `Date`. `to` es siempre
 * "hoy" a medianoche local; `from` es el resultado de restarle 7 dias, 1 mes o 1 año a esa misma
 * fecha, ambos inclusive. Funcion pura y exportada para poder probarla sin montar nada.
 *
 * Restar dias con `setDate` si es seguro -desborda al mes anterior, que es justo lo que se
 * quiere-; restar meses o años no lo es, y por eso pasa por `subtractMonthsClamped`.
 */
export function computeDateShortcutRange(
  kind: DateShortcutKind,
  now: Date = new Date(),
): { readonly from: Date; readonly to: Date } {
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (kind === 'lastWeek') {
    const from = new Date(to);
    from.setDate(from.getDate() - 7);
    return { from, to };
  }

  return { from: subtractMonthsClamped(to, kind === 'lastMonth' ? 1 : 12), to };
}

/**
 * Formatea una fecha como `YYYY-MM-DD` en hora LOCAL (`design.md > 3.1`): nunca
 * `toISOString()`, que desplaza por huso horario. Determinista: siempre `getFullYear`/
 * `getMonth`/`getDate` con `padStart`.
 */
export function formatDateLocalISO(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Inverso de `formatDateLocalISO`: construye la fecha en hora local, nunca en UTC. */
function parseDateLocalISO(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** `DataTableFilterValue` (`kind: 'dateRange'`) -> `DateRange` que entiende el calendario. */
function toCalendarRange(
  value: Extract<DataTableFilterValue, { kind: 'dateRange' }> | undefined,
): DateRange | undefined {
  if (value === undefined) return undefined;

  return {
    from: value.from === null ? undefined : parseDateLocalISO(value.from),
    to: value.to === null ? undefined : parseDateLocalISO(value.to),
  };
}

/** `DateRange` del calendario -> `DataTableFilterValue`. `undefined`/sin `from` limpia (R16). */
function toFilterValue(range: DateRange | undefined): DataTableFilterValue | null {
  if (range === undefined || range.from === undefined) return null;

  return {
    kind: 'dateRange',
    from: formatDateLocalISO(range.from),
    to: range.to === undefined ? null : formatDateLocalISO(range.to),
  };
}

/**
 * Elige 1 o 2 meses segun el ancho disponible (`design.md > 6.1`), leido en un efecto -nunca
 * durante el render, igual que `hooks/use-mobile.ts`- para no producir discrepancia de
 * hidratacion. `tests/helpers/viewport.ts` stubea `window.innerWidth` y `matchMedia`.
 */
function useCalendarMonthCount(): number {
  const [months, setMonths] = useState(NARROW_CALENDAR_MONTHS);

  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${WIDE_CALENDAR_BREAKPOINT}px)`);
    const resolve = () => {
      setMonths(
        window.innerWidth >= WIDE_CALENDAR_BREAKPOINT ? WIDE_CALENDAR_MONTHS : NARROW_CALENDAR_MONTHS,
      );
    };
    query.addEventListener('change', resolve);
    resolve();
    return () => query.removeEventListener('change', resolve);
  }, []);

  return months;
}

export type DataTableFilterDateProps = {
  readonly columnId: string;
  readonly label: string;
  readonly value: Extract<DataTableFilterValue, { kind: 'dateRange' }> | undefined;
  readonly texts: DataTableTexts;
  readonly onChange: (next: DataTableFilterValue | null) => void;
};

export function DataTableFilterDate({ columnId, label, value, texts, onChange }: DataTableFilterDateProps) {
  const numberOfMonths = useCalendarMonthCount();
  const selectedRange = toCalendarRange(value);

  const applyShortcut = (kind: DateShortcutKind) => {
    const { from, to } = computeDateShortcutRange(kind);
    onChange({ kind: 'dateRange', from: formatDateLocalISO(from), to: formatDateLocalISO(to) });
  };

  return (
    <Popover>
      <PopoverTrigger
        type="button"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 text-sm hover:bg-muted',
          TOUCH_TARGET,
        )}
        data-testid={`data-table-filter-date-${columnId}`}
      >
        <CalendarIcon className="size-4" aria-hidden="true" />
        {label}
      </PopoverTrigger>

      <PopoverContent className="w-auto">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={TOUCH_TARGET}
            data-testid="data-table-date-last-week"
            onClick={() => applyShortcut('lastWeek')}
          >
            {texts.lastWeek}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={TOUCH_TARGET}
            data-testid="data-table-date-last-month"
            onClick={() => applyShortcut('lastMonth')}
          >
            {texts.lastMonth}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={TOUCH_TARGET}
            data-testid="data-table-date-last-year"
            onClick={() => applyShortcut('lastYear')}
          >
            {texts.lastYear}
          </Button>
        </div>

        <Calendar
          mode="range"
          numberOfMonths={numberOfMonths}
          selected={selectedRange}
          onSelect={(range) => onChange(toFilterValue(range))}
        />
      </PopoverContent>
    </Popover>
  );
}
