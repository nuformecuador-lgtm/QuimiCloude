// QC-35 T9 — Selector de receta con busqueda al SERVIDOR: R31 y R43.
//
// **La busqueda tiene que salir del navegador.** Lo que R31 prohibe es recortar por texto el
// array ya descargado: eso solo miraria la pagina cargada y mentiria sobre el catalogo. Por eso
// el test central no mira la lista pintada, sino **con que argumentos se llamo a
// `listRecipesAction`**, y comprueba ademas que la lista NO se recorta en memoria.
//
// **Ningun assert sobre copy** (R44): todo se localiza por `data-testid` y por rol accesible.

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RECIPE_FIELD,
  RECIPE_PICKER_TESTID,
  RecipePicker,
  type RecipePickerPage,
} from '@/app/(private)/pedidos/components';
import type { RecipeListResult } from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';

const { listRecipesActionMock } = vi.hoisted(() => ({
  listRecipesActionMock: vi.fn<(query: unknown) => Promise<RecipeListResult>>(),
}));

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  listRecipesAction: listRecipesActionMock,
}));

const testId = {
  campo: RECIPE_PICKER_TESTID,
  valor: `${RECIPE_PICKER_TESTID}-value`,
  opcion: `${RECIPE_PICKER_TESTID}-option`,
  popup: `${RECIPE_PICKER_TESTID}-popup`,
  vacio: `${RECIPE_PICKER_TESTID}-empty`,
} as const;

const PRIMERA_PAGINA = [
  { id: crypto.randomUUID(), name: 'Esmalte azul', imageUrl: null },
  { id: crypto.randomUUID(), name: 'Barniz mate', imageUrl: null },
] as const;

/** Receta que NO esta en la primera pagina: solo se alcanza pidiendo mas al servidor (R31). */
const RECETA_LEJANA = {
  id: crypto.randomUUID(),
  name: 'Disolvente universal',
  imageUrl: null,
} as const;

const INITIAL_PAGE: RecipePickerPage = { items: PRIMERA_PAGINA, totalPages: 2 };

function paginaDeRecetas(items: readonly { id: string; name: string }[]): RecipeListResult {
  return {
    status: 'success',
    data: {
      items: items.map((item) => ({
        ...item,
        description: null,
        imageUrl: null,
        stepCount: 0,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        createdBy: null,
        updatedBy: null,
      })),
      total: items.length,
      page: 1,
      pageSize: MAX_PAGE_SIZE,
      totalPages: 2,
    },
  };
}

function renderPicker(props: Partial<Parameters<typeof RecipePicker>[0]> = {}) {
  return render(
    <form data-testid="formulario">
      <RecipePicker initialPage={INITIAL_PAGE} {...props} />
    </form>,
  );
}

/**
 * Lleva el desplegable al final de su scroll, que es el gesto con el que se pide la pagina
 * siguiente desde el 2026-09-07. Las tres medidas se definen a mano porque jsdom NO calcula
 * layout: sin ellas todo elemento mide 0 y ninguna prueba podria distinguir «al final» de «al
 * principio». El evento se emite tal cual: desplazar no es un gesto de puntero ni de teclado,
 * asi que `user-event` no tiene API para ello.
 */
