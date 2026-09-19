// QC-45 T7 — El panel lateral de alta y edicion de presentacion: R21, R22, R23, R24, R25.
//
// **Las Server Actions estan mockeadas.** No es un atajo: son el borde del modulo `inventario`,
// que esta ficha no abre (R30), y sustituirlas es lo unico que permite ejercitar el panel sin
// base de datos. La validacion previa del cliente NO se mockea: corre con los esquemas de verdad
// del contrato publico.
//
// **El panel se monta solo**, sin la pagina: `page.tsx` y la columna de acciones son de otras
// tasks. El modo CONTROLADO (`open`/`onOpenChange`) es justo el contrato que la fila usara, asi
// que el disparador de fila se simula aqui con un boton minimo que hace lo mismo.
//
// **Ningun assert sobre literales de copy** (R35): todo va por rol ARIA, `data-testid` exportado
// como constante o constantes importadas del contrato.

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import {
  UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
  UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID,
} from '@/components/shared/unexpected-error-notice';
import type { ErrorState } from '@/lib/modules/errores';
import {
  REFERENCIA_DEL_CASO,
  errorInesperado,
  esperarSinIdentificador,
} from '../../helpers/identificador-de-request';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';
import { useState } from 'react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PRESENTATION_CREATE_OPEN_TESTID,
  PRESENTATION_ERROR_NAME_TESTID,
  PRESENTATION_FIELD_NAME_TESTID,
  PRESENTATION_FORM_CANCEL_TESTID,
  PRESENTATION_FORM_ERROR_CODE_TESTID,
  PRESENTATION_FORM_ERROR_TESTID,
  PRESENTATION_FORM_SUBMIT_TESTID,
  PRESENTATION_FORM_TESTID,
  PRESENTATION_BUSINESS_FIELDS,
  PRESENTATION_NAME_FIELD,
  PRESENTATION_SHEET_TESTID,
  PRESENTATION_UNIT_ERROR_TESTID,
  PRESENTATION_UNIT_FIELD,
  PRESENTATION_UNIT_OPTION_TESTID,
  PRESENTATION_UNIT_PLACEHOLDER,
  PRESENTATION_UNIT_SELECT_TESTID,
  PresentationSheet,
  type PresentationSheetTarget,
} from '@/app/(private)/configuracion/presentaciones/components';
import {
  PresentationDuplicateNameError,
  PresentationUnitLockedError,
  ValidationError,
} from '@/lib/modules/inventario';
import type { UnitRef } from '@/lib/modules/unidades';
import type {
  CreatePresentationFormState,
  PresentationMutationFormState,
} from '@/lib/modules/inventario/adapters/driving/presentation-actions';

const { routerMock, createPresentationActionMock, updatePresentationActionMock } = vi.hoisted(
  () => ({
    routerMock: {
      push: vi.fn<(href: string) => void>(),
      replace: vi.fn<(href: string) => void>(),
      refresh: vi.fn<() => void>(),
      back: vi.fn<() => void>(),
      forward: vi.fn<() => void>(),
      prefetch: vi.fn<(href: string) => void>(),
    },
    createPresentationActionMock:
      vi.fn<
        (prev: CreatePresentationFormState, data: FormData) => Promise<CreatePresentationFormState>
      >(),
    updatePresentationActionMock:
      vi.fn<
        (
          id: string,
          prev: PresentationMutationFormState,
          data: FormData,
        ) => Promise<PresentationMutationFormState>
      >(),
  }),
);

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  createPresentationAction: createPresentationActionMock,
  updatePresentationAction: updatePresentationActionMock,
  deletePresentationAction: vi.fn(() => {
    throw new Error('deletePresentationAction no debe invocarse desde el panel lateral');
  }),
  listPresentationsAction: vi.fn(() => {
    throw new Error('listPresentationsAction no debe invocarse desde el panel lateral');
  }),
}));

/**
 * Codigos ESTABLES del dominio, tomados de las clases de error y no escritos a mano (R24).
 *
 * QC-70 (R20): el codigo del nombre repetido se abrio por caso concreto y ahora vale
 * `presentation_duplicate_name`; la clase que lo declara pasa a llamarse
 * `PresentationDuplicateNameError`. Se sigue leyendo de la clase y no de un literal, asi que si el
 * catalogo lo volviera a mover, esta suite se entera sin tocarla.
 */
