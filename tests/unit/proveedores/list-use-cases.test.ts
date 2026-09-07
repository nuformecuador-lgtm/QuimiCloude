// QC-57 T11 — Los dos casos de uso de listado de `proveedores` con el CONTRATO GENERICO de
// consulta, con el repositorio, el catalogo y el log MOCKEADOS (`design.md > 1`, `> 12`).
//
// Cubre R5, R6, R7, R8, R11, R13, R15, R16, R20, R30, R33 y R34. Lo que NO se prueba aqui es
// como se traduce la consulta a SQL: eso es de `tests/integration/proveedores/` -un doble del
// puerto no puede demostrar que la base filtro y ordeno ANTES de paginar-.
//
// EL TEST QUE NO PUEDE FALTAR (`design.md > 12`): pedir orden por `deletedAt` y comprobar LAS
// TRES COSAS A LA VEZ -que la consulta no falla, que el orden aplicado es el de por defecto y
// que el log recibio el campo-. Comprobar solo la primera pasa en verde con un `catch` vacio.

import { describe, expect, it, vi } from 'vitest';

import { NotFoundError, UnauthorizedError, ValidationError } from '@/lib/modules/proveedores/domain/errors';
import { createListCatalogLines } from '@/lib/modules/proveedores/domain/list-catalog-lines';
import { createListSuppliers } from '@/lib/modules/proveedores/domain/list-suppliers';

import type { Actor } from '@/lib/modules/proveedores/domain/actor';
import type { CatalogLineView } from '@/lib/modules/proveedores/domain/catalog-line-view';
import type { ListQuery } from '@/lib/modules/proveedores/domain/list-query';
import type { Page } from '@/lib/modules/proveedores/domain/page';
import type { SupplierView } from '@/lib/modules/proveedores/domain/supplier-view';
import type { ListQueryLog } from '@/lib/modules/proveedores/ports/list-query-log';
import type { SupplierCatalogRepository } from '@/lib/modules/proveedores/ports/supplier-catalog-repository';
import type { SupplierRepository } from '@/lib/modules/proveedores/ports/supplier-repository';

// QC-74: el actor ya no lleva nombre de rol (R18), lleva su conjunto de permisos (R13). El
// autorizado tiene los dos codigos de `proveedores`; el Operador conserva su nombre porque su
// conjunto es EXACTAMENTE el que le siembra el seed —solo `inventario.consultar`—, que no abre
// nada de este modulo.
const ADMIN: Actor = { id: 'admin-1', permissions: ['proveedores.consultar', 'proveedores.modificar'] };
const OPERADOR: Actor = { id: 'operador-1', permissions: ['inventario.consultar'] };
const SUPPLIER_ID = '22222222-2222-4222-8222-222222222222';

function paginaVacia<T>(): Page<T> {
  return { items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 };
}

function montarProveedores() {
  const listAlive = vi.fn<SupplierRepository['listAlive']>(async () => paginaVacia<SupplierView>());
  const suppliers = {
    create: vi.fn<SupplierRepository['create']>(),
    findAliveById: vi.fn<SupplierRepository['findAliveById']>(),
    updateAlive: vi.fn<SupplierRepository['updateAlive']>(),
    softDeleteAlive: vi.fn<SupplierRepository['softDeleteAlive']>(),
    listAlive,
  } satisfies SupplierRepository;
  const log: ListQueryLog = { ignoredFields: vi.fn<ListQueryLog['ignoredFields']>() };
  return { suppliers, log, listSuppliers: createListSuppliers({ suppliers, log }) };
}

function montarCatalogo(
  resultado: Page<CatalogLineView> | 'supplier_not_found' = paginaVacia<CatalogLineView>(),
) {
  const listBySupplierAlive = vi.fn<SupplierCatalogRepository['listBySupplierAlive']>(
    async () => resultado,
  );
  const catalog = {
    create: vi.fn<SupplierCatalogRepository['create']>(),
    replaceAlive: vi.fn<SupplierCatalogRepository['replaceAlive']>(),
    softDeleteAlive: vi.fn<SupplierCatalogRepository['softDeleteAlive']>(),
    listBySupplierAlive,
  } satisfies SupplierCatalogRepository;
  const log: ListQueryLog = { ignoredFields: vi.fn<ListQueryLog['ignoredFields']>() };
  return { catalog, log, listCatalogLines: createListCatalogLines({ catalog, log }) };
}