function scrollAlFinal(altoVisible = 256) {
  const lista = screen.getByTestId(testId.popup);
  Object.defineProperty(lista, 'clientHeight', { value: altoVisible, configurable: true });
  Object.defineProperty(lista, 'scrollHeight', { value: altoVisible * 3, configurable: true });
  Object.defineProperty(lista, 'scrollTop', { value: altoVisible * 2, configurable: true });
  act(() => {
    lista.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
}

/** Lo que el formulario enviaria hoy: el `FormData` real, no el estado del componente. */
function loQueSeEnviaria(): FormData {
  return new FormData(screen.getByTestId('formulario') as HTMLFormElement);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  listRecipesActionMock.mockResolvedValue(paginaDeRecetas([RECETA_LEJANA]));
});

afterEach(() => {
  cleanup();
});

describe('selector de receta (R31, R43)', () => {
  it('escribir dispara la operacion de listado de recetas CON el termino de busqueda', async () => {
    // R31 — la busqueda la resuelve el servidor.
    const user = setupUser();
    renderPicker();

    await user.type(screen.getByTestId(testId.campo), 'disol');

    await waitFor(() => expect(listRecipesActionMock).toHaveBeenCalled());

    const consulta = listRecipesActionMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(consulta.search).toBe('disol');
    expect(consulta.page).toBe(1);
    expect(consulta.pageSize).toBe(MAX_PAGE_SIZE);
  });

  it('NO recorta por texto la coleccion ya descargada: pinta lo que devuelve el servidor', async () => {
    // R31 en negativo — con un filtrado en cliente, «zzz» dejaria la lista vacia. Aqui la lista
    // muestra exactamente lo que devolvio la operacion, que es la unica fuente de verdad.
    const user = setupUser();
    renderPicker();

    await user.type(screen.getByTestId(testId.campo), 'zzz');

    await waitFor(() => expect(listRecipesActionMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getAllByTestId(testId.opcion)).toHaveLength(1),
    );
    expect(screen.getByTestId(testId.opcion)).toHaveAttribute('data-recipe-id', RECETA_LEJANA.id);
    expect(screen.queryByTestId(testId.vacio)).toBeNull();
  });

  it('alcanza una receta que NO esta en la primera pagina y la envia en el campo del formulario', async () => {
    // R31 — «debe permitir alcanzar cualquier receta existente, aunque haya mas de las que caben
    // en una consulta»: la paginacion vive DENTRO del desplegable. Desde el 2026-09-07 el gesto
    // que pide la pagina siguiente es llegar al FINAL DE SU SCROLL, no pulsar «Siguiente».
    const user = setupUser();
    renderPicker();

    await user.click(screen.getByTestId(testId.campo));

    // La primera pagina llega por PROPS (R43): abrirlo no pide nada al servidor.
    await waitFor(() =>
      expect(screen.getAllByTestId(testId.opcion)).toHaveLength(PRIMERA_PAGINA.length),
    );
    expect(listRecipesActionMock).not.toHaveBeenCalled();

    scrollAlFinal();

    await waitFor(() => expect(listRecipesActionMock).toHaveBeenCalledTimes(1));
    expect(listRecipesActionMock.mock.calls[0]?.[0]).toMatchObject({ page: 2 });

    // La pagina 2 se ANEXA: las dos de la primera siguen en la lista.
    const opciones = await screen.findAllByTestId(testId.opcion);
    expect(opciones).toHaveLength(PRIMERA_PAGINA.length + 1);
    const lejana = opciones[opciones.length - 1] as HTMLElement;
    expect(lejana).toHaveAttribute('data-recipe-id', RECETA_LEJANA.id);

    await user.click(await esperarInteractiva(lejana));

    expect(loQueSeEnviaria().get(RECIPE_FIELD)).toBe(RECETA_LEJANA.id);
  });

  it('en la edicion arranca con la receta ya elegida en el campo del formulario', async () => {
    // R28 — la precarga viaja en el campo oculto, que es lo que el `FormData` lleva.
    renderPicker({ defaultValue: RECETA_LEJANA.id, defaultLabel: RECETA_LEJANA.name });

    expect(loQueSeEnviaria().get(RECIPE_FIELD)).toBe(RECETA_LEJANA.id);
    expect(screen.getByTestId(testId.campo)).toHaveValue(RECETA_LEJANA.name);
  });

  it('no importa ninguna operacion de creacion de recetas ni filtra por texto en memoria', () => {
    // R31, R32 por analogia — guardia de FUENTE: el selector solo elige entre las existentes, y
    // un `.filter(` en este archivo es exactamente por donde volveria el filtrado en cliente.
    const fuente = readFileSync(
      'app/(private)/pedidos/components/recipe-picker.tsx',
      'utf8',
    );

    expect(fuente).toContain('listRecipesAction');
    expect(fuente).not.toContain('createRecipeAction');
    expect(fuente).not.toContain('updateRecipeAction');
    expect(fuente).not.toContain('.filter(');
    expect(fuente).not.toContain('toLowerCase(');
    expect(fuente).not.toContain('@/lib/composition');
  });
});
