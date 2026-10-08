'use client';

import { useCallback, type ChangeEvent } from 'react';

import { AsyncAutocomplete } from '@/components/shared/async-autocomplete';
import type { AsyncPageRequest } from '@/hooks/use-async-paginated-options';
import type { OrderCustomerSearchPurpose } from '@/lib/modules/pedidos';
import { searchOrderCustomersAction } from '@/lib/modules/pedidos/adapters/driving/order-actions';

import {
  ORDER_CUSTOMER_NONE_LABEL,
  orderCustomerChoiceId,
  orderCustomerChoiceLabel,
  type OrderCustomerChoice,
} from './order-customer-label';

export const ORDER_CUSTOMER_PICKER_TESTID = 'order-customer-picker';

/** El campo, el boton de limpiar y cada opcion miden al menos 44 px, y el texto 16 px para que
 *  Safari en iOS no haga zoom al enfocar. */
export const ORDER_CUSTOMER_PICKER_TOUCH_CLASSES =
  'w-full [&_[data-slot=autocomplete-input]]:min-h-11 [&_[data-slot=autocomplete-input]]:pr-11 [&_[data-slot=autocomplete-input]]:text-base [&_[data-slot=autocomplete-clear]]:right-0 [&_[data-slot=autocomplete-clear]]:size-11';

const OPTION_TOUCH_CLASSES = 'flex min-h-11 w-full items-center text-base md:text-sm';

const FIRST_PAGE = 1;

const DIACRITICS = /\p{Diacritic}/gu;

function normalizeTerm(text: string): string {
  return text.normalize('NFD').replace(DIACRITICS, '').toLowerCase();
}

const NONE_LABEL_NORMALIZED = normalizeTerm(ORDER_CUSTOMER_NONE_LABEL);

/** «Sin cliente» sale sin termino o cuando cada palabra del termino aparece en su etiqueta. */
function termMatchesNone(query: string): boolean {
  const words = normalizeTerm(query).split(/\s+/).filter((word) => word !== '');
  return words.every((word) => NONE_LABEL_NORMALIZED.includes(word));
}

function choiceKey(choice: OrderCustomerChoice): string {
  return choice.kind === 'none' ? 'none' : choice.customer.id;
}

export type OrderCustomerPickerProps = {
  /** `'assign'` ofrece solo clientes vivos; `'filter'` incluye los dados de baja y «Sin cliente». */
  readonly purpose: OrderCustomerSearchPurpose;
  readonly value: OrderCustomerChoice | null;
  readonly onChange: (choice: OrderCustomerChoice | null) => void;
  /** Nombre del campo oculto del formulario. Lleva el id, nunca la etiqueta. */
  readonly name?: string;
  /**
   * Por defecto, escribir algo distinto de lo elegido retira la eleccion (`onChange(null)`), para
   * que el id que viaja sea siempre el que se lee. Con `true` escribir solo busca: lo usa el
   * filtro, donde avisar de un `null` navegaria a mitad de palabra.
   */
  readonly keepChoiceWhileTyping?: boolean;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly placeholder?: string;
  readonly emptyMessage?: string;
  readonly 'aria-label'?: string;
  readonly 'aria-invalid'?: boolean;
  readonly 'aria-describedby'?: string;
};

export function OrderCustomerPicker({
  purpose,
  value,
  onChange,
  name,
  keepChoiceWhileTyping = false,
  disabled,
  id,
  placeholder,
  emptyMessage,
  ...aria
}: OrderCustomerPickerProps) {
  const fetchPage = useCallback(
    async ({ query, page, pageSize }: AsyncPageRequest) => {
      const search = query.trim();
      const result = await searchOrderCustomersAction({ search, page, pageSize }, purpose);

      if (result.status === 'error') {
        throw new Error(result.message);
      }

      const options: OrderCustomerChoice[] = result.data.items.map((customer) => ({
        kind: 'customer',
        customer,
      }));
      const withNone =
        purpose === 'filter' && page === FIRST_PAGE && termMatchesNone(search)
          ? [{ kind: 'none' } as const, ...options]
          : options;

      return { items: withNone, page: result.data.page, totalPages: result.data.totalPages };
    },
    [purpose],
  );

  // Escucha el `change` que sube del campo de texto: elegir una opcion no lo dispara, teclear si.
  // Vaciar el campo ya lo resuelve el autocompletado con su propio `null`.
  function handleTyping(event: ChangeEvent<HTMLDivElement>) {
    if (keepChoiceWhileTyping || value === null) return;
    const target = event.target as EventTarget;
    if (!(target instanceof HTMLInputElement) || target.type === 'hidden') return;
    const typed = target.value.trim();
    if (typed !== '' && typed !== orderCustomerChoiceLabel(value)) {
      onChange(null);
    }
  }

  return (
    <div className="flex flex-col" data-testid={ORDER_CUSTOMER_PICKER_TESTID} onChange={handleTyping}>
      {name === undefined ? null : (
        <input
          type="hidden"
          name={name}
          value={orderCustomerChoiceId(value)}
          data-testid={`${ORDER_CUSTOMER_PICKER_TESTID}-value`}
        />
      )}
      <AsyncAutocomplete<OrderCustomerChoice>
        fetchPage={fetchPage}
        getOptionLabel={orderCustomerChoiceLabel}
        getOptionKey={choiceKey}
        onSelect={onChange}
        renderOption={(choice) => (
          <span className={OPTION_TOUCH_CLASSES} data-testid={`${ORDER_CUSTOMER_PICKER_TESTID}-option`}>
            {orderCustomerChoiceLabel(choice)}
          </span>
        )}
        defaultInputValue={value === null ? undefined : orderCustomerChoiceLabel(value)}
        className={ORDER_CUSTOMER_PICKER_TOUCH_CLASSES}
        disabled={disabled}
        id={id}
        placeholder={placeholder}
        emptyMessage={emptyMessage}
        {...aria}
      />
    </div>
  );
}