const PRESENTATION_DUPLICATE_NAME_CODE = new PresentationDuplicateNameError().code;
const PRESENTATION_UNIT_LOCKED_CODE = new PresentationUnitLockedError().code;
const INVALID_INPUT_CODE = new ValidationError().code;

const NOMBRE_ESCRITO = 'Bidón 20 L';

/**
 * QC-80 (R16): el catalogo ENTERO de unidades, tal cual bajaria de `listUnitsAction()` por props.
 * Los identificadores son uuid de verdad porque el esquema del contrato publico exige `uuid` y
 * este test corre la validacion previa SIN mockear: un `'unit-kg'` fallaria por el sitio
 * equivocado.
 */
const UNIDAD_KG: UnitRef = {
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Kilogramo',
  symbol: 'kg',
  baseUnitId: null,
  factor: null,
};
const UNIDAD_LITRO: UnitRef = {
  id: '55555555-5555-4555-8555-555555555555',
  name: 'Litro',
  symbol: null,
  baseUnitId: null,
  factor: null,
};
const UNIDADES: readonly UnitRef[] = [UNIDAD_KG, UNIDAD_LITRO];

const PRESENTACION: PresentationSheetTarget = {
  id: crypto.randomUUID(),
  name: 'Tambor 200 L',
  unitId: UNIDAD_LITRO.id,
};

/**
 * Disparador de fila simulado. La columna de acciones (T4) hara exactamente esto: montar el panel
 * CONTROLADO y abrirlo con la presentacion de la fila.
 */
const ROW_EDIT_TESTID = 'fila-editar';

function FilaConPanel({ presentation }: { readonly presentation: PresentationSheetTarget }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" data-testid={ROW_EDIT_TESTID} onClick={() => setOpen(true)}>
        {presentation.name}
      </button>
      <PresentationSheet
        presentation={presentation}
        units={UNIDADES}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

let toastExito: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  createPresentationActionMock.mockResolvedValue({ status: 'success', id: crypto.randomUUID() });
  updatePresentationActionMock.mockResolvedValue({ status: 'success' });
  toastExito = vi.spyOn(toast, 'success');
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.restoreAllMocks();
});

/** Abre el alta y espera al formulario. */
async function abrirAlta(user: ReturnType<typeof setupUser>) {
  render(<PresentationSheet units={UNIDADES} />);
  await user.click(screen.getByTestId(PRESENTATION_CREATE_OPEN_TESTID));
  return screen.findByTestId(PRESENTATION_FORM_TESTID);
}

/** Elige una unidad del desplegable por su posicion en `UNIDADES` (QC-80 R16). */
async function elegirUnidad(user: ReturnType<typeof setupUser>, indice: number) {
  await user.click(screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID));
  const opciones = await screen.findAllByTestId(PRESENTATION_UNIT_OPTION_TESTID);
  await user.click(await esperarInteractiva(opciones[indice]!));
}