/** La consulta que llego al puerto de proveedores en la ultima llamada. */
function consultaRecibida(recibidas: readonly (readonly [ListQuery])[]): ListQuery {
  const ultima = recibidas.at(-1);
  if (ultima === undefined) throw new Error('el puerto no fue llamado');
  return ultima[0];
}

/** La consulta que llego al puerto del catalogo (segundo argumento). */
function consultaDelCatalogo(
  recibidas: readonly (readonly [string, ListQuery])[],
): ListQuery {
  const ultima = recibidas.at(-1);
  if (ultima === undefined) throw new Error('el puerto no fue llamado');
  return ultima[1];
}

describe('list-suppliers: autorizacion antes que todo (R33, R34)', () => {
  // R34 exige probarlo DOS veces: con una consulta valida y con una que traiga campos no
  // declarados. Si el permiso se comprobara despues de sanear, el segundo caso fallaria por
  // otro motivo y nadie lo notaria.
  const CONSULTAS: ReadonlyArray<{ readonly nombre: string; readonly entrada: unknown }> = [
    { nombre: 'consulta valida', entrada: { page: 1, pageSize: 10 } },
    {
      nombre: 'consulta con campos no declarados',
      entrada: {
        sort: { columnId: 'deletedAt', direction: 'asc' },
        filters: { nombre: { kind: 'text', value: 'x' } },
      },
    },
  ];

  for (const caso of CONSULTAS) {
    for (const [etiqueta, actor] of [
      ['al Operador', OPERADOR],
      ['al actor ausente', null],
    ] as const) {
      it(`rechaza ${etiqueta} con ${caso.nombre} sin tocar el repositorio`, async () => {
        // R34 — se afirma CONTANDO invocaciones de los dobles, no solo mirando que lanza.
        const { suppliers, log, listSuppliers } = montarProveedores();

        await expect(listSuppliers(caso.entrada, actor)).rejects.toBeInstanceOf(
          UnauthorizedError,
        );
        expect(suppliers.listAlive).toHaveBeenCalledTimes(0);
        expect(log.ignoredFields).toHaveBeenCalledTimes(0);
      });
    }
  }
});

describe('list-catalog-lines: autorizacion antes que todo (R33, R34)', () => {
  const CONSULTAS: ReadonlyArray<{ readonly nombre: string; readonly entrada: unknown }> = [
    { nombre: 'consulta valida', entrada: { page: 1, pageSize: 10 } },
    {
      nombre: 'consulta con campos no declarados',
      entrada: { sort: { columnId: 'deletedAt', direction: 'desc' } },
    },
  ];

  for (const caso of CONSULTAS) {
    for (const [etiqueta, actor] of [
      ['al Operador', OPERADOR],
      ['al actor ausente', null],
    ] as const) {
      it(`rechaza ${etiqueta} con ${caso.nombre} sin tocar el puerto`, async () => {
        // R34 — contando invocaciones, igual que arriba.
        const { catalog, log, listCatalogLines } = montarCatalogo();

        await expect(
          listCatalogLines(SUPPLIER_ID, caso.entrada, actor),
        ).rejects.toBeInstanceOf(UnauthorizedError);
        expect(catalog.listBySupplierAlive).toHaveBeenCalledTimes(0);
        expect(log.ignoredFields).toHaveBeenCalledTimes(0);
      });
    }
  }
});

