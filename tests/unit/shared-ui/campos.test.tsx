import { cleanup, render, screen, within } from '@testing-library/react';
import { useId, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductBatchDateField } from '@/app/(private)/inventario/components/product-batch-date-field';
import { OrderField } from '@/app/(private)/pedidos/components/order-field';
import { UnitSelect } from '@/app/(private)/proveedores/[id]/components';
import { DataTableFilterDate } from '@/components/shared/data-table/data-table-filter-date';
import type { DataTableTexts } from '@/components/shared/data-table/data-table-types';
import { DatePicker } from '@/components/shared/date-picker';
import { FieldError } from '@/components/shared/field-error';
import { SelectField } from '@/components/shared/select-field';
import { SupplierField } from '@/components/shared/supplier/supplier-field';
import { TextField } from '@/components/shared/text-field';
import { Button } from '@/components/ui/button';
import type { UnitRef } from '@/lib/modules/unidades';
import { touchTarget } from '@/lib/shared/ui/touch-target';

import { esperarInteractiva, setupUser } from '../../helpers/user-event';
import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';
import { arbolAccesibleDe } from '../paridad/arbol-accesible';

/** «Hoy» fijo: la fecha suelta arranca en hoy y deshabilita los días posteriores. */
const HOY = new Date('2026-10-09T12:00:00');

const OPCIONES = [
  { value: 'kg', label: 'Kilogramo' },
  { value: 'l', label: 'Litro' },
] as const;

const TEXTOS: DataTableTexts = {
  empty: 'vacio',
  loading: 'cargando',
  error: 'error',
  search: 'buscar',
  filters: 'filtros',
  columnMenu: 'menu-columna',
  previousPage: 'anterior',
  nextPage: 'siguiente',
  pageIndicator: (page, totalPages) => `${page}/${totalPages}`,
  pageSize: 'tamano',
  sortAscending: 'asc',
  sortDescending: 'desc',
  pinColumn: 'fijar',
  unpinColumn: 'soltar',
  filterColumn: 'filtrar',
  clearFilter: 'limpiar',
  lastWeek: 'ultima semana',
  lastMonth: 'ultimo mes',
  lastYear: 'ultimo año',
};

const ATRIBUTOS_DEL_CONTROL = [
  'name',
  'type',
  'inputmode',
  'autocomplete',
  'required',
  'maxlength',
  'min',
  'step',
  'pattern',
];

/** Árbol accesible más los atributos de envío de cada control, como la paridad de campos. */
function serializar(contenedor: HTMLElement): string {
  const controles = Array.from(contenedor.querySelectorAll<HTMLInputElement>('input, textarea')).map(
    (control) => {
      const partes = [control.tagName.toLowerCase()];
      for (const atributo of ATRIBUTOS_DEL_CONTROL) {
        const valor = control.getAttribute(atributo);
        if (valor !== null) partes.push(`${atributo}=${JSON.stringify(valor)}`);
      }
      partes.push(`value=${JSON.stringify(control.value)}`);
      return partes.join(' ');
    },
  );
  return `${arbolAccesibleDe(contenedor)}${controles.join('\n')}`;
}

function serializarMontado(nodo: ReactNode): string {
  const { container, unmount } = render(nodo);
  const resultado = serializar(container.firstElementChild as HTMLElement);
  unmount();
  return resultado;
}

async function abrir(user: ReturnType<typeof setupUser>, testId: string, rol: string) {
  await user.click(screen.getByTestId(testId));
  const popup = await screen.findByRole(rol);
  await esperarInteractiva(popup);
  return popup;
}

function datosDe(form: HTMLFormElement): [string, FormDataEntryValue][] {
  return Array.from(new FormData(form).entries());
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(HOY);
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  resetViewport();
});

