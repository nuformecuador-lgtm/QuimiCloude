// `AsyncAutocomplete` + `useAsyncPaginatedOptions`: consulta asincrona paginada de 10 en 10,
// carga por scroll y alto maximo del desplegable.
//
// El servidor se sustituye por un doble que registra cada peticion (`query`, `page`, `pageSize`)
// y devuelve la forma `Page<T>` del backend (`items` + `page`/`totalPages`), que es la que
// llegara de verdad desde una Server Action.
//
// El scroll se simula definiendo `scrollHeight`/`clientHeight` sobre el contenedor -en jsdom no
// hay layout, asi que las tres medidas valen 0- y disparando el evento.

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AsyncAutocomplete } from '@/components/shared/async-autocomplete';
import type { AsyncPageRequest } from '@/hooks/use-async-paginated-options';

type Option = { readonly id: string; readonly nombre: string };

const TOTAL_OPCIONES = 25;

/** 25 opciones: con paginas de 10 son 3 paginas, la ultima corta. */
const CATALOGO: readonly Option[] = Array.from({ length: TOTAL_OPCIONES }, (_, index) => ({
  id: `op-${index + 1}`,
  nombre: `Opcion ${index + 1}`,
}));

type Peticion = Pick<AsyncPageRequest, 'query' | 'page' | 'pageSize'>;

/** Doble del servidor: pagina el catalogo y anota lo que le pidieron. */
function crearServidor(catalogo: readonly Option[] = CATALOGO) {
  const peticiones: Peticion[] = [];

  const fetchPage = async ({ query, page, pageSize }: AsyncPageRequest) => {
    peticiones.push({ query, page, pageSize });
    const filtradas = catalogo.filter((option) =>
      option.nombre.toLowerCase().includes(query.toLowerCase()),
    );
    const desde = (page - 1) * pageSize;
    return {
      items: filtradas.slice(desde, desde + pageSize),
      page,
      totalPages: Math.max(1, Math.ceil(filtradas.length / pageSize)),
    };
  };

  return { peticiones, fetchPage };
}