describe('list-suppliers: el campo no declarado se omite, no rompe y se anota (R5, R6, R7, R8, R11)', () => {
  it('ordenar por deletedAt: no falla, aplica el orden por defecto Y el log recibe el campo', async () => {
    // R5 + R7 + R11 + R6, LAS TRES COSAS A LA VEZ (`design.md > 12`). `deletedAt` no es
    // consultable en ninguna lista (R7) y `sanitizeListQuery` lo poda ademas por su cuenta.
    const { suppliers, log, listSuppliers } = montarProveedores();

    const pagina = await listSuppliers(
      { page: 1, sort: { columnId: 'deletedAt', direction: 'desc' } },
      ADMIN,
    );

    // (a) la consulta NO falla
    expect(pagina.items).toEqual([]);
    // (b) el orden aplicado es el de por defecto: `sort: null` -quien lo traduce a
    //     `name ASC, id ASC` es el adaptador (R11)-
    expect(suppliers.listAlive).toHaveBeenCalledTimes(1);
    expect(consultaRecibida(suppliers.listAlive.mock.calls).sort).toBeNull();
    // (c) el log recibio el campo, con el nombre del listado
    expect(log.ignoredFields).toHaveBeenCalledWith('suppliers', ['deletedAt']);
  });

  it('un filtro con la forma equivocada se omite y se anota, sin fallar (R8)', async () => {
    // R8 — `createdAt` es `dateRange`; pedirlo como rango numerico no puede romper la consulta.
    const { suppliers, log, listSuppliers } = montarProveedores();

    await listSuppliers(
      { filters: { createdAt: { kind: 'numberRange', min: 1, max: 2 } } },
      ADMIN,
    );

    expect(consultaRecibida(suppliers.listAlive.mock.calls).filters).toEqual({});
    expect(log.ignoredFields).toHaveBeenCalledWith('suppliers', ['createdAt']);
  });

  it('el log recibe NOMBRES de campo y nunca el valor buscado ni el del filtro (R6, PII)', async () => {
    // R6 + anti-patron de PII: lo que se registra no puede contener lo que la persona escribio.
    const TERMINO = 'proveedor del cliente Perez';
    const VALOR_DE_FILTRO = 'cliente-secreto';
    const { log, listSuppliers } = montarProveedores();

    await listSuppliers(
      {
        search: TERMINO,
        sort: { columnId: 'inventado', direction: 'asc' },
        filters: { tambienInventado: { kind: 'select', values: [VALOR_DE_FILTRO] } },
      },
      ADMIN,
    );

    expect(log.ignoredFields).toHaveBeenCalledTimes(1);
    const argumentos = JSON.stringify(vi.mocked(log.ignoredFields).mock.calls[0]);
    expect(argumentos).toContain('inventado');
    expect(argumentos).toContain('tambienInventado');
    expect(argumentos).not.toContain(TERMINO);
    expect(argumentos).not.toContain(VALOR_DE_FILTRO);
  });
});

describe('list-suppliers: lo que llega al repositorio (R11, R13, R15, R16, R20, R30)', () => {
  it('sin orden, la consulta llega con sort nulo: el orden de hoy (R11)', async () => {
    const { suppliers, listSuppliers } = montarProveedores();

    await listSuppliers({ page: 3, pageSize: 25 }, ADMIN);

    expect(consultaRecibida(suppliers.listAlive.mock.calls)).toEqual({
      page: 3,
      pageSize: 25,
      sort: null,
      filters: {},
      search: '',
    });
  });

  it('la busqueda del contrato llega intacta al repositorio (R16)', async () => {
    // R16 — una sola propiedad de busqueda, contra `name`. Quien la compara con la columna
    // normalizada -y con la MISMA funcion que decide la unicidad (R19)- es el adaptador.
    const { suppliers, log, listSuppliers } = montarProveedores();

    await listSuppliers({ page: 1, search: 'quimicos' }, ADMIN);

    expect(consultaRecibida(suppliers.listAlive.mock.calls).search).toBe('quimicos');
    expect(log.ignoredFields).toHaveBeenCalledWith('suppliers', []);
  });

  it('una busqueda de solo espacios es ausencia de busqueda (R20)', async () => {
    const { suppliers, listSuppliers } = montarProveedores();

    await listSuppliers({ search: '   ' }, ADMIN);

    expect(consultaRecibida(suppliers.listAlive.mock.calls).search).toBe('');
  });

  it('el filtro declarado y la busqueda llegan JUNTOS, no uno u otro (R15)', async () => {
    const { suppliers, listSuppliers } = montarProveedores();

    await listSuppliers(
      {
        search: 'andinos',
        filters: { createdAt: { kind: 'dateRange', from: '2026-01-01', to: null } },
      },
      ADMIN,
    );

    const query = consultaRecibida(suppliers.listAlive.mock.calls);
    expect(query.search).toBe('andinos');
    expect(query.filters).toEqual({
      createdAt: { kind: 'dateRange', from: '2026-01-01', to: null },
    });
  });

  it('la entrada que no cumple la FORMA se rechaza antes de tocar el repositorio (R30)', async () => {
    // R30 — validar es del caso de uso, con zod, ANTES del repositorio. Un campo no declarado
    // se omite (R5); una pagina 0 es otra cosa: la forma esta mal y se rechaza.
    const { suppliers, log, listSuppliers } = montarProveedores();

    await expect(listSuppliers({ page: 0 }, ADMIN)).rejects.toBeInstanceOf(ValidationError);
    expect(suppliers.listAlive).toHaveBeenCalledTimes(0);
    expect(log.ignoredFields).toHaveBeenCalledTimes(0);
  });
});

