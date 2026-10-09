'use client';

import { CircleAlertIcon } from 'lucide-react';
import { useCallback, useId, useState } from 'react';

import { AsyncAutocomplete } from '@/components/shared/async-autocomplete';
import { ErrorAlert } from '@/components/shared/error-alert';
import type { AsyncPageRequest } from '@/hooks/use-async-paginated-options';
import {
  PRODUCT_PRESENTATION_UNIT_FILTER,
  PRODUCT_TYPES,
  type ProductView,
} from '@/lib/modules/inventario';
import { newRequestId } from '@/lib/modules/observabilidad';
import { listProductsAction } from '@/lib/modules/inventario/adapters/driving/product-actions';
import { errorMessage, UNEXPECTED_ERROR_CODE, type ErrorState } from '@/lib/modules/errores';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { trimDecimal } from '@/lib/shared/ui/decimal-display';
import { touchTarget } from '@/lib/shared/ui/touch-target';

export const PACKAGING_SELECT_TESTID = 'packaging-select';
export const PACKAGING_SELECT_POPUP_TESTID = 'packaging-select-popup';
export const PACKAGING_OPTION_TESTID = 'packaging-option';
export const PACKAGING_OPTION_PRESENTATION_TESTID = 'packaging-option-presentation';
export const PACKAGING_OPTION_AVAILABLE_TESTID = 'packaging-option-available';
export const PACKAGING_SELECT_EMPTY_TESTID = 'packaging-select-empty';
export const PACKAGING_SELECT_LOAD_ERROR_TESTID = 'packaging-select-load-error';
export const PACKAGING_SELECT_FORBIDDEN_TESTID = 'packaging-select-forbidden';

const FIELD_TEXT = 'text-base md:text-base';
const SEARCH_DEBOUNCE_MS = 400;
const MAX_LIST_HEIGHT = 256;
const SCROLL_THRESHOLD = 48;

const LABELS = {
  label: 'Envase',
  placeholder: 'Busca un envase por su nombre',
  clear: 'Borrar envase',
  empty: 'Ningún envase coincide con la búsqueda.',
  loading: 'Cargando envases...',
  forbidden: 'Falta el permiso de consultar inventario: no se pueden elegir envases.',
  available: (count: string) => `Disponible: ${count} envases`,
} as const;

export type PackagingOption = Pick<
  ProductView,
  | 'id'
  | 'name'
  | 'presentationId'
  | 'presentationName'
  | 'presentationContent'
  | 'presentationUnitId'
  | 'available'
>;

export type PackagingSelectProps = {
  /** Unidades convertibles con la del pedido: solo se ofrecen envases cuya presentacion este en ellas. */
  readonly unitIds: readonly string[];
  /** `null` = se retiro lo elegido. */
  readonly onSelect: (option: PackagingOption | null) => void;
  readonly disabled?: boolean;
};

const UNAUTHORIZED_CODE = 'unauthorized';

function unexpectedFromRejection(): ErrorState {
  return {
    status: 'error',
    code: UNEXPECTED_ERROR_CODE,
    message: errorMessage(UNEXPECTED_ERROR_CODE),
    reference: newRequestId(),
  };
}

function optionLabel(option: PackagingOption): string {
  return option.name;
}

/**
 * Selector de envases del reparto: productos de tipo envase cuya presentacion comparte unidad base
 * con el pedido. La busqueda y el filtro van al servidor; aqui no se recorta nada por texto.
 */
