import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { useState, type ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AsyncAutocomplete, loadErrorMessage } from '@/components/shared/async-autocomplete';
import type { AsyncPageRequest } from '@/hooks/use-async-paginated-options';

import { setupUser } from '../../helpers/user-event';

// El contrato ampliado de AsyncAutocomplete: lo que necesitan los buscadores que hoy componen
// los primitivos por su cuenta. El servidor es un doble que anota cada peticion.

type Option = { readonly id: string; readonly nombre: string; readonly activa?: boolean };

const CATALOGO: readonly Option[] = Array.from({ length: 25 }, (_, index) => ({
  id: `op-${index + 1}`,
  nombre: `Opcion ${index + 1}`,
}));

type Peticion = Pick<AsyncPageRequest, 'query' | 'page' | 'pageSize'>;

function crearServidor(catalogo: readonly Option[] = CATALOGO) {
  const peticiones: Peticion[] = [];
  const fetchPage = vi.fn(async ({ query, page, pageSize }: AsyncPageRequest) => {
    peticiones.push({ query, page, pageSize });
    const desde = (page - 1) * pageSize;
    return {
      items: catalogo.slice(desde, desde + pageSize),
      page,
      totalPages: Math.max(1, Math.ceil(catalogo.length / pageSize)),
    };
  });
  return { peticiones, fetchPage };
}

function servidorQueFalla(mensaje: string) {
  return vi.fn(async () => {
    throw new Error(mensaje);
  });
}

type Props = ComponentProps<typeof AsyncAutocomplete<Option>>;

const BASE = {
  getOptionLabel: (option: Option) => option.nombre,
  getOptionKey: (option: Option) => option.id,
  debounceMs: 0,
} satisfies Partial<Props>;