/** Lleva el contenedor del desplegable al final de su scroll y avisa. */
function desplazarAlFinal(scroll: HTMLElement, altoVisible = 288) {
  Object.defineProperty(scroll, 'clientHeight', { value: altoVisible, configurable: true });
  Object.defineProperty(scroll, 'scrollHeight', { value: altoVisible * 3, configurable: true });
  Object.defineProperty(scroll, 'scrollTop', { value: altoVisible * 2, configurable: true });
  act(() => {
    scroll.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
}

function obtenerScroll(): HTMLElement {
  const scroll = document.querySelector<HTMLElement>('[data-slot="autocomplete-scroll"]');
  if (!scroll) {
    throw new Error('El desplegable no esta montado.');
  }
  return scroll;
}

describe('AsyncAutocomplete — consulta paginada de 10 en 10', () => {
  it('no consulta nada mientras el desplegable esta cerrado', () => {
    const { peticiones, fetchPage } = crearServidor();

    render(
      <AsyncAutocomplete<Option>
        fetchPage={fetchPage}
        getOptionLabel={(option) => option.nombre}
        getOptionKey={(option) => option.id}
      />,
    );

    expect(peticiones).toHaveLength(0);
  });

  it('al abrir pide la pagina 1 con pageSize 10 y muestra sus diez opciones', async () => {
    const user = userEvent.setup();
    const { peticiones, fetchPage } = crearServidor();

    render(
      <AsyncAutocomplete<Option>
        fetchPage={fetchPage}
        getOptionLabel={(option) => option.nombre}
        getOptionKey={(option) => option.id}
        debounceMs={0}
      />,
    );

    await user.click(screen.getByRole('combobox'));

    await waitFor(() => expect(screen.getByText('Opcion 10')).toBeInTheDocument());
    expect(peticiones).toEqual([{ query: '', page: 1, pageSize: 10 }]);
    expect(screen.queryByText('Opcion 11')).not.toBeInTheDocument();
  });

  it('el tamano de pagina se puede cambiar y viaja tal cual a la consulta', async () => {
    const user = userEvent.setup();
    const { peticiones, fetchPage } = crearServidor();

    render(
      <AsyncAutocomplete<Option>
        fetchPage={fetchPage}
        getOptionLabel={(option) => option.nombre}
        getOptionKey={(option) => option.id}
        pageSize={5}
        debounceMs={0}
      />,
    );

    await user.click(screen.getByRole('combobox'));

    await waitFor(() => expect(screen.getByText('Opcion 5')).toBeInTheDocument());
    expect(peticiones).toEqual([{ query: '', page: 1, pageSize: 5 }]);
    expect(screen.queryByText('Opcion 6')).not.toBeInTheDocument();
  });

  it('llegar al final del scroll anexa la pagina siguiente sin perder la anterior', async () => {
    const user = userEvent.setup();
    const { peticiones, fetchPage } = crearServidor();

    render(
      <AsyncAutocomplete<Option>
        fetchPage={fetchPage}
        getOptionLabel={(option) => option.nombre}
        getOptionKey={(option) => option.id}
        debounceMs={0}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    await waitFor(() => expect(screen.getByText('Opcion 10')).toBeInTheDocument());

    desplazarAlFinal(obtenerScroll());

    await waitFor(() => expect(screen.getByText('Opcion 20')).toBeInTheDocument());
    expect(screen.getByText('Opcion 1')).toBeInTheDocument();
    expect(peticiones.map((peticion) => peticion.page)).toEqual([1, 2]);
  });

  it('no vuelve a consultar cuando ya se vio la ultima pagina', async () => {
    const user = userEvent.setup();
    const { peticiones, fetchPage } = crearServidor(CATALOGO.slice(0, 8));

    render(
      <AsyncAutocomplete<Option>
        fetchPage={fetchPage}
        getOptionLabel={(option) => option.nombre}
        getOptionKey={(option) => option.id}
        debounceMs={0}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    await waitFor(() => expect(screen.getByText('Opcion 8')).toBeInTheDocument());

    desplazarAlFinal(obtenerScroll());
    desplazarAlFinal(obtenerScroll());

    expect(peticiones).toHaveLength(1);
  });

  it('escribir reinicia la consulta a la pagina 1 con el texto nuevo', async () => {
    const user = userEvent.setup();
    const { peticiones, fetchPage } = crearServidor();

    render(
      <AsyncAutocomplete<Option>
        fetchPage={fetchPage}
        getOptionLabel={(option) => option.nombre}
        getOptionKey={(option) => option.id}
        debounceMs={0}
      />,
    );

    const campo = screen.getByRole('combobox');
    await user.click(campo);
    await waitFor(() => expect(screen.getByText('Opcion 10')).toBeInTheDocument());

    desplazarAlFinal(obtenerScroll());
    await waitFor(() => expect(screen.getByText('Opcion 20')).toBeInTheDocument());

    await user.type(campo, 'Opcion 21');

    await waitFor(() => expect(screen.getByText('Opcion 21')).toBeInTheDocument());
    expect(screen.queryByText('Opcion 1')).not.toBeInTheDocument();
    const ultima = peticiones.at(-1);
    expect(ultima).toEqual({ query: 'Opcion 21', page: 1, pageSize: 10 });
  });

  it('elegir una opcion la entrega al llamante y la deja en el campo', async () => {
    const user = userEvent.setup();
    const { fetchPage } = crearServidor();
    const onSelect = vi.fn();

    render(
      <AsyncAutocomplete<Option>
        fetchPage={fetchPage}
        getOptionLabel={(option) => option.nombre}
        getOptionKey={(option) => option.id}
        onSelect={onSelect}
        debounceMs={0}
      />,
    );

    const campo = screen.getByRole('combobox');
    await user.click(campo);
    await waitFor(() => expect(screen.getByText('Opcion 3')).toBeInTheDocument());

    await user.click(screen.getByText('Opcion 3'));

    expect(onSelect).toHaveBeenCalledWith(CATALOGO[2]);
    expect(campo).toHaveValue('Opcion 3');
  });

  it('el desplegable respeta el alto maximo que se le pide', async () => {
    const user = userEvent.setup();
    const { fetchPage } = crearServidor();

    render(
      <AsyncAutocomplete<Option>
        fetchPage={fetchPage}
        getOptionLabel={(option) => option.nombre}
        getOptionKey={(option) => option.id}
        maxHeight={200}
        debounceMs={0}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    await waitFor(() => expect(screen.getByText('Opcion 1')).toBeInTheDocument());

    const scroll = obtenerScroll();
    expect(scroll.style.maxHeight).toBe('200px');
    expect(scroll.className).toContain('overflow-y-auto');
  });

  it('teclear una palabra entera dispara UNA sola consulta, no una por letra', async () => {
    // El rebote es la razon de ser del hook: sin el, cada pulsacion seria una consulta. Se
    // ejercita con la escritura REAL de `user-event` -20 ms entre teclas, mas rapido que una
    // persona- contra un rebote de 250 ms, y se afirma sobre el termino que llego al servidor:
    // el de la palabra COMPLETA, no el de ningun prefijo.
    //
    // EXCEPCION DELIBERADA a la forma compartida de teclear (QC-58, R8). El resto del repo usa
    // `setupUser()` de `tests/helpers/user-event`, que teclea con `delay: null`. Aqui NO se
    // puede: los 20 ms entre teclas no son un detalle de implementacion del test, son el
    // SUJETO de la prueba -sin retardo real no hay nada que rebotar y el caso pasaria sin
    // comprobar lo que dice comprobar-.
    //
    // Esta excepcion esta listada POR NOMBRE en `tests/guards/guard-teclear-y-plazo.test.ts`,
    // que es la guardia que prohibe `userEvent.setup(` en el resto de `tests/`. O sea: quitar
    // este retardo obliga a borrarlo tambien de la guardia, y por tanto a que sea una decision
    // y no un descuido de un cambio global.
    //
    // Tampoco se reescribe con relojes falsos: como interactuan los timers falsos con
    // `user-event` es trabajo de diagnostico que QC-58 no tiene presupuestado (`design.md > 8f`).
    const user = userEvent.setup({ delay: 20 });
    const { peticiones, fetchPage } = crearServidor();

    render(
      <AsyncAutocomplete<Option>
        fetchPage={fetchPage}
        getOptionLabel={(option) => option.nombre}
        getOptionKey={(option) => option.id}
        debounceMs={250}
      />,
    );

    const campo = screen.getByRole('combobox');
    await user.click(campo);
    await user.type(campo, 'Opcion');

    await waitFor(() => expect(peticiones.at(-1)?.query).toBe('Opcion'));
    // La primera peticion es la de ABRIR el desplegable -consulta vacia, sin rebote-. De las
    // SEIS pulsaciones no sale ni una consulta mas: solo la de la palabra completa.
    expect(peticiones.map((peticion) => peticion.query)).toEqual(['', 'Opcion']);
  });

  it('un fallo del servidor se muestra y no deja el desplegable en «cargando»', async () => {
    const user = userEvent.setup();
    const fetchPage = vi.fn(async () => {
      throw new Error('503');
    });

    render(
      <AsyncAutocomplete<Option>
        fetchPage={fetchPage}
        getOptionLabel={(option) => option.nombre}
        getOptionKey={(option) => option.id}
        debounceMs={0}
      />,
    );

    await user.click(screen.getByRole('combobox'));

    await waitFor(() => expect(screen.getByText(/No se pudo cargar/)).toBeInTheDocument());
    expect(screen.queryByText('Cargando...')).not.toBeInTheDocument();
  });
});