describe('FieldError', () => {
  it('R18 — con mensaje pinta un párrafo con role="alert", su id y su testid', () => {
    render(<FieldError id="campo-error" message="Obligatorio." testId="campo-error-testid" />);

    const error = screen.getByRole('alert');
    expect(error).toHaveAttribute('id', 'campo-error');
    expect(error).toHaveAttribute('data-testid', 'campo-error-testid');
    expect(error).toHaveTextContent('Obligatorio.');
  });

  it('R18 — sin mensaje no pinta nada', () => {
    const { container } = render(<FieldError id="campo-error" testId="campo-error-testid" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('R18 — alert={false} quita el rol y conserva id y testid', () => {
    render(<FieldError id="campo-error" message="Obligatorio." testId="x" alert={false} />);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('x')).toHaveAttribute('id', 'campo-error');
  });
});

describe('TextField', () => {
  it('R16 — etiqueta enlazada por htmlFor/id, sin aria-invalid ni aria-describedby sin error', () => {
    render(<TextField id="nombre" name="name" label="Nombre" defaultValue="Ana" testId="f" />);

    const input = screen.getByLabelText('Nombre');
    expect(input).toBe(screen.getByTestId('f'));
    expect(input).toHaveAttribute('id', 'nombre');
    expect(input).toHaveValue('Ana');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });

  it('R16 — conserva 16 px y 44 px de alto por defecto', () => {
    render(<TextField id="nombre" name="name" label="Nombre" testId="f" />);
    const clases = screen.getByTestId('f').className.split(/\s+/);
    expect(clases).toEqual(expect.arrayContaining(['min-h-11', 'text-base', 'md:text-base']));
  });

  it('R18 — con error marca el control y lo describe con el párrafo de role="alert"', () => {
    render(
      <TextField id="nombre" name="name" label="Nombre" error="Obligatorio." errorTestId="e" />,
    );

    const input = screen.getByLabelText('Nombre');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'nombre-error');
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'nombre-error');
    expect(input).toHaveAccessibleDescription('Obligatorio.');
  });

  it('R18 — la ayuda solo entra en aria-describedby si se pide', () => {
    const { unmount } = render(
      <TextField id="a" name="a" label="A" hint="Ayuda" error="Mal." />,
    );
    expect(screen.getByLabelText('A')).toHaveAttribute('aria-describedby', 'a-error');
    unmount();

    render(<TextField id="b" name="b" label="B" hint="Ayuda" describeHint />);
    expect(screen.getByLabelText('B')).toHaveAttribute('aria-describedby', 'b-hint');
    expect(screen.getByLabelText('B')).toHaveAccessibleDescription('Ayuda');
  });

  it('R19 — viaja en el FormData con su name; sin name no viaja', () => {
    render(
      <form data-testid="form">
        <TextField id="a" name="cantidad" label="Cantidad" defaultValue="3" />
        <TextField id="b" label="Libre" value="x" onValueChange={() => undefined} />
      </form>,
    );

    expect(datosDe(screen.getByTestId('form') as HTMLFormElement)).toEqual([['cantidad', '3']]);
  });

  it('R16 — controlado: avisa cada cambio por onValueChange y por onChange', async () => {
    const user = setupUser();
    const onValueChange = vi.fn();
    const onChange = vi.fn();
    render(
      <TextField
        id="a"
        label="A"
        value=""
        onValueChange={onValueChange}
        onChange={onChange}
      />,
    );

    await user.type(screen.getByLabelText('A'), 'z');
    expect(onValueChange).toHaveBeenCalledWith('z');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('R17 — reproduce OrderField (número, paso, mínimo, error sin rol)', () => {
    function OrderFieldConPiezas({ error }: { error?: string }) {
      const fieldId = useId();
      const id = `${fieldId}-quantity`;
      return (
        <TextField
          id={id}
          name="quantity"
          label="Cantidad"
          type="number"
          step="any"
          min="0.01"
          inputMode="decimal"
          autoComplete="off"
          required
          defaultValue="2"
          remountOnDefault
          testId="order-field-quantity"
          error={error}
          errorTestId="order-error-quantity"
          errorAlert={false}
        />
      );
    }

    for (const error of [undefined, 'La cantidad es obligatoria.']) {
      const antes = serializarMontado(
        <OrderField
          name="quantity"
          label="Cantidad"
          type="number"
          step="any"
          min="0.01"
          inputMode="decimal"
          required
          defaultValue="2"
          error={error}
        />,
      );
      expect(serializarMontado(<OrderFieldConPiezas error={error} />)).toBe(antes);
    }
  });

  it('R17 — reproduce SupplierField (inputMode y autoComplete propios)', () => {
    function SupplierFieldConPiezas({ error }: { error?: string }) {
      const fieldId = useId();
      const id = `${fieldId}-phone`;
      return (
        <TextField
          id={id}
          name="phone"
          label="Teléfono"
          inputMode="tel"
          autoComplete="tel"
          defaultValue="600"
          remountOnDefault
          testId="supplier-field-phone"
          error={error}
          errorTestId="supplier-error-phone"
          errorAlert={false}
        />
      );
    }

    for (const error of [undefined, 'Teléfono no válido.']) {
      const antes = serializarMontado(
        <SupplierField
          name="phone"
          label="Teléfono"
          inputMode="tel"
          autoComplete="tel"
          defaultValue="600"
          error={error}
        />,
      );
      expect(serializarMontado(<SupplierFieldConPiezas error={error} />)).toBe(antes);
    }
  });

  it('R17 — fila de etiqueta y sufijo detrás del input', () => {
    render(
      <TextField
        id="c"
        name="content"
        label="Contenido"
        labelRowClassName="flex items-center gap-1.5"
        labelAdornment={<button type="button">?</button>}
        suffix={<span aria-hidden="true">kg</span>}
        inputClassName="min-h-11 flex-1 text-base md:text-base"
        testId="c"
      />,
    );

    const input = screen.getByTestId('c');
    expect(input.parentElement).toHaveClass('flex', 'items-center', 'gap-2');
    expect(input.nextElementSibling).toHaveTextContent('kg');
    expect(screen.getByText('Contenido').parentElement).toHaveClass('flex', 'items-center', 'gap-1.5');
    expect(screen.getByRole('button', { name: '?' })).toBeInTheDocument();
  });
});

describe('SelectField', () => {
  it('R16 — sobre SharedSelect: etiqueta por aria-labelledby, opción «ninguna» explícita y testids por opción', async () => {
    const user = setupUser();
    render(
      <SelectField
        name="unitId"
        label="Unidad"
        options={OPCIONES}
        noneOption={{ value: '', label: 'Sin unidad', testId: 'opcion-ninguna' }}
        defaultValue=""
        triggerTestId="disparador"
        optionTestId="opcion"
        optionValueAttribute
      />,
    );

    const disparador = screen.getByRole('combobox', { name: 'Unidad' });
    expect(disparador).toBe(screen.getByTestId('disparador'));
    expect(disparador).toHaveTextContent('Sin unidad');
    expect(disparador.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['w-full', ...touchTarget.split(' '), 'text-base', 'md:text-base']),
    );

    const lista = await abrir(user, 'disparador', 'listbox');
    const opciones = within(lista).getAllByRole('option');
    expect(opciones.map((opcion) => opcion.textContent)).toEqual(['Sin unidad', 'Kilogramo', 'Litro']);
    expect(opciones[0]).toHaveAttribute('data-testid', 'opcion-ninguna');
    expect(within(lista).getAllByTestId('opcion').map((o) => o.getAttribute('data-value'))).toEqual([
      'kg',
      'l',
    ]);
  });

  it('R16 — sin opciones no inventa ninguna', async () => {
    const user = setupUser();
    render(<SelectField name="role" label="Rol" options={[]} triggerTestId="d" />);

    const lista = await abrir(user, 'd', 'listbox');
    expect(within(lista).queryAllByRole('option')).toHaveLength(0);
  });

  it('R18 — con error: aria-invalid, aria-describedby y role="alert"; sin error, nada', () => {
    const { unmount } = render(
      <SelectField name="role" label="Rol" options={OPCIONES} triggerTestId="d" />,
    );
    expect(screen.getByTestId('d')).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByRole('alert')).toBeNull();
    unmount();

    render(
      <SelectField
        name="role"
        label="Rol"
        options={OPCIONES}
        triggerTestId="d"
        error="Elige un rol."
        errorTestId="e"
      />,
    );
    const disparador = screen.getByTestId('d');
    expect(disparador).toHaveAttribute('aria-invalid', 'true');
    expect(disparador).toHaveAttribute('aria-describedby', screen.getByRole('alert').id);
    expect(screen.getByTestId('e')).toHaveTextContent('Elige un rol.');
  });

  it('R19 — el valor viaja en el FormData por el input oculto, también la opción «ninguna»', async () => {
    const user = setupUser();
    render(
      <form data-testid="form">
        <SelectField name="baseUnitId" label="Deriva de" options={OPCIONES} defaultValue="kg" triggerTestId="a" />
        <SelectField
          name="unitId"
          label="Unidad"
          options={OPCIONES}
          noneOption={{ value: '', label: 'Sin unidad' }}
          defaultValue=""
          triggerTestId="b"
        />
      </form>,
    );
    const form = screen.getByTestId('form') as HTMLFormElement;
    expect(datosDe(form)).toEqual([
      ['baseUnitId', 'kg'],
      ['unitId', ''],
    ]);

    const lista = await abrir(user, 'a', 'listbox');
    await user.click(within(lista).getByRole('option', { name: 'Litro' }));
    expect(new FormData(form).get('baseUnitId')).toBe('l');
  });

  it('R17 — reproduce UnitSelect, cerrado y con error sin rol', () => {
    const unidades: readonly UnitRef[] = [
      { id: 'u1', name: 'Kilogramo', symbol: 'kg', baseUnitId: null, factor: null },
      { id: 'u2', name: 'Bolsa', symbol: null, baseUnitId: null, factor: null },
    ];
    for (const error of [undefined, 'Unidad no válida.']) {
      const antes = serializarMontado(
        <UnitSelect units={unidades} defaultValue="u1" error={error} />,
      );
      const despues = serializarMontado(
        <SelectField
          name="unitId"
          label="Unidad"
          options={unidades.map((u) => ({ value: u.id, label: u.symbol ?? u.name }))}
          noneOption={{ value: '', label: 'Sin unidad', testId: 'unit-option-none' }}
          defaultValue="u1"
          triggerTestId="unit-select"
          optionTestId="unit-option"
          error={error}
          errorTestId="unit-select-error"
          errorAlert={false}
        />,
      );
      expect(despues).toBe(antes);
    }
  });
});

