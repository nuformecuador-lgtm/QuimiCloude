import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';

import { setupUser } from '../../helpers/user-event';
import { NARROW_VIEWPORT, WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';

import { SupplierSheet } from '@/components/shared/supplier';
import { createSupplierSchema, type SupplierView } from '@/lib/modules/proveedores';
import type {
  CreateSupplierFormState,
  SupplierMutationFormState,
} from '@/lib/modules/proveedores/adapters/driving/supplier-actions';
import { SUPPLIERS_ROUTE } from '@/lib/shared/routes';

/**
 * `SupplierSheet`/`SupplierForm` (`components/shared/supplier`), montados sueltos: son el panel
 * compartido de alta y edicion, sin frontera de ruta.
 *
 * Recupera casos que vivian en la extinta `supplier-page.test.tsx` (2026-09-24) para el panel
 * lateral, movido a `components/shared/supplier/` con `SupplierSheet supplier` alojado ahora en la
 * cabecera del detalle. Los de la baja se recuperaron en `supplier-detail-page.test.tsx`.
 */

const { routerMock, createSupplierActionMock, updateSupplierActionMock } = vi.hoisted(() => ({
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  createSupplierActionMock:
    vi.fn<(prev: CreateSupplierFormState, data: FormData) => Promise<CreateSupplierFormState>>(),
  updateSupplierActionMock:
    vi.fn<
      (
        id: string,
        prev: SupplierMutationFormState,
        data: FormData,
      ) => Promise<SupplierMutationFormState>
    >(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/proveedores/adapters/driving/supplier-actions', () => ({
  createSupplierAction: createSupplierActionMock,
  updateSupplierAction: updateSupplierActionMock,
}));

const ALTA_VALIDA: Readonly<Record<string, string>> = {
  name: 'Ácido Cítrico del Bajío',
  phone: '+52 33 9876 5432',
  email: 'compras@acidocitrico.example',
};

function proveedor(overrides: Partial<SupplierView> = {}): SupplierView {
  const name = overrides.name ?? 'Químicos del Sur';
  return {
    id: crypto.randomUUID(),
    name,
    nameNormalized: name.toLowerCase(),
    phone: '+52 55 1234 5678',
    email: 'ventas@quimicosdelsur.example',
    createdAt: new Date('2026-01-15T10:20:30.000Z'),
    updatedAt: new Date('2026-02-20T08:00:00.000Z'),
    createdBy: 'autor-no-usado',
    updatedBy: 'editor-no-usado',
    ...overrides,
  };
}

async function rellenarFormulario(
  user: ReturnType<typeof setupUser>,
  valores: Readonly<Record<string, string>> = {},
) {
  const datos = { ...ALTA_VALIDA, ...valores };
  for (const [campo, valor] of Object.entries(datos)) {
    const control = screen.getByTestId(`supplier-field-${campo}`);
    await user.clear(control);
    if (valor !== '') await user.type(control, valor);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  createSupplierActionMock.mockResolvedValue({ status: 'success', id: crypto.randomUUID() });
  updateSupplierActionMock.mockResolvedValue({ status: 'success' });
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetViewport();
});

describe('SupplierSheet/SupplierForm — edicion: precarga y reemplazo completo', () => {
  it('precarga los valores actuales y envia el reemplazo completo con un solo campo cambiado', async () => {
    const user = setupUser();
    const elProveedor = proveedor({ name: 'Químicos del Sur' });

    render(<SupplierSheet supplier={elProveedor} />);
    await user.click(screen.getByTestId('supplier-edit-open'));
    await screen.findByTestId('supplier-form');

    const precargado: Record<string, string> = {
      name: elProveedor.name,
      phone: elProveedor.phone ?? '',
      email: elProveedor.email ?? '',
    };
    for (const [campo, valor] of Object.entries(precargado)) {
      expect(screen.getByTestId(`supplier-field-${campo}`), campo).toHaveValue(valor);
    }

    await user.clear(screen.getByTestId('supplier-field-name'));
    await user.type(screen.getByTestId('supplier-field-name'), 'Químicos del Sureste');
    await user.click(screen.getByTestId('supplier-form-submit'));

    await waitFor(() => expect(updateSupplierActionMock).toHaveBeenCalledTimes(1));

    const [id, , enviado] = updateSupplierActionMock.mock.calls[0];
    expect(id).toBe(elProveedor.id);
    expect(enviado.get('name')).toBe('Químicos del Sureste');
    for (const [campo, valor] of Object.entries(precargado)) {
      if (campo === 'name') continue;
      expect(enviado.get(campo), `${campo} debe viajar en el reemplazo`).toBe(valor);
    }
    expect(createSupplierActionMock).not.toHaveBeenCalled();
  });
});

describe('SupplierSheet/SupplierForm — errores del alta (R32)', () => {
  it('un supplier_duplicate_name se pinta junto al campo nombre, sin cerrar el panel ni perder lo escrito', async () => {
    const user = setupUser();
    const toastExito = vi.spyOn(toast, 'success');
    createSupplierActionMock.mockResolvedValue({
      status: 'error',
      code: 'supplier_duplicate_name',
      message: 'MENSAJE-DEL-SERVIDOR-QUE-NADIE-INTERPRETA',
    });

    render(<SupplierSheet />);
    await user.click(screen.getByTestId('supplier-create-open'));
    await screen.findByTestId('supplier-form');
    await rellenarFormulario(user);
    await user.click(screen.getByTestId('supplier-form-submit'));

    await waitFor(() => expect(createSupplierActionMock).toHaveBeenCalledTimes(1));

    const errorDeCampo = await screen.findByTestId('supplier-error-name');
    expect(errorDeCampo).toHaveTextContent('MENSAJE-DEL-SERVIDOR-QUE-NADIE-INTERPRETA');
    expect(screen.getByTestId('supplier-field-name')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByTestId('supplier-form-error')).toBeNull();

    expect(screen.getByTestId('supplier-sheet')).toBeInTheDocument();
    for (const [campo, valor] of Object.entries(ALTA_VALIDA)) {
      expect(screen.getByTestId(`supplier-field-${campo}`), campo).toHaveValue(valor);
    }
    expect(toastExito).not.toHaveBeenCalled();
  });

  it('un supplier_not_found ofrece volver a la lista desde la region de error del formulario', async () => {
    const user = setupUser();
    const elProveedor = proveedor();
    updateSupplierActionMock.mockResolvedValue({
      status: 'error',
      code: 'supplier_not_found',
      message: 'No existe.',
    });

    render(<SupplierSheet supplier={elProveedor} />);
    await user.click(screen.getByTestId('supplier-edit-open'));
    await screen.findByTestId('supplier-form');
    await user.click(screen.getByTestId('supplier-form-submit'));

    await waitFor(() => expect(updateSupplierActionMock).toHaveBeenCalledTimes(1));

    const vuelta = await screen.findByTestId('supplier-form-back-to-list');
    expect(vuelta.getAttribute('href')).toBe(SUPPLIERS_ROUTE);
    expect(screen.getByTestId('supplier-sheet')).toBeInTheDocument();
  });

  it('la validacion previa aplica el MISMO esquema del contrato publico y ni llama a la operacion', async () => {
    const user = setupUser();
    const sinContacto = { name: ALTA_VALIDA.name, phone: '', email: '' };
    expect(createSupplierSchema.safeParse(sinContacto).success).toBe(false);

    render(<SupplierSheet />);
    await user.click(screen.getByTestId('supplier-create-open'));
    await screen.findByTestId('supplier-form');
    await rellenarFormulario(user, { phone: '', email: '' });
    await user.click(screen.getByTestId('supplier-form-submit'));

    const region = await screen.findByTestId('supplier-form-error');
    expect(within(region).getByTestId('supplier-form-error-code')).toHaveTextContent(
      'invalid_input',
    );
    expect(createSupplierActionMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('supplier-sheet')).toBeInTheDocument();
    expect(screen.getByTestId('supplier-field-name')).toHaveValue(ALTA_VALIDA.name);
  });
});

describe('SupplierSheet/SupplierForm — multiplataforma (R48)', () => {
  it('los campos y las acciones del panel se usan igual en viewport angosto y en ancho', async () => {
    for (const ancho of [NARROW_VIEWPORT, WIDE_VIEWPORT]) {
      setViewportWidth(ancho);
      const user = setupUser();

      render(<SupplierSheet />);
      await user.click(screen.getByTestId('supplier-create-open'));
      await screen.findByTestId('supplier-form');

      for (const campo of Object.keys(ALTA_VALIDA)) {
        const control = screen.getByTestId(`supplier-field-${campo}`);
        expect(control.className, `${campo} a ${ancho}px`).toContain('text-base');
        expect(control.className, `${campo} a ${ancho}px`).toContain('md:text-base');
        expect(control.className, `${campo} a ${ancho}px`).toContain('min-h-11');
      }

      expect(screen.getByTestId('supplier-form-submit').className).toContain('min-h-11');
      expect(screen.getByTestId('supplier-form-cancel').className).toContain('min-h-11');

      cleanup();
    }
  });
});
