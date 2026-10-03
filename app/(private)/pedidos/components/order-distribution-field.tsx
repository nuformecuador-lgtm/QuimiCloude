'use client';

import { CircleAlertIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { useId, useState } from 'react';

import {
  PresentationSelect,
  type PresentationOption,
} from '@/components/shared/presentation-select';
import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UNEXPECTED_ERROR_CODE } from '@/lib/modules/errores';
import type { UnitConversion } from '@/lib/modules/unidades';
import {
  ORDER_DISTRIBUTION_PACKAGES_FIELD,
  ORDER_DISTRIBUTION_PRESENTATION_FIELD,
} from '@/lib/modules/pedidos';
import { formatDecimalDisplay, trimDecimal } from '@/lib/shared/ui/decimal-display';

import { MISSING_VALUE_MARK } from './order-columns';
import { lineCoverage, type LineCoverage } from './order-distribution-coverage';
import type {
  OrderDistributionAvailability,
  OrderDistributionLine,
} from './use-order-distribution-availability';
import { useSavedPresentationContents } from './use-saved-line-contents';

export { ORDER_DISTRIBUTION_PACKAGES_FIELD, ORDER_DISTRIBUTION_PRESENTATION_FIELD };

export const ORDER_DISTRIBUTION_TESTID = 'order-distribution-field';
export const ORDER_DISTRIBUTION_LINE_TESTID = 'order-distribution-line';
export const ORDER_DISTRIBUTION_LINE_PACKAGES_TESTID = 'order-distribution-line-packages';
export const ORDER_DISTRIBUTION_LINE_REMOVE_TESTID = 'order-distribution-line-remove';
export const ORDER_DISTRIBUTION_LINE_COVERAGE_TESTID = 'order-distribution-line-coverage';
export const ORDER_DISTRIBUTION_LINE_PROBLEM_TESTID = 'order-distribution-line-problem';
export const ORDER_DISTRIBUTION_ADD_PACKAGES_TESTID = 'order-distribution-add-packages';
export const ORDER_DISTRIBUTION_ADD_TESTID = 'order-distribution-add';
export const ORDER_DISTRIBUTION_AVAILABLE_TESTID = 'order-distribution-available';
export const ORDER_DISTRIBUTION_WARNING_TESTID = 'order-distribution-warning';
export const ORDER_DISTRIBUTION_WITHOUT_UNIT_TESTID = 'order-distribution-without-unit';
export const ORDER_DISTRIBUTION_ERROR_TESTID = 'order-distribution-error';

const TOUCH_TARGET = 'min-h-11 min-w-11';
const FIELD_TEXT = 'text-base md:text-base';

/** Cuatro decimales: la conversion entre unidades puede dejar fracciones que dos esconderian. */
const AVAILABLE_DIGITS = 4;
const PERCENT_DIGITS = 2;

const POSITIVE_INTEGER = /^[1-9]\d*$/;

const LABELS = {
  title: 'Reparto en presentaciones',
  packages: 'Envases',
  add: 'Añadir',
  remove: 'Quitar',
  available: 'Disponible',
  covers: 'Cubre',
  quoting: 'calculando…',
  withoutUnit: 'Elige la unidad del pedido para repartirlo en presentaciones.',
  exceeds: 'El reparto pasa de la cantidad del pedido. Quita envases para poder guardar.',
  incompatible: 'La unidad de esta presentación no se puede convertir a la del pedido.',
  withoutContent: 'Esta presentación no tiene contenido.',
  incompatibleSummary: 'Hay una línea con una unidad que no se puede convertir a la del pedido.',
  withoutContentSummary: 'Hay una línea cuya presentación no tiene contenido.',
  unitNotFound: 'La unidad del pedido ya no está disponible. Elige otra.',
  presentationNotFound: 'Una de las presentaciones ya no está disponible. Quítala del reparto.',
  duplicate: 'Esa presentación ya está en el reparto.',
} as const;

