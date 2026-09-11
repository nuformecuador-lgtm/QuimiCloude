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
 *
 * **Las unidades llegan por parametro**, ya cargadas por la pagina de detalle (R46): el mock de
 * `listUnitsAction` sigue puesto justamente para comprobar que esta funcion **no lo llama**.
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
const UNIDAD_CON_SIMBOLO = { id: 'unit-1', name: 'Kilogramo', symbol: 'kg', baseUnitId: null, factor: null };
const UNIDAD_SIN_SIMBOLO = { id: 'unit-2', name: 'Pieza', symbol: null, baseUnitId: null, factor: null };

/** El catalogo de unidades tal como lo baja la pagina de detalle por props (R46). */
const UNIDADES = [UNIDAD_CON_SIMBOLO, UNIDAD_SIN_SIMBOLO];

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
        // QC-80 (R15): `PresentationView` declara su unidad. Un uuid cualquiera: esta
        // pantalla no la pinta -la unidad de la LINEA de catalogo es propia (R26)-.
        unitId: '11111111-1111-4111-8111-111111111111',
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
});

describe('diccionarios del catalogo — resolucion de nombres (R22)', () => {
  it('un id presente se resuelve a su nombre, no a su identificador', async () => {
    const directorios = await buildCatalogDirectories(UNIDADES);

    expect(resolvePresentationName(directorios, PRESENTACION.id)).toBe(PRESENTACION.name);
    expect(resolveUnitLabel(directorios, UNIDAD_CON_SIMBOLO.id)).toBe(UNIDAD_CON_SIMBOLO.symbol);
    // Sin simbolo se muestra el nombre (`design.md > 6.2`, mismo criterio que QC-26).
    expect(resolveUnitLabel(directorios, UNIDAD_SIN_SIMBOLO.id)).toBe(UNIDAD_SIN_SIMBOLO.name);
  });

  it('un id ausente devuelve «no resuelto» para que la celda pinte el marcador', async () => {
    const directorios = await buildCatalogDirectories(UNIDADES);

    expect(resolvePresentationName(directorios, ID_FUERA_DEL_DICCIONARIO)).toBeNull();
    expect(resolveUnitLabel(directorios, ID_FUERA_DEL_DICCIONARIO)).toBeNull();
    // Una linea SIN unidad es un caso valido (la unidad es opcional desde QC-32) y tambien pinta
    // el marcador: no hay nombre que mostrar.
    expect(resolveUnitLabel(directorios, null)).toBeNull();
  });

  it('sin catalogo de unidades lo suyo queda sin resolver y lo demas se sigue resolviendo', async () => {
    // R22 + R7: que las unidades no lleguen no puede inventar un nombre ni tumbar la tabla. El
    // fallo de `listUnitsAction` lo atiende la pagina de detalle, que corta antes de llegar aqui.
    const directorios = await buildCatalogDirectories([]);

    expect(resolveUnitLabel(directorios, UNIDAD_CON_SIMBOLO.id)).toBeNull();
    expect(resolvePresentationName(directorios, PRESENTACION.id)).toBe(PRESENTACION.name);
  });

  it('un fallo a mitad del recorrido conserva las presentaciones ya resueltas', async () => {
    listPresentationsActionMock
      .mockResolvedValueOnce(paginaDePresentaciones([PRESENTACION], { page: 1, totalPages: 3 }))
      .mockResolvedValueOnce({ status: 'error', code: 'invalid_input', message: 'Falló.' });

    const directorios = await buildCatalogDirectories(UNIDADES);

    expect(listPresentationsActionMock).toHaveBeenCalledTimes(2);
    expect(resolvePresentationName(directorios, PRESENTACION.id)).toBe(PRESENTACION.name);
    expect(resolvePresentationName(directorios, ID_FUERA_DEL_DICCIONARIO)).toBeNull();
  });
});

describe('diccionarios del catalogo — coste de la construccion (R22)', () => {
  it('el diccionario de unidades no cuesta NINGUNA consulta y las presentaciones usan el tope importado', async () => {
    // R46 — las unidades llegan por parametro desde la pagina; volver a pedirlas aqui seria
    // repetir en cada carga una consulta que ya esta hecha.
    const directorios = await buildCatalogDirectories(UNIDADES);

    expect(listUnitsActionMock).not.toHaveBeenCalled();
    expect(resolveUnitLabel(directorios, UNIDAD_CON_SIMBOLO.id)).toBe(UNIDAD_CON_SIMBOLO.symbol);
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

    const directorios = await buildCatalogDirectories(UNIDADES);

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

    const directorios = await buildCatalogDirectories(UNIDADES);

    expect(listPresentationsActionMock).toHaveBeenCalledTimes(MAX_PRESENTATION_PAGES);
    expect(resolvePresentationName(directorios, `pres-${MAX_PRESENTATION_PAGES + 1}`)).toBeNull();
  });
});
