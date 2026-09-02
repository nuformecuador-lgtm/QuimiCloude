import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  buildPage,
  toOffsetLimit,
} from '@/lib/shared/pagination';

// Util de paginacion reutilizable (R23, R24, R27, R36; `design.md > 8`, T1 de tasks.md).
describe('paginacion', () => {
  it('devuelve como maximo el tamano de pagina y el total de elementos', () => {
    // R23
    const items = ['a', 'b', 'c'];
    const pagina = buildPage(items, 7, 1, 3);

    expect(pagina.items.length).toBeLessThanOrEqual(pagina.pageSize);
    expect(pagina.total).toBe(7);
  });

  it('usa 10 elementos por pagina cuando no se indica tamano', () => {
    // R24
    expect(DEFAULT_PAGE_SIZE).toBe(10);
    const { limit } = toOffsetLimit(1);
    expect(limit).toBe(10);
  });

  it('calcula desplazamiento y total de paginas', () => {
    // R27
    const paginaTres = toOffsetLimit(3, 10);
    expect(paginaTres).toEqual({ offset: 20, limit: 10 });

    const paginaVacia = buildPage([], 0, 1, 10);
    expect(paginaVacia.totalPages).toBe(1);

    const paginaConDatos = buildPage(['a', 'b'], 25, 2, 10);
    expect(paginaConDatos.totalPages).toBe(3);
  });

  it('acota a 25 el tamano de pagina mayor que el maximo y devuelve ese mismo tamano en la pagina', () => {
    // R36
    expect(MAX_PAGE_SIZE).toBe(25);

    const { limit } = toOffsetLimit(1, 500);
    expect(limit).toBe(25);

    const pagina = buildPage([], 0, 1, limit);
    expect(pagina.pageSize).toBe(25);
  });
});