describe('panel lateral de presentaciones (R21-R25)', () => {
  it('el alta se abre en un panel lateral, sin navegar y sin dialogo modal centrado', async () => {
    // R21 — ni pagina aparte ni modal centrado, y ninguna navegacion.
    const user = setupUser();
    await abrirAlta(user);

    const panel = screen.getByTestId(PRESENTATION_SHEET_TESTID);
    expect(panel).toBeInTheDocument();
    // Es el panel lateral del primitivo `sheet`, anclado a un lado.
    expect(panel).toHaveAttribute('data-slot', 'sheet-content');
    expect(panel.getAttribute('data-side')).toBe('right');
    // Y NO un dialogo de alerta centrado.
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.querySelector('[data-slot="alert-dialog-content"]')).toBeNull();

    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('cerrar el panel no navega: los parametros de lista de la URL siguen intactos', async () => {
    // R21 (segunda mitad) — el estado de lista vive en la cadena de consulta y el panel no la
    // toca, asi que abrir y cerrar no puede perderlo. Se comprueba en negativo sobre el router.
    const user = setupUser();
    await abrirAlta(user);

    await user.click(screen.getByTestId(PRESENTATION_FORM_CANCEL_TESTID));

    await waitFor(() => expect(screen.queryByTestId(PRESENTATION_FORM_TESTID)).toBeNull());
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
    expect(createPresentationActionMock).not.toHaveBeenCalled();
  });

  it('la edicion abre el MISMO panel lateral, precargado con el nombre actual', async () => {
    // R21, R23 — el disparador de fila abre el panel controlado; sin abrirlo no hay formulario.
    const user = setupUser();
    render(<FilaConPanel presentation={PRESENTACION} />);

    expect(screen.queryByTestId(PRESENTATION_FORM_TESTID)).toBeNull();

    await user.click(screen.getByTestId(ROW_EDIT_TESTID));

    await screen.findByTestId(PRESENTATION_FORM_TESTID);
    const panel = screen.getByTestId(PRESENTATION_SHEET_TESTID);
    expect(panel).toHaveAttribute('data-slot', 'sheet-content');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByTestId(PRESENTATION_FIELD_NAME_TESTID)).toHaveValue(PRESENTACION.name);
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('la edicion envia el reemplazo completo con el id ligado a la operacion', async () => {
    // R23 — `updatePresentationAction.bind(null, id)`: el id viaja como primer argumento y el
    // nombre entero en el `FormData`.
    const user = setupUser();
    render(<FilaConPanel presentation={PRESENTACION} />);
    await user.click(screen.getByTestId(ROW_EDIT_TESTID));
    await screen.findByTestId(PRESENTATION_FORM_TESTID);

    const campo = screen.getByTestId(PRESENTATION_FIELD_NAME_TESTID);
    await user.clear(campo);
    await user.type(campo, NOMBRE_ESCRITO);
    await user.click(screen.getByTestId(PRESENTATION_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(updatePresentationActionMock).toHaveBeenCalledTimes(1));
    const [idRecibido, , datos] = updatePresentationActionMock.mock.calls[0]!;
    expect(idRecibido).toBe(PRESENTACION.id);
    expect(datos.get(PRESENTATION_NAME_FIELD)).toBe(NOMBRE_ESCRITO);
    // R12: el reemplazo lleva TAMBIEN la unidad, la que ya tenia si no se toco (QC-80 R15).
    expect(datos.get(PRESENTATION_UNIT_FIELD)).toBe(PRESENTACION.unitId);
    expect(createPresentationActionMock).not.toHaveBeenCalled();
  });

  it('el formulario captura EXACTAMENTE los campos de negocio declarados, y ninguno mas', async () => {
    // R22 (+ QC-80 R15) — en negativo: ni id visible, ni marcas de tiempo, ni autoria, ni nombre
    // normalizado. La lista esperada se DERIVA de `PRESENTATION_BUSINESS_FIELDS`, que es la fuente
    // unica: anadir un campo al formulario sin anadirlo alli pone este caso en rojo.
    const user = setupUser();
    const formulario = await abrirAlta(user);

    const nombres = [...formulario.querySelectorAll<HTMLElement>('input, select, textarea')]
      .map((control) => control.getAttribute('name'))
      .filter((nombre): nombre is string => nombre !== null && nombre !== '');

    expect([...nombres].sort()).toEqual([...PRESENTATION_BUSINESS_FIELDS].sort());
    expect(nombres).toContain(PRESENTATION_NAME_FIELD);
    expect(nombres).toContain(PRESENTATION_UNIT_FIELD);
  });

  it('el codigo del nombre repetido es el abierto por caso concreto, no el generico', () => {
    // QC-70 R20 — la pantalla compara contra `presentation_duplicate_name`. Si alguien devolviera
    // el codigo generico de antes, el error dejaria de ir junto al campo y nadie se enteraria.
    expect(PRESENTATION_DUPLICATE_NAME_CODE).toBe('presentation_duplicate_name');
  });

  it('un rechazo por nombre duplicado se pinta JUNTO AL CAMPO sin cerrar ni perder lo escrito', async () => {
    // R24 — el sitio lo decide el `code` estable, nunca el texto del mensaje.
    const user = setupUser();
    createPresentationActionMock.mockResolvedValue({
      status: 'error',
      code: PRESENTATION_DUPLICATE_NAME_CODE,
      message: 'Ya existe una presentacion con un nombre equivalente.',
    });
    await abrirAlta(user);

    await user.type(screen.getByTestId(PRESENTATION_FIELD_NAME_TESTID), NOMBRE_ESCRITO);
    await elegirUnidad(user, 0);
    await user.click(screen.getByTestId(PRESENTATION_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createPresentationActionMock).toHaveBeenCalledTimes(1));
    const errorDelCampo = await screen.findByTestId(PRESENTATION_ERROR_NAME_TESTID);

    // El error va junto al campo, y el campo queda marcado como invalido y descrito por el.
    const campo = screen.getByTestId(PRESENTATION_FIELD_NAME_TESTID);
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAttribute('aria-describedby', errorDelCampo.id);
    // Y NO en la region de error del formulario.
    expect(screen.queryByTestId(PRESENTATION_FORM_ERROR_TESTID)).toBeNull();

    // El panel sigue abierto y lo escrito sigue ahi.
    expect(screen.getByTestId(PRESENTATION_FORM_TESTID)).toBeInTheDocument();
    expect(campo).toHaveValue(NOMBRE_ESCRITO);
    expect(toastExito).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it('un rechazo sin campo senalado va a la region de error del formulario', async () => {
    // R24 — `invalid_input` no identifica ningun campo: se pinta en la region `role="alert"`.
    const user = setupUser();
    createPresentationActionMock.mockResolvedValue({
      status: 'error',
      code: INVALID_INPUT_CODE,
      message: 'La entrada recibida no es valida.',
    });
    await abrirAlta(user);

    await user.type(screen.getByTestId(PRESENTATION_FIELD_NAME_TESTID), NOMBRE_ESCRITO);
    await elegirUnidad(user, 0);
    await user.click(screen.getByTestId(PRESENTATION_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createPresentationActionMock).toHaveBeenCalledTimes(1));
    const region = await screen.findByTestId(PRESENTATION_FORM_ERROR_TESTID);

    expect(region).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId(PRESENTATION_FORM_ERROR_CODE_TESTID)).toHaveTextContent(
      INVALID_INPUT_CODE,
    );
    // No se duplica junto al campo.
    expect(screen.queryByTestId(PRESENTATION_ERROR_NAME_TESTID)).toBeNull();

    expect(screen.getByTestId(PRESENTATION_FORM_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(PRESENTATION_FIELD_NAME_TESTID)).toHaveValue(NOMBRE_ESCRITO);
    expect(toastExito).not.toHaveBeenCalled();
  });

  it('un nombre sin ningun caracter valido no llega a la operacion y se marca en el campo', async () => {
    // R24 — la validacion previa usa el MISMO esquema del contrato publico (su `refine` rechaza
    // «---»), asi que ni se invoca la Server Action.
    const user = setupUser();
    await abrirAlta(user);

    await user.type(screen.getByTestId(PRESENTATION_FIELD_NAME_TESTID), '---');
    // La unidad SI se elige: el rechazo tiene que venir del nombre y de nada mas.
    await elegirUnidad(user, 0);
    await user.click(screen.getByTestId(PRESENTATION_FORM_SUBMIT_TESTID));

    await screen.findByTestId(PRESENTATION_ERROR_NAME_TESTID);
    expect(createPresentationActionMock).not.toHaveBeenCalled();
    expect(screen.getByTestId(PRESENTATION_FORM_TESTID)).toBeInTheDocument();
  });

  it('un alta con exito cierra el panel, avisa por toast y refresca la lista', async () => {
    // R25 — cerrar + aviso emergente + lista al dia sin recargar y sin perder los parametros.
    const user = setupUser();
    await abrirAlta(user);

    await user.type(screen.getByTestId(PRESENTATION_FIELD_NAME_TESTID), NOMBRE_ESCRITO);
    await elegirUnidad(user, 0);
    await user.click(screen.getByTestId(PRESENTATION_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createPresentationActionMock).toHaveBeenCalledTimes(1));
    expect(createPresentationActionMock.mock.calls[0]![1].get(PRESENTATION_NAME_FIELD)).toBe(
      NOMBRE_ESCRITO,
    );

    await waitFor(() => expect(screen.queryByTestId(PRESENTATION_FORM_TESTID)).toBeNull());
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('una edicion con exito cierra el panel, avisa por toast y refresca la lista', async () => {
    // R25 — mismo cierre para el otro modo del panel.
    const user = setupUser();
    render(<FilaConPanel presentation={PRESENTACION} />);
    await user.click(screen.getByTestId(ROW_EDIT_TESTID));
    await screen.findByTestId(PRESENTATION_FORM_TESTID);

    await user.click(screen.getByTestId(PRESENTATION_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(updatePresentationActionMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId(PRESENTATION_FORM_TESTID)).toBeNull());
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('el panel no monta ninguna region de avisos propia', async () => {
    // R26 — en negativo: la unica la monta el layout privado, y aqui no hay ninguna.
    const user = setupUser();
    await abrirAlta(user);

    expect(document.querySelectorAll('[aria-live]')).toHaveLength(0);
  });
});

describe('QC-80 — la unidad de la presentacion (R15, R16, R17, R18)', () => {
  it('el alta EXIGE unidad: sin ella no se envia nada y el error se pinta JUNTO al campo (R17)', async () => {
    // R17 — la validacion previa corre con el MISMO esquema que valida el servidor
    // (`createPresentationSchema`, sin mockear): `unitId` llega como cadena vacia y su `uuid()`
    // la rechaza con `issue.path[0] === 'unitId'`. La Server Action ni se invoca.
    const user = setupUser();
    await abrirAlta(user);

    await user.type(screen.getByTestId(PRESENTATION_FIELD_NAME_TESTID), NOMBRE_ESCRITO);
    // Y NO se elige unidad a proposito: el disparador sigue mostrando el marcador.
    expect(screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID)).toHaveTextContent(
      PRESENTATION_UNIT_PLACEHOLDER,
    );

    await user.click(screen.getByTestId(PRESENTATION_FORM_SUBMIT_TESTID));

    const errorDelCampo = await screen.findByTestId(PRESENTATION_UNIT_ERROR_TESTID);
    expect(errorDelCampo).toHaveAttribute('role', 'alert');

    // El error va JUNTO al selector, que queda marcado como invalido y descrito por el...
    const selector = screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID);
    expect(selector).toHaveAttribute('aria-invalid', 'true');
    expect(selector).toHaveAttribute('aria-describedby', errorDelCampo.id);
    // ...y NO en la region general del formulario, ni junto al campo del nombre.
    expect(screen.queryByTestId(PRESENTATION_FORM_ERROR_TESTID)).toBeNull();
    expect(screen.queryByTestId(PRESENTATION_ERROR_NAME_TESTID)).toBeNull();

    // Lo que R17 existe para impedir: que salga con la unidad vacia.
    expect(createPresentationActionMock).not.toHaveBeenCalled();
    expect(screen.getByTestId(PRESENTATION_FORM_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(PRESENTATION_FIELD_NAME_TESTID)).toHaveValue(NOMBRE_ESCRITO);
  });

  it('el formulario ofrece TODAS las unidades del catalogo que recibe (R16)', async () => {
    // R16 — sin filtrar por empresa y sin ofrecer crear ninguna: el catalogo entero, tal cual.
    const user = setupUser();
    await abrirAlta(user);

    await user.click(screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID));

    const opciones = await screen.findAllByTestId(PRESENTATION_UNIT_OPTION_TESTID);
    expect(opciones.map((opcion) => opcion.dataset.value)).toEqual(
      UNIDADES.map((unidad) => unidad.id),
    );
  });

  it('la edicion PRECARGA la unidad de la presentacion, derivada del contrato (R15)', async () => {
    // R15 — `PresentationSheetTarget` es `Pick<PresentationView, 'id' | 'name' | 'unitId'>`, asi
    // que la unidad no es un campo escrito a mano: viene del contrato de salida. Se comprueba
    // sobre lo que el formulario ENVIARIA sin tocar nada, no sobre estado de React.
    const user = setupUser();
    render(<FilaConPanel presentation={PRESENTACION} />);
    await user.click(screen.getByTestId(ROW_EDIT_TESTID));
    await screen.findByTestId(PRESENTATION_FORM_TESTID);

    // El disparador muestra la unidad actual (sin simbolo, asi que su nombre) y no el marcador.
    const selector = screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID);
    expect(selector).toHaveTextContent(UNIDAD_LITRO.name);
    expect(selector).not.toHaveTextContent(PRESENTATION_UNIT_PLACEHOLDER);

    await user.click(screen.getByTestId(PRESENTATION_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(updatePresentationActionMock).toHaveBeenCalledTimes(1));
    expect(updatePresentationActionMock.mock.calls[0]![2].get(PRESENTATION_UNIT_FIELD)).toBe(
      PRESENTACION.unitId,
    );
  });

  it('la edicion reemplaza la unidad cuando se elige otra (R12, R15)', async () => {
    const user = setupUser();
    render(<FilaConPanel presentation={PRESENTACION} />);
    await user.click(screen.getByTestId(ROW_EDIT_TESTID));
    await screen.findByTestId(PRESENTATION_FORM_TESTID);

    await elegirUnidad(user, 0);
    await user.click(screen.getByTestId(PRESENTATION_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(updatePresentationActionMock).toHaveBeenCalledTimes(1));
    expect(updatePresentationActionMock.mock.calls[0]![2].get(PRESENTATION_UNIT_FIELD)).toBe(
      UNIDAD_KG.id,
    );
  });

  it('tras un rechazo del servidor el panel sigue abierto con el nombre Y la unidad (R18)', async () => {
    // R18 — React 19 resetea los campos no controlados de un `<form action>` al completarse la
    // action, asi que conservar la unidad NO es gratis: `values.unitId` tiene que llegar al
    // `defaultValue` del selector igual que `values.name` llega al del nombre.
    const user = setupUser();
    createPresentationActionMock.mockResolvedValue({
      status: 'error',
      code: PRESENTATION_DUPLICATE_NAME_CODE,
      message: 'Ya existe una presentacion con un nombre equivalente.',
    });
    await abrirAlta(user);

    await user.type(screen.getByTestId(PRESENTATION_FIELD_NAME_TESTID), NOMBRE_ESCRITO);
    await elegirUnidad(user, 1);
    await user.click(screen.getByTestId(PRESENTATION_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createPresentationActionMock).toHaveBeenCalledTimes(1));
    expect(createPresentationActionMock.mock.calls[0]![1].get(PRESENTATION_UNIT_FIELD)).toBe(
      UNIDAD_LITRO.id,
    );

    // El panel sigue abierto...
    await screen.findByTestId(PRESENTATION_ERROR_NAME_TESTID);
    expect(screen.getByTestId(PRESENTATION_FORM_TESTID)).toBeInTheDocument();
    // ...con el nombre escrito...
    expect(screen.getByTestId(PRESENTATION_FIELD_NAME_TESTID)).toHaveValue(NOMBRE_ESCRITO);
    // ...y con la unidad elegida, que es la mitad que se pierde sola.
    expect(screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID)).toHaveTextContent(
      UNIDAD_LITRO.name,
    );

    // Y al reintentar sin volver a tocar el selector, la unidad sigue viajando.
    await user.click(screen.getByTestId(PRESENTATION_FORM_SUBMIT_TESTID));
    await waitFor(() => expect(createPresentationActionMock).toHaveBeenCalledTimes(2));
    expect(createPresentationActionMock.mock.calls[1]![1].get(PRESENTATION_UNIT_FIELD)).toBe(
      UNIDAD_LITRO.id,
    );
    expect(toastExito).not.toHaveBeenCalled();
  });
});

describe('QC-121 — presentation_unit_locked', () => {
  it('la edicion rechazada por unidad bloqueada (R20) se pinta junto al selector, sin cerrar ni perder lo escrito (R22)', async () => {
    const user = setupUser();
    updatePresentationActionMock.mockResolvedValue({
      status: 'error',
      code: PRESENTATION_UNIT_LOCKED_CODE,
      message: 'La presentacion ya tiene lotes y no puede cambiar de unidad.',
    });
    render(<FilaConPanel presentation={PRESENTACION} />);
    await user.click(screen.getByTestId(ROW_EDIT_TESTID));
    await screen.findByTestId(PRESENTATION_FORM_TESTID);

    const campo = screen.getByTestId(PRESENTATION_FIELD_NAME_TESTID);
    await user.clear(campo);
    await user.type(campo, NOMBRE_ESCRITO);
    await elegirUnidad(user, 0);
    await user.click(screen.getByTestId(PRESENTATION_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(updatePresentationActionMock).toHaveBeenCalledTimes(1));
    const errorDelCampo = await screen.findByTestId(PRESENTATION_UNIT_ERROR_TESTID);
    expect(errorDelCampo).toHaveAttribute('role', 'alert');

    const selector = screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID);
    expect(selector).toHaveAttribute('aria-invalid', 'true');
    expect(selector).toHaveAttribute('aria-describedby', errorDelCampo.id);
    expect(screen.queryByTestId(PRESENTATION_FORM_ERROR_TESTID)).toBeNull();
    expect(screen.queryByTestId(PRESENTATION_ERROR_NAME_TESTID)).toBeNull();

    expect(screen.getByTestId(PRESENTATION_FORM_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(PRESENTATION_FIELD_NAME_TESTID)).toHaveValue(NOMBRE_ESCRITO);
    expect(selector).toHaveTextContent(UNIDAD_KG.symbol!);
    expect(toastExito).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
});

/** QC-71 T9 — R17 y R18 en el formulario de presentacion. */
describe('formulario de presentacion — el identificador del error inesperado (QC-71 R17, R18)', () => {
  /** Un alta que la operacion rechaza con el estado dado. */
  async function altaQueFalla(user: ReturnType<typeof setupUser>, estado: ErrorState) {
    createPresentationActionMock.mockResolvedValue(estado);
    await abrirAlta(user);

    await user.type(screen.getByTestId(PRESENTATION_FIELD_NAME_TESTID), NOMBRE_ESCRITO);
    // QC-80 (R10, R17) volvio la unidad OBLIGATORIA y la valida el MISMO esquema en cliente, asi
    // que sin elegirla el envio ni siquiera llega a la operacion y este helper se quedaria
    // esperando una llamada que no ocurre. Elegir unidad no es el sujeto de estos dos casos -lo es
    // el identificador del error inesperado-, es solo lo que hace falta para alcanzarlo.
    await elegirUnidad(user, 0);
    await user.click(screen.getByTestId(PRESENTATION_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createPresentationActionMock).toHaveBeenCalledTimes(1));
  }

  it('el error inesperado ensena el identificador como texto, con su etiqueta', async () => {
    const user = setupUser();
    await altaQueFalla(user, errorInesperado());

    const region = await screen.findByTestId(PRESENTATION_FORM_ERROR_TESTID);

    // Identificado por `data-testid`, nunca por su texto: lo prohibe la convencion de esta
    // pantalla. `toHaveTextContent` sigue probando que el identificador esta RENDERIZADO como
    // texto y no escondido en un atributo (R17).
    const referencia = within(region).getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID);
    expect(referencia).toHaveTextContent(UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL);
    expect(referencia).toHaveTextContent(REFERENCIA_DEL_CASO);
  });

  it('un error del catalogo no ensena identificador ninguno', async () => {
    const user = setupUser();
    await altaQueFalla(user, {
      status: 'error',
      code: INVALID_INPUT_CODE,
      message: 'La entrada recibida no es valida.',
    });

    const region = await screen.findByTestId(PRESENTATION_FORM_ERROR_TESTID);
    expect(within(region).getByTestId(PRESENTATION_FORM_ERROR_CODE_TESTID)).toHaveTextContent(
      INVALID_INPUT_CODE,
    );
    esperarSinIdentificador();
  });
});