describe('DatePicker', () => {
  function fechaDeCompra(error?: string) {
    return (
      <DatePicker
        mode="single"
        name="purchaseDate"
        label="Fecha de compra"
        defaultValue={new Date(2026, 9, 2)}
        disabled={{ after: new Date(2026, 9, 9) }}
        triggerTestId="product-field-purchaseDate"
        valueTestId="product-batch-date-value"
        error={error}
        errorTestId="product-error-purchaseDate"
        errorAlert={false}
      />
    );
  }

  it('R16 — fecha suelta: etiqueta por aria-labelledby y el valor YYYY-MM-DD en el disparador', () => {
    render(fechaDeCompra());

    const disparador = screen.getByRole('button', { name: 'Fecha de compra' });
    expect(disparador).toBe(screen.getByTestId('product-field-purchaseDate'));
    expect(disparador).toHaveTextContent('2026-10-02');
    expect(disparador).not.toHaveAttribute('aria-describedby');
  });

  it('R16 — al elegir un día lo refleja; los posteriores a la cota están deshabilitados', async () => {
    const user = setupUser();
    render(fechaDeCompra());

    const popup = await abrir(user, 'product-field-purchaseDate', 'dialog');
    expect(within(popup).getByRole('button', { name: /October 10th, 2026/ })).toBeDisabled();
    await user.click(within(popup).getByRole('button', { name: /October 5th, 2026/ }));

    expect(screen.getByTestId('product-field-purchaseDate')).toHaveTextContent('2026-10-05');
    expect(screen.getByTestId('product-batch-date-value')).toHaveValue('2026-10-05');
  });

  it('R18 — con error marca el disparador y lo describe; alert por defecto', () => {
    render(
      <DatePicker
        mode="single"
        name="d"
        label="Fecha"
        defaultValue={HOY}
        triggerTestId="t"
        error="Fecha futura."
      />,
    );

    const disparador = screen.getByTestId('t');
    expect(disparador).toHaveAttribute('aria-invalid', 'true');
    expect(disparador).toHaveAttribute('aria-describedby', screen.getByRole('alert').id);
  });

  it('R19 — la fecha viaja en el FormData por el input oculto', () => {
    render(<form data-testid="form">{fechaDeCompra()}</form>);
    expect(datosDe(screen.getByTestId('form') as HTMLFormElement)).toEqual([
      ['purchaseDate', '2026-10-02'],
    ]);
  });

  it('R17 — reproduce ProductBatchDateField, con y sin error sin rol', () => {
    for (const error of [undefined, 'La fecha no puede ser futura.']) {
      const antes = serializarMontado(
        <ProductBatchDateField initialValue="2026-10-02" error={error} />,
      );
      expect(serializarMontado(fechaDeCompra(error))).toBe(antes);
    }
  });

  it('R16 R17 — rango: reproduce el filtro de la tabla, cerrado y abierto con sus atajos encima', async () => {
    const user = setupUser();
    const valor = { kind: 'dateRange', from: '2026-10-01', to: '2026-10-05' } as const;

    const filtro = render(
      <DataTableFilterDate columnId="creado" label="Creado" value={valor} texts={TEXTOS} onChange={vi.fn()} />,
    );
    const cerradoAntes = serializar(filtro.container.firstElementChild as HTMLElement);
    const abiertoAntes = arbolAccesibleDe(await abrir(user, 'data-table-filter-date-creado', 'dialog'));
    filtro.unmount();

    const onSelect = vi.fn();
    const pieza = render(
      <DatePicker
        mode="range"
        triggerContent="Creado"
        triggerTestId="data-table-filter-date-creado"
        selected={{ from: new Date(2026, 9, 1), to: new Date(2026, 9, 5) }}
        onSelect={onSelect}
        numberOfMonths={2}
        header={
          <div className="flex flex-wrap gap-2">
            {(['week', 'month', 'year'] as const).map((periodo) => (
              <ShortcutButton key={periodo} periodo={periodo} />
            ))}
          </div>
        }
      />,
    );
    expect(serializar(pieza.container.firstElementChild as HTMLElement)).toBe(cerradoAntes);
    const abierto = await abrir(user, 'data-table-filter-date-creado', 'dialog');
    expect(arbolAccesibleDe(abierto)).toBe(abiertoAntes);

    await user.click(within(abierto).getByRole('button', { name: /October 7th, 2026/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

const ATAJOS = {
  week: ['data-table-date-last-week', TEXTOS.lastWeek],
  month: ['data-table-date-last-month', TEXTOS.lastMonth],
  year: ['data-table-date-last-year', TEXTOS.lastYear],
} as const;

function ShortcutButton({ periodo }: { periodo: keyof typeof ATAJOS }) {
  const [testId, texto] = ATAJOS[periodo];
  return (
    <Button type="button" variant="outline" size="sm" touch data-testid={testId}>
      {texto}
    </Button>
  );
}