export function PackagingSelect({ unitIds, onSelect, disabled = false }: PackagingSelectProps) {
  const labelId = useId();
  const forbiddenId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [selected, setSelected] = useState<PackagingOption | null>(null);
  const [forbidden, setForbidden] = useState(false);
  /** El rechazo entero, para no perder la referencia de un inesperado: el hook solo guarda un `Error`. */
  const [failure, setFailure] = useState<ErrorState | null>(null);

  const fetchPage = useCallback(
    async ({ query, page }: AsyncPageRequest) => {
      const search = query.trim();
      let result: Awaited<ReturnType<typeof listProductsAction>>;
      try {
        result = await listProductsAction({
          page,
          pageSize: MAX_PAGE_SIZE,
          ...(search === '' ? {} : { search }),
          filters: {
            type: { kind: 'select', values: [PRODUCT_TYPES.PACKAGING] },
            [PRODUCT_PRESENTATION_UNIT_FILTER]: { kind: 'select', values: unitIds },
          },
        });
      } catch {
        // La accion no llego a responder: el mismo inesperado que fabricaria el servidor.
        const unexpected = unexpectedFromRejection();
        setFailure(unexpected);
        throw new Error(unexpected.code);
      }

      if (result.status === 'error') {
        if (result.code === UNAUTHORIZED_CODE) setForbidden(true);
        setFailure(result);
        throw new Error(result.code);
      }
      setFailure(null);

      return {
        items: result.data.items.map(
          (item): PackagingOption => ({
            id: item.id,
            name: item.name,
            presentationId: item.presentationId ?? null,
            presentationName: item.presentationName ?? null,
            presentationContent: item.presentationContent ?? null,
            presentationUnitId: item.presentationUnitId ?? null,
            available: item.available,
          }),
        ),
        page: result.data.page,
        totalPages: result.data.totalPages,
      };
    },
    [unitIds],
  );

  function choose(option: PackagingOption | null) {
    if (option === null) {
      return;
    }
    setSelected(option);
    setDraft(null);
    onSelect(option);
  }

  /** Lo escrito deja de coincidir con lo elegido: se retira la eleccion para no anadir otra cosa. */
  function handleValueChange(next: string) {
    setDraft(next);
    if (selected !== null && next !== optionLabel(selected)) {
      setSelected(null);
      onSelect(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-sm font-medium">
        {LABELS.label}
      </span>

      <AsyncAutocomplete<PackagingOption>
        layout="split"
        fetchPage={fetchPage}
        getOptionLabel={optionLabel}
        getOptionKey={(option) => option.id}
        onSelect={choose}
        inputValue={draft ?? (selected === null ? '' : optionLabel(selected))}
        searchQuery={draft ?? ''}
        onInputValueChange={handleValueChange}
        queryEnabled={!forbidden}
        showEmpty={!forbidden}
        isOptionDisabled={(option) => option.presentationContent == null}
        disabled={disabled}
        pageSize={MAX_PAGE_SIZE}
        debounceMs={SEARCH_DEBOUNCE_MS}
        maxHeight={MAX_LIST_HEIGHT}
        scrollThreshold={SCROLL_THRESHOLD}
        placeholder={LABELS.placeholder}
        emptyMessage={LABELS.empty}
        aria-labelledby={labelId}
        aria-describedby={forbidden ? forbiddenId : undefined}
        renderLoadError={() =>
          failure === null ? null : (
            <ErrorAlert
              error={failure}
              as="p"
              className="p-2 text-sm text-destructive"
              testId={PACKAGING_SELECT_LOAD_ERROR_TESTID}
              renderCatalogued={(error) => error.message}
            />
          )
        }
        renderOption={(option) => (
          <>
            <span className="w-full truncate">{option.name}</span>
            <span className="flex w-full flex-wrap gap-x-2 text-sm text-muted-foreground">
              <span data-testid={PACKAGING_OPTION_PRESENTATION_TESTID}>
                {option.presentationName ?? ''}
              </span>
              <span data-testid={PACKAGING_OPTION_AVAILABLE_TESTID}>
                {LABELS.available(trimDecimal(option.available ?? '0'))}
              </span>
            </span>
          </>
        )}
        slots={{
          inputTestId: PACKAGING_SELECT_TESTID,
          inputClassName: `w-full ${touchTarget} ${FIELD_TEXT} pr-8`,
          clear: { label: LABELS.clear, className: touchTarget },
          popupTestId: PACKAGING_SELECT_POPUP_TESTID,
          optionTestId: PACKAGING_OPTION_TESTID,
          optionClassName: `${touchTarget} ${FIELD_TEXT} flex-col items-start gap-0.5`,
          optionDataAttributes: (option) => ({ 'data-product-id': option.id }),
          emptyTestId: PACKAGING_SELECT_EMPTY_TESTID,
          loadingLabel: LABELS.loading,
        }}
      />

      {forbidden ? (
        <p
          id={forbiddenId}
          role="alert"
          className="flex items-center gap-1 text-sm text-destructive"
          data-testid={PACKAGING_SELECT_FORBIDDEN_TESTID}
        >
          <CircleAlertIcon className="size-4" aria-hidden />
          {LABELS.forbidden}
        </p>
      ) : null}
    </div>
  );
}
