import {
  MAX_PRESENTATION_PAGES,
  buildCatalogDirectories,
  resolvePresentationName,
  resolveUnitLabel,
} from '@/app/(private)/proveedores/[id]/components';
import type { PresentationListResult } from '@/lib/modules/inventario/adapters/driving/presentation-actions';
import type { UnitListResult } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';

/**
 * Diccionarios de presentacion y de unidad del catalogo: R22
 * (`specs/QC-44-pantalla-de-proveedores/tasks.md > T11`, `design.md > 6.2`).
 *
 * **Las dos operaciones de lectura estan mockeadas**: son el borde de `inventario` (QC-20) y de
 * `unidades` (QC-32), modulos que esta ficha no abre (R49), y sustituirlas es lo unico que permite
 * ejercitar la cota, el fallo parcial y la resolucion sin base de datos.
 *
 * Los tres asuntos que R22 obliga a demostrar y que **no se ven renderizando**: que un id presente
 * se resuelve a su nombre, que un id ausente devuelve «no resuelto» -para que la celda pinte el
 * marcador en vez del uuid- y que la secuencia de consultas tiene **limite superior**.
 */

const { listPresentationsActionMock, listUnitsActionMock } = vi.hoisted(() => ({
  listPresentationsActionMock: vi.fn<(query: unknown) => Promise<PresentationListResult>>(),
  listUnitsActionMock: vi.fn<() => Promise<UnitListResult>>(),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: listPresentationsActionMock,
}));

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  listUnitsAction: listUnitsActionMock,
}));

const PRESENTACION = { id: 'pres-1', name: 'Tambor 200 L' };
const UNIDAD_CON_SIMBOLO = { id: 'unit-1', name: 'Kilogramo', symbol: 'kg' };
const UNIDAD_SIN_SIMBOLO = { id: 'unit-2', name: 'Pieza', symbol: null };

/** Id que NO esta en ningun diccionario. Inconfundible: el test comprueba que no se resuelve. */
const ID_FUERA_DEL_DICCIONARIO = 'ID-QUE-NADIE-RESUELVE';

function paginaDePresentaciones(
  items: readonly { id: string; name: string }[],
  extra: { page?: number; totalPages?: number } = {},
): PresentationListResult {
  return {
    status: 'success',
    data: {
      items: items.map((item) => ({
        ...item,
        nameNormalized: item.name.toLowerCase(),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      })),
      total: items.length,
      page: extra.page ?? 1,
      pageSize: MAX_PAGE_SIZE,
      totalPages: extra.totalPages ?? 1,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listPresentationsActionMock.mockResolvedValue(paginaDePresentaciones([PRESENTACION]));
  listUnitsActionMock.mockResolvedValue({
    status: 'success',
    data: [UNIDAD_CON_SIMBOLO, UNIDAD_SIN_SIMBOLO],
  });
});

describe('diccionarios del catalogo — resolucion de nombres (R22)', () => {
  it('un id presente se resuelve a su nombre, no a su identificador', async () => {
    const directorios = await buildCatalogDirectories();

    expect(resolvePresentationName(directorios, PRESENTACION.id)).toBe(PRESENTACION.name);
    expect(resolveUnitLabel(directorios, UNIDAD_CON_SIMBOLO.id)).toBe(UNIDAD_CON_SIMBOLO.symbol);
    // Sin simbolo se muestra el nombre (`design.md > 6.2`, mismo criterio que QC-26).
    expect(resolveUnitLabel(directorios, UNIDAD_SIN_SIMBOLO.id)).toBe(UNIDAD_SIN_SIMBOLO.name);
  });

  it('un id ausente devuelve «no resuelto» para que la celda pinte el marcador', async () => {
    const directorios = await buildCatalogDirectories();

    expect(resolvePresentationName(directorios, ID_FUERA_DEL_DICCIONARIO)).toBeNull();
    expect(resolveUnitLabel(directorios, ID_FUERA_DEL_DICCIONARIO)).toBeNull();
    // Una linea SIN unidad es un caso valido (la unidad es opcional desde QC-32) y tambien pinta
    // el marcador: no hay nombre que mostrar.
    expect(resolveUnitLabel(directorios, null)).toBeNull();
  });

  it('si un directorio falla, lo suyo queda sin resolver y lo demas se sigue resolviendo', async () => {
    // R22 + R7: un `unauthorized` de unidades no puede inventar un nombre ni tumbar la tabla.
    listUnitsActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });

    const directorios = await buildCatalogDirectories();

    expect(resolveUnitLabel(directorios, UNIDAD_CON_SIMBOLO.id)).toBeNull();
    expect(resolvePresentationName(directorios, PRESENTACION.id)).toBe(PRESENTACION.name);
  });

  it('un fallo a mitad del recorrido conserva las presentaciones ya resueltas', async () => {
    listPresentationsActionMock
      .mockResolvedValueOnce(paginaDePresentaciones([PRESENTACION], { page: 1, totalPages: 3 }))
      .mockResolvedValueOnce({ status: 'error', code: 'invalid_input', message: 'Falló.' });

    const directorios = await buildCatalogDirectories();

    expect(listPresentationsActionMock).toHaveBeenCalledTimes(2);
    expect(resolvePresentationName(directorios, PRESENTACION.id)).toBe(PRESENTACION.name);
    expect(resolvePresentationName(directorios, ID_FUERA_DEL_DICCIONARIO)).toBeNull();
  });
});

describe('diccionarios del catalogo — coste de la construccion (R22)', () => {
  it('las unidades se piden UNA sola vez y las presentaciones con el tope importado', async () => {
    await buildCatalogDirectories();

    expect(listUnitsActionMock).toHaveBeenCalledTimes(1);
    expect(listPresentationsActionMock).toHaveBeenCalledTimes(1);
    expect(listPresentationsActionMock).toHaveBeenCalledWith({ page: 1, pageSize: MAX_PAGE_SIZE });
  });

  it('el recorrido de presentaciones se detiene en la ultima pagina', async () => {
    listPresentationsActionMock.mockImplementation(async (query) => {
      const { page } = query as { page: number };
      return paginaDePresentaciones([{ id: `pres-${page}`, name: `Presentación ${page}` }], {
        page,
        totalPages: 3,
      });
    });

    const directorios = await buildCatalogDirectories();

    expect(listPresentationsActionMock).toHaveBeenCalledTimes(3);
    expect(resolvePresentationName(directorios, 'pres-3')).toBe('Presentación 3');
  });

  it('el numero de consultas esta ACOTADO aunque el catalogo diga tener paginas infinitas', async () => {
    // R22 + `design.md > 6.2`: ninguna secuencia de consultas de esta pantalla puede quedarse sin
    // limite superior. Con un catalogo enorme se deja de recorrer y las que quedan fuera pintan
    // el marcador (P4 de `requirements.md`).
    listPresentationsActionMock.mockImplementation(async (query) => {
      const { page } = query as { page: number };
      return paginaDePresentaciones([{ id: `pres-${page}`, name: `Presentación ${page}` }], {
        page,
        totalPages: Number.MAX_SAFE_INTEGER,
      });
    });

    const directorios = await buildCatalogDirectories();

    expect(listPresentationsActionMock).toHaveBeenCalledTimes(MAX_PRESENTATION_PAGES);
    expect(resolvePresentationName(directorios, `pres-${MAX_PRESENTATION_PAGES + 1}`)).toBeNull();
  });
});