function desplazarAlFinal(scroll: HTMLElement) {
  Object.defineProperty(scroll, 'clientHeight', { value: 256, configurable: true });
  Object.defineProperty(scroll, 'scrollHeight', { value: 768, configurable: true });
  Object.defineProperty(scroll, 'scrollTop', { value: 512, configurable: true });
  act(() => {
    scroll.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
}

/** Un consumidor que controla el texto del campo, como hacen los buscadores. */
function Controlado(props: Omit<Props, 'inputValue' | 'onInputValueChange'> & {
  readonly inicial?: string;
  readonly onTexto?: (texto: string) => void;
}) {
  const { inicial = '', onTexto, ...resto } = props;
  const [texto, setTexto] = useState(inicial);
  const [escrito, setEscrito] = useState<string | null>(null);
  return (
    <AsyncAutocomplete<Option>
      {...resto}
      inputValue={escrito ?? texto}
      searchQuery={resto.searchQuery ?? escrito ?? ''}
      onInputValueChange={(next) => {
        onTexto?.(next);
        setEscrito(next);
      }}
      onSelect={(option) => {
        resto.onSelect?.(option);
        if (option !== null) {
          setTexto(option.nombre);
          setEscrito(null);
        }
      }}
    />
  );
}

afterEach(cleanup);

describe('AsyncAutocomplete ampliado', () => {
  it('R8 — con initialPage, abrir sin buscar no llama a fetchPage y pinta la pagina precargada', async () => {
    const user = setupUser();
    const { fetchPage } = crearServidor();

    render(
      <AsyncAutocomplete<Option>
        {...BASE}
        layout="split"
        fetchPage={fetchPage}
        initialPage={{ items: CATALOGO.slice(0, 2), totalPages: 1 }}
      />,
    );
    await user.click(screen.getByRole('combobox'));

    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('R8 — con initialPage, buscar y pedir la pagina siguiente si consultan al servidor', async () => {
    const user = setupUser();
    const { fetchPage, peticiones } = crearServidor();

    render(
      <AsyncAutocomplete<Option>
        {...BASE}
        layout="split"
        fetchPage={fetchPage}
        pageSize={10}
        initialPage={{ items: CATALOGO.slice(0, 10), totalPages: 3 }}
        slots={{ popupTestId: 'popup' }}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(10));

    desplazarAlFinal(screen.getByTestId('popup'));
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(20));
    expect(peticiones).toEqual([{ query: '', page: 2, pageSize: 10 }]);

    await user.type(screen.getByRole('combobox'), 'op');
    await waitFor(() => expect(peticiones).toContainEqual({ query: 'op', page: 1, pageSize: 10 }));
  });

  it('R8 — una busqueda de solo espacios cuenta como vacia y usa la pagina precargada', async () => {
    const user = setupUser();
    const { fetchPage } = crearServidor();

    render(
      <AsyncAutocomplete<Option>
        {...BASE}
        layout="split"
        fetchPage={fetchPage}
        initialPage={{ items: CATALOGO.slice(0, 3), totalPages: 1 }}
      />,
    );
    await user.type(screen.getByRole('combobox'), '   ');

    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('R9 — excludedKeys aparta esas opciones salvo keepKey, sin consultar de nuevo', async () => {
    const user = setupUser();
    const { fetchPage } = crearServidor(CATALOGO.slice(0, 4));

    const { rerender } = render(
      <AsyncAutocomplete<Option>
        {...BASE}
        layout="split"
        fetchPage={fetchPage}
        excludedKeys={['op-1', 'op-2']}
        keepKey="op-2"
      />,
    );
    await user.click(screen.getByRole('combobox'));

    await waitFor(() =>
      expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
        'Opcion 2',
        'Opcion 3',
        'Opcion 4',
      ]),
    );
    expect(fetchPage).toHaveBeenCalledTimes(1);

    rerender(
      <AsyncAutocomplete<Option>
        {...BASE}
        layout="split"
        fetchPage={fetchPage}
        excludedKeys={['op-1', 'op-2', 'op-3']}
        keepKey="op-2"
      />,
    );

    await waitFor(() =>
      expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
        'Opcion 2',
        'Opcion 4',
      ]),
    );
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('R9 — leadingOptions van delante y no repiten lo que ya trae la consulta', async () => {
    const user = setupUser();
    const { fetchPage } = crearServidor(CATALOGO.slice(0, 2));

    render(
      <AsyncAutocomplete<Option>
        {...BASE}
        layout="split"
        fetchPage={fetchPage}
        leadingOptions={[{ id: 'nueva', nombre: 'Nueva' }, CATALOGO[1]]}
      />,
    );
    await user.click(screen.getByRole('combobox'));

    await waitFor(() =>
      expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
        'Nueva',
        'Opcion 1',
        'Opcion 2',
      ]),
    );
  });

  it('R10 — al cambiar resetKey se descarta lo acumulado y se vuelve a pedir la pagina 1', async () => {
    const user = setupUser();
    const { fetchPage, peticiones } = crearServidor();

    const { rerender } = render(
      <AsyncAutocomplete<Option> {...BASE} layout="split" fetchPage={fetchPage} resetKey="A" />,
    );
    await user.click(screen.getByRole('combobox'));
    await waitFor(() => expect(peticiones).toHaveLength(1));

    rerender(<AsyncAutocomplete<Option> {...BASE} layout="split" fetchPage={fetchPage} resetKey="B" />);

    await waitFor(() => expect(peticiones).toHaveLength(2));
    expect(peticiones[1]).toEqual({ query: '', page: 1, pageSize: 10 });
  });

  it('R10 — sin resetKey, un cambio de props no reinicia la consulta', async () => {
    const user = setupUser();
    const { fetchPage, peticiones } = crearServidor();

    const { rerender } = render(
      <AsyncAutocomplete<Option> {...BASE} layout="split" fetchPage={fetchPage} />,
    );
    await user.click(screen.getByRole('combobox'));
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(10));

    const otraConsulta = vi.fn(async (request: AsyncPageRequest) => fetchPage(request));
    rerender(
      <AsyncAutocomplete<Option>
        {...BASE}
        layout="split"
        fetchPage={otraConsulta}
        placeholder="Otro"
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(peticiones).toHaveLength(1);
    expect(otraConsulta).not.toHaveBeenCalled();
  });

  it('R11 — por defecto, en la presentacion combinada, pinta el texto fijo de hoy', async () => {
    const user = setupUser();

    render(<AsyncAutocomplete<Option> {...BASE} fetchPage={servidorQueFalla('Sin permiso de lectura')} />);
    await user.click(screen.getByRole('combobox'));

    const estado = await screen.findByRole('status');
    await waitFor(() =>
      expect(estado).toHaveTextContent('No se pudo cargar. Sigue escribiendo para reintentar.'),
    );
    expect(estado).not.toHaveTextContent('Sin permiso de lectura');
  });

  it('R11 — por defecto, en la presentacion de los buscadores, pinta el mensaje del servidor en lugar de la lista', async () => {
    const user = setupUser();

    render(
      <AsyncAutocomplete<Option>
        {...BASE}
        layout="split"
        fetchPage={servidorQueFalla('Sin permiso de lectura')}
        slots={{ loadErrorTestId: 'fallo' }}
      />,
    );
    await user.click(screen.getByRole('combobox'));

    const fallo = await screen.findByRole('alert');
    expect(fallo).toHaveTextContent('Sin permiso de lectura');
    expect(fallo).toHaveAttribute('data-testid', 'fallo');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('R11 — renderLoadError pinta lo que decide el consumidor y recibe el Error del hook', async () => {
    const user = setupUser();
    const recibido: Error[] = [];

    render(
      <AsyncAutocomplete<Option>
        {...BASE}
        layout="split"
        fetchPage={servidorQueFalla('Catalogo caido')}
        renderLoadError={(error) => {
          recibido.push(error);
          return <p data-testid="propio">{`Propio: ${loadErrorMessage(error)}`}</p>;
        }}
      />,
    );
    await user.click(screen.getByRole('combobox'));

    expect(await screen.findByTestId('propio')).toHaveTextContent('Propio: Catalogo caido');
    expect(recibido.at(-1)).toBeInstanceOf(Error);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('R11 — renderLoadError tambien sustituye el texto fijo en la presentacion combinada', async () => {
    const user = setupUser();

    render(
      <AsyncAutocomplete<Option>
        {...BASE}
        fetchPage={servidorQueFalla('Catalogo caido')}
        renderLoadError={(error) => <span>{loadErrorMessage(error)}</span>}
      />,
    );
    await user.click(screen.getByRole('combobox'));

    const estado = await screen.findByRole('status');
    await waitFor(() => expect(estado).toHaveTextContent('Catalogo caido'));
    expect(estado).not.toHaveTextContent('No se pudo cargar');
  });

  it('R12 — con el texto controlado, abrir con una eleccion hecha busca sin filtrar', async () => {
    const user = setupUser();
    const { fetchPage, peticiones } = crearServidor();

    render(<Controlado {...BASE} layout="split" fetchPage={fetchPage} inicial="Opcion 3" />);

    const campo = screen.getByRole('combobox');
    expect(campo).toHaveValue('Opcion 3');
    await user.click(campo);

    await waitFor(() => expect(peticiones).toEqual([{ query: '', page: 1, pageSize: 10 }]));
  });

  it('R12 — busca con el termino que indica el consumidor y no con el texto que se ve', async () => {
    const user = setupUser();
    const { fetchPage, peticiones } = crearServidor();

    render(
      <AsyncAutocomplete<Option>
        {...BASE}
        layout="split"
        fetchPage={fetchPage}
        inputValue="Lo que se ve"
        searchQuery="termino"
      />,
    );
    await user.click(screen.getByRole('combobox'));

    await waitFor(() => expect(peticiones).toEqual([{ query: 'termino', page: 1, pageSize: 10 }]));
    expect(screen.getByRole('combobox')).toHaveValue('Lo que se ve');
  });

  it('R12 — escribir avisa al consumidor del texto nuevo y el campo pinta lo que el consumidor decide', async () => {
    const user = setupUser();
    const { fetchPage, peticiones } = crearServidor();
    const textos: string[] = [];

    render(
      <Controlado {...BASE} layout="split" fetchPage={fetchPage} onTexto={(t) => textos.push(t)} />,
    );
    await user.type(screen.getByRole('combobox'), 'ab');

    expect(textos.at(-1)).toBe('ab');
    expect(screen.getByRole('combobox')).toHaveValue('ab');
    await waitFor(() => expect(peticiones).toContainEqual({ query: 'ab', page: 1, pageSize: 10 }));
  });

  it('R13 — la opcion no elegible se pinta deshabilitada, no se elige y no cierra el desplegable', async () => {
    const user = setupUser();
    const catalogo: Option[] = [
      { id: 'a', nombre: 'Elegible', activa: true },
      { id: 'b', nombre: 'Bloqueada', activa: false },
    ];
    const { fetchPage } = crearServidor(catalogo);
    const onSelect = vi.fn();

    render(
      <AsyncAutocomplete<Option>
        {...BASE}
        layout="split"
        fetchPage={fetchPage}
        onSelect={onSelect}
        isOptionDisabled={(option) => option.activa === false}
      />,
    );
    await user.click(screen.getByRole('combobox'));

    const bloqueada = await screen.findByRole('option', { name: 'Bloqueada' });
    expect(bloqueada).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('option', { name: 'Elegible' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );

    act(() => {
      bloqueada.click();
    });

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  it('R14 — al elegir avisa al consumidor antes de que el primitivo notifique el texto nuevo, y cierra', async () => {
    const user = setupUser();
    const { fetchPage } = crearServidor(CATALOGO.slice(0, 3));
    const eventos: string[] = [];

    render(
      <Controlado
        {...BASE}
        layout="split"
        fetchPage={fetchPage}
        onSelect={(option) => eventos.push(`onSelect:${option?.nombre ?? 'null'}`)}
        onTexto={(texto) => eventos.push(`onValueChange:${texto}`)}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Opcion 2' }));

    expect(eventos[0]).toBe('onSelect:Opcion 2');
    expect(eventos).toContain('onValueChange:Opcion 2');
    expect(eventos.slice(1).every((evento) => evento === 'onValueChange:Opcion 2')).toBe(true);
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    expect(screen.getByRole('combobox')).toHaveValue('Opcion 2');
  });

  it('R15 — con queryEnabled={false} no consulta aunque el desplegable este abierto', async () => {
    const user = setupUser();
    const { fetchPage } = crearServidor();

    render(
      <AsyncAutocomplete<Option>
        {...BASE}
        layout="split"
        fetchPage={fetchPage}
        queryEnabled={false}
        showEmpty={false}
        slots={{ emptyTestId: 'vacio' }}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), 'x');

    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchPage).not.toHaveBeenCalled();
    expect(screen.queryByTestId('vacio')).not.toBeInTheDocument();
  });

  it('R15 — con el desplegable cerrado no consulta', () => {
    const { fetchPage } = crearServidor();

    render(<AsyncAutocomplete<Option> {...BASE} layout="split" fetchPage={fetchPage} />);

    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('R16 — los testids, clases, textos y el alto maximo llegan por props', async () => {
    const user = setupUser();
    const { fetchPage } = crearServidor(CATALOGO.slice(0, 11));

    render(
      <AsyncAutocomplete<Option>
        {...BASE}
        layout="split"
        fetchPage={fetchPage}
        maxHeight={256}
        placeholder="Busca una opcion"
        aria-label="Opcion"
        inputValue="Opc"
        searchQuery=""
        slots={{
          inputTestId: 'campo',
          inputClassName: 'w-full text-base',
          clear: { label: 'Borrar opcion', testId: 'borrar', className: 'min-h-11' },
          contentClassName: 'min-w-72',
          popupTestId: 'popup',
          optionTestId: 'fila',
          optionClassName: 'items-start',
          optionDataAttributes: (option) => ({ 'data-option-id': option.id }),
          loadingTestId: 'cargando',
          loadingLabel: 'Cargando opciones...',
          hasMore: { testId: 'hay-mas', label: 'Hay mas opciones' },
        }}
      />,
    );

    const campo = screen.getByTestId('campo');
    expect(campo).toHaveAttribute('placeholder', 'Busca una opcion');
    expect(campo).toHaveClass('w-full', 'text-base');
    expect(screen.getByRole('button', { name: 'Borrar opcion' })).toHaveAttribute(
      'data-testid',
      'borrar',
    );

    await user.click(campo);
    expect(screen.getByTestId('cargando')).toHaveTextContent('Cargando opciones...');

    const filas = await screen.findAllByTestId('fila');
    expect(filas).toHaveLength(10);
    expect(filas[0]).toHaveClass('items-start');
    expect(filas[0]).toHaveAttribute('data-option-id', 'op-1');
    expect(screen.getByTestId('popup')).toHaveStyle({ maxHeight: '256px' });
    expect(screen.getByTestId('popup').closest('[data-slot="autocomplete-content"]')).toHaveClass(
      'min-w-72',
    );
    expect(screen.getByTestId('hay-mas')).toHaveTextContent('Hay mas opciones');
  });

  it('R16 — el umbral de scroll llega por props', async () => {
    const user = setupUser();
    const { fetchPage, peticiones } = crearServidor();

    render(
      <AsyncAutocomplete<Option>
        {...BASE}
        layout="split"
        fetchPage={fetchPage}
        scrollThreshold={0}
        slots={{ popupTestId: 'popup' }}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(10));

    const popup = screen.getByTestId('popup');
    Object.defineProperty(popup, 'clientHeight', { value: 256, configurable: true });
    Object.defineProperty(popup, 'scrollHeight', { value: 768, configurable: true });
    Object.defineProperty(popup, 'scrollTop', { value: 500, configurable: true });
    act(() => {
      popup.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    expect(peticiones).toHaveLength(1);

    desplazarAlFinal(popup);
    await waitFor(() => expect(peticiones).toHaveLength(2));
  });

  it('R16 — sin props nuevas usa los valores de hoy: placeholder, borrar, icono y alto de 288', async () => {
    const user = setupUser();
    const { fetchPage } = crearServidor();

    render(<AsyncAutocomplete<Option> {...BASE} fetchPage={fetchPage} />);

    expect(screen.getByRole('combobox')).toHaveAttribute('placeholder', 'Buscar...');
    expect(document.querySelector('[data-slot="autocomplete-icon"]')).not.toBeNull();

    await user.click(screen.getByRole('combobox'));
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(10));
    await user.click(screen.getByRole('option', { name: 'Opcion 1' }));
    expect(screen.getByRole('button', { name: 'Limpiar' })).toBeInTheDocument();

    await user.click(screen.getByRole('combobox'));
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(10));
    expect(document.querySelector('[data-slot="autocomplete-scroll"]')).toHaveStyle({
      maxHeight: '288px',
    });
  });

  it('R17 — la presentacion de los buscadores no lleva icono ni borrar por defecto, y el vacio es un parrafo propio', async () => {
    const user = setupUser();
    const { fetchPage } = crearServidor([]);

    render(
      <AsyncAutocomplete<Option>
        {...BASE}
        layout="split"
        fetchPage={fetchPage}
        emptyMessage="Nada por aqui."
        slots={{ emptyTestId: 'vacio' }}
      />,
    );

    expect(document.querySelector('[data-slot="autocomplete-icon"]')).toBeNull();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    await user.click(screen.getByRole('combobox'));
    const vacio = await screen.findByTestId('vacio');
    expect(vacio.tagName).toBe('P');
    expect(vacio).toHaveTextContent('Nada por aqui.');
    expect(within(screen.getByRole('status')).queryByText('Nada por aqui.')).not.toBeInTheDocument();
  });

  it('R17 — sin layout pinta la presentacion de hoy: el vacio va dentro de la region de estado', async () => {
    const user = setupUser();
    const { fetchPage } = crearServidor([]);

    render(<AsyncAutocomplete<Option> {...BASE} fetchPage={fetchPage} emptyMessage="Nada por aqui." />);
    await user.click(screen.getByRole('combobox'));

    const estado = await screen.findByRole('status');
    await waitFor(() => expect(estado).toHaveTextContent('Nada por aqui.'));
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-describedby', estado.id);
  });

  it('R19 — no recorta por el texto escrito: pinta todo lo que devuelve el servidor', async () => {
    const user = setupUser();
    const { fetchPage } = crearServidor(CATALOGO.slice(0, 3));

    render(
      <Controlado {...BASE} layout="split" fetchPage={fetchPage} excludedKeys={[]} />,
    );
    await user.type(screen.getByRole('combobox'), 'zzz');

    await waitFor(() => expect(fetchPage).toHaveBeenCalledWith(expect.objectContaining({ query: 'zzz' })));
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
  });
});
