// QC-39 T10 — El panel lateral de alta y edicion de unidad: R32, R33, R34, R35, R36, R37, R38.
//
// **Las Server Actions estan mockeadas.** No es un atajo: son el borde del modulo `unidades`, que
// esta ficha solo consume (R44), y sustituirlas es lo unico que permite ejercitar el panel sin base
// de datos. **Y ademas son el punto de observacion de R34**: el `FormData` que recibe el doble es
// EXACTAMENTE el que la pantalla envia, asi que afirmar `has(clave) === false` sobre el es afirmar
// que la clave no viaja.
//
// **El panel se monta solo**, sin la pagina. El modo CONTROLADO (`open`/`onOpenChange`) es el
// contrato que usa la fila, asi que el disparador de fila se simula con un boton minimo.
//
// **Ningun assert sobre literales de copy** (R49): rol ARIA, `data-testid` exportado como constante
// o codigos estables leidos de las clases de error del dominio.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NO_BASE_UNIT_VALUE,
  UNIT_BASE_FIELD,
  UNIT_BUSINESS_FIELDS,
  UNIT_CREATE_OPEN_TESTID,
  UNIT_ERROR_BASE_TESTID,
  UNIT_ERROR_NAME_TESTID,
  UNIT_ERROR_SYMBOL_TESTID,
  UNIT_FACTOR_FIELD,
  UNIT_FIELD_BASE_TESTID,
  UNIT_FIELD_FACTOR_TESTID,
  UNIT_FIELD_NAME_TESTID,
  UNIT_FIELD_SYMBOL_TESTID,
  UNIT_FORM_CANCEL_TESTID,
  UNIT_FORM_ERROR_CODE_TESTID,
  UNIT_FORM_ERROR_TESTID,
  UNIT_FORM_SUBMIT_TESTID,
  UNIT_FORM_TESTID,
  UNIT_NAME_FIELD,
  UNIT_OPTION_BASE_TESTID,
  UNIT_OPTION_NO_BASE_TESTID,
  UNIT_SHEET_TESTID,
  UNIT_SYMBOL_FIELD,
  UnitSheet,
  formatFactor,
} from '@/app/(private)/configuracion/unidades/components';
import { UNEXPECTED_ERROR_CODE, type ErrorCode } from '@/lib/modules/errores';

// QC-71 (R15, R16): los codigos que estos casos pintan son los CATALOGADOS. El generico ya no
// cabe en esta forma de estado -exige `reference`-, y por eso se excluye del tipo del parametro
// en vez de dejarlo pasar con un cast.
type CodigoCatalogado = Exclude<ErrorCode, typeof UNEXPECTED_ERROR_CODE>;
import {
  UnitDuplicateNameError,
  DuplicateSymbolError,
  InvalidDerivationError,
  ValidationError,
  type UnitView,
} from '@/lib/modules/unidades';
import type {
  CreateUnitFormState,
  UnitMutationFormState,
} from '@/lib/modules/unidades/adapters/driving/unit-actions';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';