describe('list-catalog-lines: mismo contrato, y las DOS condiciones de vida siguen en el puerto', () => {
  it('ordenar por un campo no declarado: no falla, orden por defecto y log (R5, R6, R11)', async () => {
    // R11 — el orden por defecto del catalogo es `created_at ASC, id ASC` y NO cambia; el
    // dominio lo expresa mandando `sort: null`.
    const { catalog, log, listCatalogLines } = montarCatalogo();

    const pagina = await listCatalogLines(
      SUPPLIER_ID,
      { sort: { columnId: 'imagePath', direction: 'asc' } },
      ADMIN,
    );

    expect(pagina.items).toEqual([]);
    expect(consultaDelCatalogo(catalog.listBySupplierAlive.mock.calls).sort).toBeNull();
    expect(log.ignoredFields).toHaveBeenCalledWith('supplierCatalogLines', ['imagePath']);
  });

  it('el id del proveedor y la consulta saneada llegan al puerto, y las dos vidas son suyas (R7)', async () => {
    // R7 — «el proveedor tiene que estar vivo» y «la linea tiene que estar viva» viven en el
    // `where` de `listBySupplierAlive`, NO en un `if` del dominio: el caso de uso no las
    // menciona y por eso no puede olvidarlas. Aqui solo se comprueba que delega.
    const { catalog, listCatalogLines } = montarCatalogo();

    await listCatalogLines(
      SUPPLIER_ID,
      {
        page: 2,
        sort: { columnId: 'minPurchase', direction: 'desc' },
        filters: { cost: { kind: 'numberRange', min: 10, max: 50 } },
        search: 'acido',
      },
      ADMIN,
    );

    expect(catalog.listBySupplierAlive).toHaveBeenCalledTimes(1);
    expect(catalog.listBySupplierAlive.mock.calls[0]?.[0]).toBe(SUPPLIER_ID);
    expect(consultaDelCatalogo(catalog.listBySupplierAlive.mock.calls)).toEqual({
      page: 2,
      sort: { columnId: 'minPurchase', direction: 'desc' },
      filters: { cost: { kind: 'numberRange', min: 10, max: 50 } },
      search: 'acido',
    });
  });

  it('el proveedor dado de baja sigue siendo «no encontrado», no una pagina vacia (R7)', async () => {
    // Se conserva la traduccion de `'supplier_not_found'`: el contrato generico no la toca.
    const { listCatalogLines } = montarCatalogo('supplier_not_found');

    await expect(listCatalogLines(SUPPLIER_ID, { page: 1 }, ADMIN)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('la entrada que no cumple la FORMA se rechaza antes de tocar el puerto (R30)', async () => {
    const { catalog, log, listCatalogLines } = montarCatalogo();

    await expect(listCatalogLines(SUPPLIER_ID, { page: 0 }, ADMIN)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(catalog.listBySupplierAlive).toHaveBeenCalledTimes(0);
    expect(log.ignoredFields).toHaveBeenCalledTimes(0);
  });
});