export type OrderDistributionFieldProps = {
  readonly lines: readonly OrderDistributionLine[];
  readonly onLinesChange: (lines: readonly OrderDistributionLine[]) => void;
  /** Unidad del pedido. Cadena vacia = sin unidad: no se puede repartir. */
  readonly unitId: string;
  /** Unidades convertibles con la del pedido: el selector solo ofrece presentaciones en ellas.
   *  Ausente = sin filtro. */
  readonly compatibleUnitIds?: readonly string[];
  /** Simbolo o nombre de la unidad del pedido, para el disponible. */
  readonly unitLabel: string | null;
  /** Cantidad del pedido, para el porcentaje que cubre cada linea. */
  readonly quantity?: string;
  /** Catalogo de unidades, para llevar lo que cubre cada linea a la unidad del pedido.
   *  Ausente = las lineas no muestran lo que cubren. */
  readonly units?: readonly UnitConversion[];
  /** Lo devuelve `useOrderDistributionAvailability`; el anfitrion lo usa tambien para Guardar. */
  readonly availability: OrderDistributionAvailability;
  readonly error?: string;
  /** `true` = las lineas viajan en el `FormData` del formulario anfitrion. */
  readonly submitLines?: boolean;
};

function lineProblem(
  availability: OrderDistributionAvailability,
  presentationId: string,
): string | null {
  if (availability.status !== 'ready') return null;
  const { data } = availability;
  if (data.kind === 'incompatible_units' && data.presentationId === presentationId) {
    return LABELS.incompatible;
  }
  if (data.kind === 'presentation_without_content' && data.presentationId === presentationId) {
    return LABELS.withoutContent;
  }
  return null;
}

/** Disponible para pintar. El signo se fuerza: un redondeo a cero no puede esconder que se paso. */
function formatAvailable(raw: string): string {
  const shown = formatDecimalDisplay(raw, AVAILABLE_DIGITS);
  return raw.startsWith('-') && !shown.startsWith('-') ? `-${shown}` : shown;
}

function formatCoverage(coverage: LineCoverage, unitLabel: string | null): string {
  const amount = `${formatAvailable(coverage.amount)}${unitLabel === null ? '' : ` ${unitLabel}`}`;
  return coverage.percent === null
    ? amount
    : `${amount} · ${formatDecimalDisplay(coverage.percent, PERCENT_DIGITS)}%`;
}

/**
 * Reparto de la cantidad del pedido en presentaciones: lineas con presentacion y envases, alta de
 * lineas y el disponible en la unidad del pedido. Controlado: las lineas y el disponible los
 * gobierna el anfitrion, que decide como se guardan.
 */