const { routerMock, createUnitActionMock, updateUnitActionMock } = vi.hoisted(() => ({
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  createUnitActionMock:
    vi.fn<(prev: CreateUnitFormState, data: FormData) => Promise<CreateUnitFormState>>(),
  updateUnitActionMock:
    vi.fn<
      (id: string, prev: UnitMutationFormState, data: FormData) => Promise<UnitMutationFormState>
    >(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  createUnitAction: createUnitActionMock,
  updateUnitAction: updateUnitActionMock,
  deleteUnitAction: vi.fn(() => {
    throw new Error('deleteUnitAction no debe invocarse desde el panel lateral');
  }),
  listUnitsAction: vi.fn(() => {
    throw new Error('listUnitsAction no debe invocarse desde el panel lateral');
  }),
}));

/** Codigos ESTABLES del dominio, tomados de las clases de error y no escritos a mano (R37). */
const DUPLICATE_NAME_CODE = new UnitDuplicateNameError().code;
const DUPLICATE_SYMBOL_CODE = new DuplicateSymbolError().code;
const INVALID_DERIVATION_CODE = new InvalidDerivationError().code;
const INVALID_INPUT_CODE = new ValidationError().code;

const NOMBRE_ESCRITO = 'Kilogramo';
const SIMBOLO_ESCRITO = 'kg';
const FACTOR_ESCRITO = '1000';

function unidad(overrides: Partial<UnitView> & Pick<UnitView, 'id' | 'name'>): UnitView {
  return {
    symbol: null,
    baseUnitId: null,
    factor: null,
    isSystem: false,
    ...overrides,
  };
}

/** Bases OFRECIBLES: las dos son de sistema, que es el caso normal del catalogo sembrado (R36). */
const GRAMO = unidad({ id: 'u-gramo', name: 'Gramo', symbol: 'g', isSystem: true });
const LITRO = unidad({ id: 'u-litro', name: 'Litro', symbol: 'L', isSystem: true });
const BASES: readonly UnitView[] = [GRAMO, LITRO];

/** La unidad que se edita: DERIVADA de gramo, con sus cuatro valores. */
const EDITADA = unidad({
  id: 'u-kilo',
  name: 'Kilogramo',
  symbol: 'kg',
  baseUnitId: GRAMO.id,
  factor: '1000.0000',
});

/** Disparador de fila simulado: monta el panel CONTROLADO, como hace `UnitRowActions`. */
const ROW_EDIT_TESTID = 'fila-editar';

function FilaConPanel({
  unit,
  baseUnits = [...BASES, unit],
}: {
  readonly unit: UnitView;
  readonly baseUnits?: readonly UnitView[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" data-testid={ROW_EDIT_TESTID} onClick={() => setOpen(true)}>
        {unit.name}
      </button>
      <UnitSheet unit={unit} baseUnits={baseUnits} open={open} onOpenChange={setOpen} />
    </>
  );
}

let toastExito: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  createUnitActionMock.mockResolvedValue({ status: 'success', id: 'u-nueva' });
  updateUnitActionMock.mockResolvedValue({ status: 'success' });
  toastExito = vi.spyOn(toast, 'success');
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.restoreAllMocks();
});

/** Abre el alta y espera al formulario. */
async function abrirAlta(user: ReturnType<typeof setupUser>) {
  render(<UnitSheet baseUnits={BASES} />);
  await user.click(screen.getByTestId(UNIT_CREATE_OPEN_TESTID));
  return screen.findByTestId(UNIT_FORM_TESTID);
}

/** Abre la edicion y espera al formulario. */
async function abrirEdicion(
  user: ReturnType<typeof setupUser>,
  unit: UnitView = EDITADA,
  baseUnits: readonly UnitView[] = [...BASES, unit],
) {
  render(<FilaConPanel unit={unit} baseUnits={baseUnits} />);
  await user.click(screen.getByTestId(ROW_EDIT_TESTID));
  return screen.findByTestId(UNIT_FORM_TESTID);
}

/** El `FormData` que la pantalla envio al alta. Es el espia de R34. */
async function formDataDelAlta(): Promise<FormData> {
  await waitFor(() => expect(createUnitActionMock).toHaveBeenCalledTimes(1));
  return createUnitActionMock.mock.calls[0]![1];
}

/** Elige una opcion del selector de «deriva de», esperando a que el popup sea interactivo. */
async function elegirBase(user: ReturnType<typeof setupUser>, indice: number) {
  await user.click(screen.getByTestId(UNIT_FIELD_BASE_TESTID));
  const opciones = await screen.findAllByTestId(UNIT_OPTION_BASE_TESTID);
  await user.click(await esperarInteractiva(opciones[indice]!));
}

describe('el alta y la edicion ocurren en un panel lateral (R32)', () => {
  it('el alta se abre en un panel lateral, sin navegar y sin dialogo modal centrado', async () => {
    const user = setupUser();
    await abrirAlta(user);

    const panel = screen.getByTestId(UNIT_SHEET_TESTID);
    expect(panel).toHaveAttribute('data-slot', 'sheet-content');
    expect(panel.getAttribute('data-side')).toBe('right');
    // Y NO un dialogo de alerta centrado.
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.querySelector('[data-slot="alert-dialog-content"]')).toBeNull();

    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('la edicion abre el MISMO panel lateral, tambien sin navegar', async () => {
    const user = setupUser();
    await abrirEdicion(user);

    const panel = screen.getByTestId(UNIT_SHEET_TESTID);
    expect(panel).toHaveAttribute('data-slot', 'sheet-content');
    expect(panel.getAttribute('data-side')).toBe('right');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('cerrar el panel no navega: los parametros de lista de la URL siguen intactos', async () => {
    const user = setupUser();
    await abrirAlta(user);

    await user.click(screen.getByTestId(UNIT_FORM_CANCEL_TESTID));

    await waitFor(() => expect(screen.queryByTestId(UNIT_FORM_TESTID)).toBeNull());
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
    expect(createUnitActionMock).not.toHaveBeenCalled();
  });

  it('sin abrirlo no hay formulario montado', () => {
    render(<FilaConPanel unit={EDITADA} />);

    expect(screen.queryByTestId(UNIT_FORM_TESTID)).toBeNull();
  });
});

describe('el formulario captura EXACTAMENTE los cuatro campos (R33)', () => {
  it('ni empresa, ni ambito, ni id, ni marcas de tiempo', async () => {
    const user = setupUser();
    const formulario = await abrirAlta(user);

    const nombres = [...formulario.querySelectorAll<HTMLElement>('input, select, textarea')]
      .map((control) => control.getAttribute('name'))
      .filter((nombre): nombre is string => nombre !== null && nombre !== '');

    expect([...new Set(nombres)].sort()).toEqual([...UNIT_BUSINESS_FIELDS].sort());
  });

  it('el factor es un campo de TEXTO decimal, nunca `type="number"`', async () => {
    const user = setupUser();
    await abrirAlta(user);

    const factor = screen.getByTestId(UNIT_FIELD_FACTOR_TESTID);
    expect(factor).toHaveAttribute('type', 'text');
    expect(factor).toHaveAttribute('inputmode', 'decimal');
  });
});

describe('la edicion llega precargada con los CUATRO valores (R35)', () => {
  it('nombre, simbolo, unidad de la que deriva y factor', async () => {
    const user = setupUser();
    await abrirEdicion(user);

    expect(screen.getByTestId(UNIT_FIELD_NAME_TESTID)).toHaveValue(EDITADA.name);
    expect(screen.getByTestId(UNIT_FIELD_SYMBOL_TESTID)).toHaveValue(EDITADA.symbol);
    expect(screen.getByTestId(UNIT_FIELD_FACTOR_TESTID)).toHaveValue(formatFactor(EDITADA.factor!));
    // El selector viaja por un `input` oculto del primitivo: se afirma sobre el valor que envia.
    const oculto = document.querySelector<HTMLInputElement>(`input[name="${UNIT_BASE_FIELD}"]`);
    expect(oculto?.value).toBe(EDITADA.baseUnitId);
  });

  it('envia el reemplazo completo de los cuatro con el id ligado a la operacion', async () => {
    const user = setupUser();
    await abrirEdicion(user);

    await user.click(screen.getByTestId(UNIT_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(updateUnitActionMock).toHaveBeenCalledTimes(1));
    const [idRecibido, , datos] = updateUnitActionMock.mock.calls[0]!;
    expect(idRecibido).toBe(EDITADA.id);
    expect(datos.get(UNIT_NAME_FIELD)).toBe(EDITADA.name);
    expect(datos.get(UNIT_SYMBOL_FIELD)).toBe(EDITADA.symbol);
    expect(datos.get(UNIT_BASE_FIELD)).toBe(EDITADA.baseUnitId);
    expect(datos.get(UNIT_FACTOR_FIELD)).toBe(formatFactor(EDITADA.factor!));
    expect(createUnitActionMock).not.toHaveBeenCalled();
  });
});

describe('el selector de «deriva de» ofrece solo bases, mas «ninguna» (R36)', () => {
  it('en el alta ofrece las bases de sistema y la opcion de no derivar', async () => {
    const user = setupUser();
    await abrirAlta(user);

    await user.click(screen.getByTestId(UNIT_FIELD_BASE_TESTID));

    expect(await screen.findByTestId(UNIT_OPTION_NO_BASE_TESTID)).toBeInTheDocument();
    const opciones = screen.getAllByTestId(UNIT_OPTION_BASE_TESTID);
    expect(opciones).toHaveLength(BASES.length);
  });

  it('en la edicion NO se ofrece la propia unidad, aunque llegue en la lista de bases', async () => {
    const user = setupUser();
    // La derivada se cuela a proposito en `baseUnits`: la pantalla la descarta por ser la editada.
    await abrirEdicion(user, EDITADA, [...BASES, EDITADA]);

    await user.click(screen.getByTestId(UNIT_FIELD_BASE_TESTID));

    const opciones = await screen.findAllByTestId(UNIT_OPTION_BASE_TESTID);
    expect(opciones).toHaveLength(BASES.length);
    expect(opciones.map((opcion) => opcion.textContent)).not.toContain(EDITADA.name);
  });

  it('no ofrece unidades DERIVADAS: solo llegan bases y la pantalla no inventa ninguna', async () => {
    const user = setupUser();
    await abrirAlta(user);

    await user.click(screen.getByTestId(UNIT_FIELD_BASE_TESTID));
    await screen.findByTestId(UNIT_OPTION_NO_BASE_TESTID);

    const derivadas = BASES.filter((base) => base.baseUnitId !== null);
    expect(derivadas).toHaveLength(0);
    expect(screen.getAllByTestId(UNIT_OPTION_BASE_TESTID)).toHaveLength(BASES.length);
  });
});

describe('ausente NO es vacio: el `FormData` espiado (R34)', () => {
  it('sin simbolo declarado, la clave `symbol` NO viaja —y desde luego no como cadena vacia—', async () => {
    const user = setupUser();
    await abrirAlta(user);

    await user.type(screen.getByTestId(UNIT_FIELD_NAME_TESTID), NOMBRE_ESCRITO);
    await user.click(screen.getByTestId(UNIT_FORM_SUBMIT_TESTID));

    const enviado = await formDataDelAlta();
    expect(enviado.get(UNIT_NAME_FIELD)).toBe(NOMBRE_ESCRITO);
    expect(enviado.has(UNIT_SYMBOL_FIELD)).toBe(false);
    expect(enviado.get(UNIT_SYMBOL_FIELD)).not.toBe('');
  });

  it('sin derivacion declarada, NINGUNA de las dos claves de la equivalencia viaja', async () => {
    const user = setupUser();
    await abrirAlta(user);

    await user.type(screen.getByTestId(UNIT_FIELD_NAME_TESTID), NOMBRE_ESCRITO);
    await user.type(screen.getByTestId(UNIT_FIELD_SYMBOL_TESTID), SIMBOLO_ESCRITO);
    // Se escribe un factor a proposito: sin base, la pareja NO se envia ni a medias.
    await user.type(screen.getByTestId(UNIT_FIELD_FACTOR_TESTID), FACTOR_ESCRITO);
    await user.click(screen.getByTestId(UNIT_FORM_SUBMIT_TESTID));

    const enviado = await formDataDelAlta();
    expect(enviado.get(UNIT_SYMBOL_FIELD)).toBe(SIMBOLO_ESCRITO);
    expect(enviado.has(UNIT_BASE_FIELD)).toBe(false);
    expect(enviado.has(UNIT_FACTOR_FIELD)).toBe(false);
    expect(enviado.get(UNIT_BASE_FIELD)).not.toBe('');
    expect(enviado.get(UNIT_FACTOR_FIELD)).not.toBe('');
  });

  it('con derivacion declarada y factor EN BLANCO, viaja `baseUnitId` y NO viaja `factor`', async () => {
    // El caso que se corrigio y que faltaba anclar: un `factor: ''` no es «sin factor», es un valor
    // invalido; las actions leen con `has(clave)`.
    const user = setupUser();
    await abrirAlta(user);

    await user.type(screen.getByTestId(UNIT_FIELD_NAME_TESTID), NOMBRE_ESCRITO);
    await elegirBase(user, 0);
    await user.click(screen.getByTestId(UNIT_FORM_SUBMIT_TESTID));

    const enviado = await formDataDelAlta();
    expect(enviado.get(UNIT_BASE_FIELD)).toBe(GRAMO.id);
    expect(enviado.has(UNIT_FACTOR_FIELD)).toBe(false);
    expect(enviado.get(UNIT_FACTOR_FIELD)).not.toBe('');
  });

  it('con los cuatro declarados viajan los cuatro, y ninguna clave llega vacia', async () => {
    const user = setupUser();
    await abrirAlta(user);

    await user.type(screen.getByTestId(UNIT_FIELD_NAME_TESTID), NOMBRE_ESCRITO);
    await user.type(screen.getByTestId(UNIT_FIELD_SYMBOL_TESTID), SIMBOLO_ESCRITO);
    await elegirBase(user, 0);
    await user.type(screen.getByTestId(UNIT_FIELD_FACTOR_TESTID), FACTOR_ESCRITO);
    await user.click(screen.getByTestId(UNIT_FORM_SUBMIT_TESTID));

    const enviado = await formDataDelAlta();
    expect([...enviado.keys()].sort()).toEqual([...UNIT_BUSINESS_FIELDS].sort());
    for (const [, valor] of enviado.entries()) expect(valor).not.toBe('');
    expect(enviado.get(UNIT_BASE_FIELD)).toBe(GRAMO.id);
    expect(enviado.get(UNIT_FACTOR_FIELD)).toBe(FACTOR_ESCRITO);
  });

  it('la opcion «no deriva de ninguna» tiene el valor vacio, y por eso la clave se OMITE', async () => {
    const user = setupUser();
    await abrirAlta(user);

    await user.type(screen.getByTestId(UNIT_FIELD_NAME_TESTID), NOMBRE_ESCRITO);
    await user.click(screen.getByTestId(UNIT_FIELD_BASE_TESTID));
    await user.click(await esperarInteractiva(await screen.findByTestId(UNIT_OPTION_NO_BASE_TESTID)));
    await user.click(screen.getByTestId(UNIT_FORM_SUBMIT_TESTID));

    const enviado = await formDataDelAlta();
    expect(NO_BASE_UNIT_VALUE).toBe('');
    expect(enviado.has(UNIT_BASE_FIELD)).toBe(false);
    expect(enviado.has(UNIT_FACTOR_FIELD)).toBe(false);
  });
});

describe('cada codigo de error pinta donde le toca (R37)', () => {
  /** Alta que falla con el codigo dado, con los cuatro campos escritos. */
  async function altaQueFalla(user: ReturnType<typeof setupUser>, code: CodigoCatalogado, message: string) {
    createUnitActionMock.mockResolvedValue({ status: 'error', code, message });
    await abrirAlta(user);

    await user.type(screen.getByTestId(UNIT_FIELD_NAME_TESTID), NOMBRE_ESCRITO);
    await user.type(screen.getByTestId(UNIT_FIELD_SYMBOL_TESTID), SIMBOLO_ESCRITO);
    await user.click(screen.getByTestId(UNIT_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createUnitActionMock).toHaveBeenCalledTimes(1));
  }

  it('`duplicate_name` va junto al campo del nombre, y el panel sigue abierto con lo escrito', async () => {
    const user = setupUser();
    await altaQueFalla(user, DUPLICATE_NAME_CODE, 'Ya existe una unidad con ese nombre.');

    const errorDelCampo = await screen.findByTestId(UNIT_ERROR_NAME_TESTID);
    const campo = screen.getByTestId(UNIT_FIELD_NAME_TESTID);
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAttribute('aria-describedby', errorDelCampo.id);
    expect(screen.queryByTestId(UNIT_FORM_ERROR_TESTID)).toBeNull();
    expect(screen.queryByTestId(UNIT_ERROR_SYMBOL_TESTID)).toBeNull();

    expect(screen.getByTestId(UNIT_FORM_TESTID)).toBeInTheDocument();
    expect(campo).toHaveValue(NOMBRE_ESCRITO);
    expect(screen.getByTestId(UNIT_FIELD_SYMBOL_TESTID)).toHaveValue(SIMBOLO_ESCRITO);
    expect(toastExito).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it('`duplicate_symbol` va junto al campo del simbolo', async () => {
    const user = setupUser();
    await altaQueFalla(user, DUPLICATE_SYMBOL_CODE, 'Ya existe una unidad con ese simbolo.');

    const errorDelCampo = await screen.findByTestId(UNIT_ERROR_SYMBOL_TESTID);
    const campo = screen.getByTestId(UNIT_FIELD_SYMBOL_TESTID);
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAttribute('aria-describedby', errorDelCampo.id);
    expect(screen.queryByTestId(UNIT_ERROR_NAME_TESTID)).toBeNull();
    expect(screen.queryByTestId(UNIT_FORM_ERROR_TESTID)).toBeNull();
    expect(screen.getByTestId(UNIT_FORM_TESTID)).toBeInTheDocument();
  });

  it('`invalid_derivation` va junto al SELECTOR de la unidad de la que deriva', async () => {
    const user = setupUser();
    await altaQueFalla(user, INVALID_DERIVATION_CODE, 'La derivacion no es valida.');

    const errorDelCampo = await screen.findByTestId(UNIT_ERROR_BASE_TESTID);
    const disparador = screen.getByTestId(UNIT_FIELD_BASE_TESTID);
    expect(disparador).toHaveAttribute('aria-invalid', 'true');
    expect(disparador).toHaveAttribute('aria-describedby', errorDelCampo.id);
    expect(screen.queryByTestId(UNIT_ERROR_NAME_TESTID)).toBeNull();
    expect(screen.queryByTestId(UNIT_FORM_ERROR_TESTID)).toBeNull();
    expect(screen.getByTestId(UNIT_FORM_TESTID)).toBeInTheDocument();
  });

  it('cualquier otro codigo va a la region de error del formulario', async () => {
    const user = setupUser();
    await altaQueFalla(user, INVALID_INPUT_CODE, 'La entrada recibida no es valida.');

    const region = await screen.findByTestId(UNIT_FORM_ERROR_TESTID);
    expect(region).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId(UNIT_FORM_ERROR_CODE_TESTID)).toHaveTextContent(INVALID_INPUT_CODE);
    // No se duplica junto a ningun campo.
    expect(screen.queryByTestId(UNIT_ERROR_NAME_TESTID)).toBeNull();
    expect(screen.queryByTestId(UNIT_ERROR_SYMBOL_TESTID)).toBeNull();
    expect(screen.queryByTestId(UNIT_ERROR_BASE_TESTID)).toBeNull();

    expect(screen.getByTestId(UNIT_FORM_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(UNIT_FIELD_NAME_TESTID)).toHaveValue(NOMBRE_ESCRITO);
    expect(toastExito).not.toHaveBeenCalled();
  });
});

describe('con exito se cierra, avisa por toast y refresca la MISMA URL (R38)', () => {
  it('el alta', async () => {
    const user = setupUser();
    await abrirAlta(user);

    await user.type(screen.getByTestId(UNIT_FIELD_NAME_TESTID), NOMBRE_ESCRITO);
    await user.click(screen.getByTestId(UNIT_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createUnitActionMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId(UNIT_FORM_TESTID)).toBeNull());
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('la edicion', async () => {
    const user = setupUser();
    await abrirEdicion(user);

    await user.click(screen.getByTestId(UNIT_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(updateUnitActionMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId(UNIT_FORM_TESTID)).toBeNull());
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('el panel no monta ninguna region de avisos propia (R39)', async () => {
    const user = setupUser();
    await abrirAlta(user);

    expect(document.querySelectorAll('[aria-live]')).toHaveLength(0);
  });
});