export function OrderDistributionField({
  lines,
  onLinesChange,
  unitId,
  compatibleUnitIds,
  unitLabel,
  quantity = '',
  units = [],
  availability,
  error,
  submitLines = false,
}: OrderDistributionFieldProps) {
  const savedContents = useSavedPresentationContents(lines);
  const titleId = useId();
  const errorId = useId();
  const [pending, setPending] = useState<PresentationOption | null>(null);
  const [pendingPackages, setPendingPackages] = useState('1');
  const [pickerKey, setPickerKey] = useState(0);
  const [pickerUnitId, setPickerUnitId] = useState(unitId);

  // Lo elegido con la unidad anterior puede no convertir a la nueva: se descarta.
  if (pickerUnitId !== unitId) {
    setPickerUnitId(unitId);
    setPending(null);
  }

  const withoutUnit = unitId === '';
  const duplicate = pending !== null && lines.some((line) => line.presentationId === pending.id);
  const canAdd =
    !withoutUnit &&
    pending !== null &&
    pending.content !== null &&
    !duplicate &&
    POSITIVE_INTEGER.test(pendingPackages);

  function addLine() {
    if (!canAdd || pending === null) return;
    onLinesChange([
      ...lines,
      {
        presentationId: pending.id,
        presentationName: pending.name,
        packages: pendingPackages,
        content: pending.content,
        unitId: pending.unitId,
      },
    ]);
    setPending(null);
    setPendingPackages('1');
    setPickerKey((key) => key + 1);
  }

  function changePackages(index: number, packages: string) {
    onLinesChange(lines.map((line, i) => (i === index ? { ...line, packages } : line)));
  }

  function removeLine(index: number) {
    onLinesChange(lines.filter((_, i) => i !== index));
  }

  return (
    <div
      role="group"
      aria-labelledby={titleId}
      aria-describedby={error === undefined ? undefined : errorId}
      className="flex flex-col gap-3"
      data-testid={ORDER_DISTRIBUTION_TESTID}
    >
      <span id={titleId} className="text-sm font-medium">
        {LABELS.title}
      </span>

      {lines.length === 0 ? null : (
        <ul className="flex flex-col gap-2">
          {lines.map((line, index) => {
            const problem = lineProblem(availability, line.presentationId);
            const name = line.presentationName ?? MISSING_VALUE_MARK;
            const coverage = withoutUnit
              ? null
              : lineCoverage({
                  packages: line.packages,
                  presentation:
                    line.unitId === null
                      ? savedContents.get(line.presentationId)
                      : { content: line.content, unitId: line.unitId },
                  unitId,
                  quantity,
                  units,
                });
            return (
              <li
                key={line.presentationId}
                className="flex flex-col gap-1 rounded-lg border p-2 data-[problem=true]:border-destructive"
                data-testid={ORDER_DISTRIBUTION_LINE_TESTID}
                data-presentation-id={line.presentationId}
                data-problem={problem === null ? undefined : 'true'}
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={line.packages}
                    onChange={(event) => changePackages(index, event.target.value)}
                    aria-label={`${LABELS.packages} · ${name}`}
                    aria-invalid={
                      problem !== null || !POSITIVE_INTEGER.test(line.packages) ? true : undefined
                    }
                    className={`w-24 ${TOUCH_TARGET} ${FIELD_TEXT}`}
                    data-testid={ORDER_DISTRIBUTION_LINE_PACKAGES_TESTID}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={TOUCH_TARGET}
                    aria-label={`${LABELS.remove} · ${name}`}
                    onClick={() => removeLine(index)}
                    data-testid={ORDER_DISTRIBUTION_LINE_REMOVE_TESTID}
                  >
                    <TrashIcon aria-hidden />
                  </Button>
                </div>
                {coverage === null ? null : (
                  <p
                    className="text-sm text-muted-foreground"
                    data-testid={ORDER_DISTRIBUTION_LINE_COVERAGE_TESTID}
                  >
                    <span className="sr-only">{LABELS.covers} </span>
                    {formatCoverage(coverage, unitLabel)}
                  </p>
                )}
                {problem === null ? null : (
                  <p
                    className="flex items-center gap-1 text-sm text-destructive"
                    data-testid={ORDER_DISTRIBUTION_LINE_PROBLEM_TESTID}
                  >
                    <CircleAlertIcon className="size-4" aria-hidden />
                    {problem}
                  </p>
                )}
                {submitLines ? (
                  <>
                    <input
                      type="hidden"
                      name={ORDER_DISTRIBUTION_PRESENTATION_FIELD}
                      value={line.presentationId}
                    />
                    <input
                      type="hidden"
                      name={ORDER_DISTRIBUTION_PACKAGES_FIELD}
                      value={line.packages}
                    />
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {withoutUnit ? (
        <p
          role="status"
          className="flex items-center gap-1 text-sm text-muted-foreground"
          data-testid={ORDER_DISTRIBUTION_WITHOUT_UNIT_TESTID}
        >
          <CircleAlertIcon className="size-4" aria-hidden />
          {LABELS.withoutUnit}
        </p>
      ) : (
        <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-12">
          <div className="sm:col-span-8">
            <PresentationSelect
              key={`${unitId}:${pickerKey}`}
              name={null}
              requireContent
              unitIds={compatibleUnitIds}
              onSelect={setPending}
            />
          </div>
          <div className="flex items-end gap-2 sm:col-span-4">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={pendingPackages}
              onChange={(event) => setPendingPackages(event.target.value)}
              aria-label={LABELS.packages}
              className={`w-24 ${TOUCH_TARGET} ${FIELD_TEXT}`}
              data-testid={ORDER_DISTRIBUTION_ADD_PACKAGES_TESTID}
            />
            <Button
              type="button"
              variant="outline"
              className={TOUCH_TARGET}
              disabled={!canAdd}
              onClick={addLine}
              data-testid={ORDER_DISTRIBUTION_ADD_TESTID}
            >
              <PlusIcon aria-hidden />
              {LABELS.add}
            </Button>
          </div>
          {duplicate ? (
            <p className="text-sm text-destructive sm:col-span-12">{LABELS.duplicate}</p>
          ) : null}
        </div>
      )}

      {withoutUnit ? null : (
        <DistributionAvailable availability={availability} unitLabel={unitLabel} />
      )}

      {error === undefined ? null : (
        <p id={errorId} className="text-sm text-destructive" data-testid={ORDER_DISTRIBUTION_ERROR_TESTID}>
          {error}
        </p>
      )}
    </div>
  );
}

function DistributionAvailable({
  availability,
  unitLabel,
}: {
  readonly availability: OrderDistributionAvailability;
  readonly unitLabel: string | null;
}) {
  const available =
    availability.status === 'ready' &&
    (availability.data.kind === 'ok' || availability.data.kind === 'exceeds_quantity')
      ? availability.data.available
      : null;
  const negative = available !== null && available.startsWith('-');

  return (
    <div className="flex flex-col gap-1 text-sm" aria-busy={availability.status === 'quoting'}>
      <div role="status" aria-live="polite" className="flex items-center gap-1.5">
        <span className="font-medium">{LABELS.available}:</span>
        <span
          className={negative ? 'font-semibold text-destructive' : undefined}
          title={available === null ? undefined : trimDecimal(available)}
          data-testid={ORDER_DISTRIBUTION_AVAILABLE_TESTID}
          data-state={availability.status}
          data-negative={negative ? 'true' : undefined}
        >
          {availability.status === 'quoting'
            ? LABELS.quoting
            : available === null
              ? MISSING_VALUE_MARK
              : `${formatAvailable(available)}${unitLabel === null ? '' : ` ${unitLabel}`}`}
        </span>
      </div>
      <AvailabilityWarning availability={availability} />
    </div>
  );
}

function AvailabilityWarning({
  availability,
}: {
  readonly availability: OrderDistributionAvailability;
}) {
  if (availability.status === 'error') {
    return (
      <div role="alert" className="text-destructive" data-testid={ORDER_DISTRIBUTION_WARNING_TESTID}>
        {availability.error.code === UNEXPECTED_ERROR_CODE ? (
          <UnexpectedErrorNotice state={availability.error} />
        ) : (
          <p>{availability.error.message}</p>
        )}
      </div>
    );
  }
  if (availability.status !== 'ready') return null;

  const message = {
    ok: null,
    exceeds_quantity: LABELS.exceeds,
    incompatible_units: LABELS.incompatibleSummary,
    presentation_without_content: LABELS.withoutContentSummary,
    without_unit: LABELS.withoutUnit,
    unit_not_found: LABELS.unitNotFound,
    presentation_not_found: LABELS.presentationNotFound,
  }[availability.data.kind];
  if (message === null) return null;

  return (
    <p
      role="alert"
      className="flex items-center gap-1 text-destructive"
      data-testid={ORDER_DISTRIBUTION_WARNING_TESTID}
      data-kind={availability.data.kind}
    >
      <CircleAlertIcon className="size-4" aria-hidden />
      {message}
    </p>
  );
}
