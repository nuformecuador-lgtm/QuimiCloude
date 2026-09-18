// El rechazo cruzado EN EL SERVICE, con dobles (R18, R21, R27, R28, R30, R33).
//
// `docs/architecture.md > Acceso a datos y autorizacion`: Prisma conecta como dueno de las
// tablas y no setea claims, asi que ninguna policy de RLS filtra nada. La frontera real es el
// caso de uso. Este archivo prueba esa frontera SIN base de datos: la integracion contra
// Postgres prueba que el `where` filtra de verdad; aqui se prueba lo que el caso de uso DECIDE
// y lo que PASA a sus puertos -los dos repositorios, el catalogo de unidades y el log-.
//
// DOS CLASES DE DOBLE, a proposito:
//
//   - Un ALMACEN EN MEMORIA con proveedores y lineas de DOS empresas, que se comporta como el
//     adaptador promete (`null` / `'not_found'` / `'supplier_not_found'` para lo ajeno) y que
//     registra lo que queda escrito. «No se escribe ninguna fila» solo se demuestra mirando lo
//     que QUEDA, no contando llamadas.
//   - Espias sobre cada metodo, porque la otra mitad -que el ambito que llega al puerto es el
//     DEL ACTOR y nunca uno sacado de la entrada- solo se ve en los argumentos.
//
// NUNCA `UnauthorizedError` ante un proveedor o una linea ajenos: distinguir «no puedes» de «no
// existe» sobre datos de otra empresa es un ORACULO DE EXISTENCIA -quien sondea identificadores
// aprenderia que proveedores tienen las demas-. Por eso no basta con
// `toBeInstanceOf(SupplierNotFoundError)`: se compara el error de lo ajeno con el de un
// identificador que NO EXISTE EN NINGUNA empresa y se exige que sean indistinguibles -misma
// clase, mismo `code`, mismo mensaje-.
//
// Todas las afirmaciones de error van sobre la CLASE y el `code` estable, nunca sobre el texto.

import { describe, expect, it, vi } from 'vitest';

import { createCreateCatalogLine } from '@/lib/modules/proveedores/domain/create-catalog-line';
import { createCreateSupplier } from '@/lib/modules/proveedores/domain/create-supplier';
import { createDeleteCatalogLine } from '@/lib/modules/proveedores/domain/delete-catalog-line';
import { createDeleteSupplier } from '@/lib/modules/proveedores/domain/delete-supplier';
import {
  CatalogLineNotFoundError,
  SupplierNotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/proveedores/domain/errors';
import { createGetSupplier } from '@/lib/modules/proveedores/domain/get-supplier';
import { createListCatalogLines } from '@/lib/modules/proveedores/domain/list-catalog-lines';
import { createListSuppliers } from '@/lib/modules/proveedores/domain/list-suppliers';
import { createUpdateCatalogLine } from '@/lib/modules/proveedores/domain/update-catalog-line';
import { createUpdateSupplier } from '@/lib/modules/proveedores/domain/update-supplier';

import type { Actor } from '@/lib/modules/proveedores/domain/actor';
import type {
  CatalogLineFields,
  CatalogLineView,
  NewCatalogLine,
} from '@/lib/modules/proveedores/domain/catalog-line-view';
import type { ListQuery } from '@/lib/modules/proveedores/domain/list-query';
import type { SupplierScope } from '@/lib/modules/proveedores/domain/supplier-scope';
import type { NewSupplier, SupplierView } from '@/lib/modules/proveedores/domain/supplier-view';
import type { SupplierCatalogRepository } from '@/lib/modules/proveedores/ports/supplier-catalog-repository';
import type { SupplierRepository } from '@/lib/modules/proveedores/ports/supplier-repository';
import type { UnitCatalog } from '@/lib/modules/unidades';

/** Los dos permisos que este modulo exige. Ninguno nuevo nace en esta ficha (R33). */
const CONSULTAR = 'proveedores.consultar';
const MODIFICAR = 'proveedores.modificar';

const EMPRESA_A = '11111111-1111-4111-8111-111111111111';
const EMPRESA_B = '22222222-2222-4222-8222-222222222222';

const PROVEEDOR_A = '33333333-3333-4333-8333-333333333333';
const PROVEEDOR_B = '44444444-4444-4444-8444-444444444444';
/** Un identificador que no existe en NINGUNA empresa: la referencia contra la que se mide que
 *  lo ajeno sea indistinguible de lo inexistente. */
const PROVEEDOR_INEXISTENTE = '99999999-9999-4999-8999-999999999999';

const LINEA_A = '55555555-5555-4555-8555-555555555555';
const LINEA_B = '66666666-6666-4666-8666-666666666666';
const LINEA_INEXISTENTE = '88888888-8888-4888-8888-888888888888';

const PRESENTACION = '77777777-7777-4777-8777-777777777777';

const UNIDAD_SISTEMA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UNIDAD_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UNIDAD_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const UNIDAD_INEXISTENTE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const AHORA = new Date('2026-09-17T12:00:00.000Z');
const now = () => AHORA;

/** Actor con exactamente los permisos que se le pasen, y ninguno mas. */
function actorCon(companyId: string, ...permisos: readonly string[]): Actor {
  return { id: 'actor-1', companyId, permissions: permisos };
}

const ACTOR_A: Actor = actorCon(EMPRESA_A, CONSULTAR, MODIFICAR);

const ENTRADA_PROVEEDOR = { name: 'Insumos Andinos', phone: '+593 99 000 0000', email: null };

const CAMPOS_LINEA = {
  name: 'Acido citrico',
  presentationId: PRESENTACION,
  unitId: null,
  imagePath: null,
  cost: '12.5000',
  minPurchase: null,
  deliveryTime: null,
};

// --- El almacen en memoria, con dato de LAS DOS empresas ---------------------------------------

type ProveedorGuardado = { view: SupplierView; companyId: string; deleted: boolean };
type LineaGuardada = { view: CatalogLineView; companyId: string; deleted: boolean };

function vistaDeProveedor(id: string, data: NewSupplier, actorId: string): SupplierView {
  return {
    id,
    name: data.name,
    nameNormalized: data.nameNormalized,
    phone: data.phone,
    email: data.email,
    createdAt: AHORA,
    updatedAt: AHORA,
    createdBy: actorId,
    updatedBy: actorId,
  };
}

function vistaDeLinea(id: string, supplierId: string, data: CatalogLineFields): CatalogLineView {
  return {
    id,
    supplierId,
    ...data,
    createdAt: AHORA,
    updatedAt: AHORA,
    createdBy: 'actor-0',
    updatedBy: 'actor-0',
  };
}

/**
 * Un proveedor y una linea de A, y un proveedor y una linea de B. Cada metodo hace lo que el
 * adaptador promete: lo que no es de la empresa del ambito vuelve como `null` / `'not_found'` /
 * `'supplier_not_found'` y NO se toca.
 */
function almacen() {
  const proveedores = new Map<string, ProveedorGuardado>([
    [
      PROVEEDOR_A,
      {
        view: vistaDeProveedor(PROVEEDOR_A, { ...ENTRADA_PROVEEDOR, nameNormalized: 'insumos andinos' }, 'actor-0'),
        companyId: EMPRESA_A,
        deleted: false,
      },
    ],
    [
      PROVEEDOR_B,
      {
        view: vistaDeProveedor(PROVEEDOR_B, { ...ENTRADA_PROVEEDOR, nameNormalized: 'insumos andinos' }, 'actor-0'),
        companyId: EMPRESA_B,
        deleted: false,
      },
    ],
  ]);

  const lineas = new Map<string, LineaGuardada>([
    [LINEA_A, { view: vistaDeLinea(LINEA_A, PROVEEDOR_A, CAMPOS_LINEA), companyId: EMPRESA_A, deleted: false }],
    [LINEA_B, { view: vistaDeLinea(LINEA_B, PROVEEDOR_B, CAMPOS_LINEA), companyId: EMPRESA_B, deleted: false }],
  ]);

  const altasDeProveedor: { companyId: string }[] = [];
  const altasDeLinea: { companyId: string }[] = [];
  let contador = 0;

  const proveedorVisible = (id: string, scope: SupplierScope): ProveedorGuardado | null => {
    const guardado = proveedores.get(id);
    if (guardado === undefined || guardado.deleted) return null;
    return guardado.companyId === scope.companyId ? guardado : null;
  };

  const lineaVisible = (id: string, scope: SupplierScope): LineaGuardada | null => {
    const guardada = lineas.get(id);
    if (guardada === undefined || guardada.deleted) return null;
    return guardada.companyId === scope.companyId ? guardada : null;
  };

  const paginaDe = <T>(items: readonly T[]) => ({
    items,
    total: items.length,
    page: 1,
    pageSize: 10,
    totalPages: 1,
  });

  const suppliers = {
    create: vi.fn(async (data: NewSupplier, actorId: string, _now: Date, scope: SupplierScope) => {
      contador += 1;
      const id = `proveedor-nuevo-${String(contador)}`;
      proveedores.set(id, {
        view: vistaDeProveedor(id, data, actorId),
        companyId: scope.companyId,
        deleted: false,
      });
      altasDeProveedor.push({ companyId: scope.companyId });
      return { id };
    }),
    findAliveById: vi.fn(async (id: string, scope: SupplierScope) => proveedorVisible(id, scope)?.view ?? null),
    updateAlive: vi.fn(
      async (id: string, data: NewSupplier, actorId: string, _now: Date, scope: SupplierScope) => {
        const guardado = proveedorVisible(id, scope);
        if (guardado === null) return 'not_found' as const;
        guardado.view = { ...vistaDeProveedor(id, data, actorId), createdBy: guardado.view.createdBy };
        return 'ok' as const;
      },
    ),
    softDeleteAlive: vi.fn(async (id: string, _actorId: string, _now: Date, scope: SupplierScope) => {
      const guardado = proveedorVisible(id, scope);
      if (guardado === null) return false;
      guardado.deleted = true;
      // El arrastre del catalogo, como lo hace el adaptador: SOLO las lineas de esa empresa.
      for (const linea of lineas.values()) {
        if (linea.view.supplierId === id && linea.companyId === scope.companyId) linea.deleted = true;
      }
      return true;
    }),
    listAlive: vi.fn(async (_query: ListQuery, scope: SupplierScope) =>
      paginaDe(
        [...proveedores.values()]
          .filter((guardado) => !guardado.deleted && guardado.companyId === scope.companyId)
          .map((guardado) => guardado.view),
      ),
    ),
  };

  const catalog = {
    create: vi.fn(async (data: NewCatalogLine, _actorId: string, _now: Date, scope: SupplierScope) => {
      if (proveedorVisible(data.supplierId, scope) === null) return 'supplier_not_found' as const;
      contador += 1;
      const id = `linea-nueva-${String(contador)}`;
      const { supplierId, ...campos } = data;
      lineas.set(id, {
        view: vistaDeLinea(id, supplierId, campos),
        companyId: scope.companyId,
        deleted: false,
      });
      altasDeLinea.push({ companyId: scope.companyId });
      return { id };
    }),
    replaceAlive: vi.fn(
      async (id: string, data: CatalogLineFields, _actorId: string, _now: Date, scope: SupplierScope) => {
        const guardada = lineaVisible(id, scope);
        if (guardada === null) return 'not_found' as const;
        guardada.view = vistaDeLinea(id, guardada.view.supplierId, data);
        return 'ok' as const;
      },
    ),
    softDeleteAlive: vi.fn(async (id: string, _actorId: string, _now: Date, scope: SupplierScope) => {
      const guardada = lineaVisible(id, scope);
      if (guardada === null) return false;
      guardada.deleted = true;
      return true;
    }),
    listBySupplierAlive: vi.fn(async (supplierId: string, _query: ListQuery, scope: SupplierScope) => {
      if (proveedorVisible(supplierId, scope) === null) return 'supplier_not_found' as const;
      return paginaDe(
        [...lineas.values()]
          .filter(
            (guardada) =>
              !guardada.deleted &&
              guardada.companyId === scope.companyId &&
              guardada.view.supplierId === supplierId,
          )
          .map((guardada) => guardada.view),
      );
    }),
  };

  return {
    suppliers: suppliers as unknown as SupplierRepository,
    catalog: catalog as unknown as SupplierCatalogRepository,
    espias: { ...suppliers, ...catalog },
    espiasDeProveedor: suppliers,
    espiasDeLinea: catalog,
    proveedores,
    lineas,
    altasDeProveedor,
    altasDeLinea,
  };
}

/** Catalogo de unidades: las de sistema valen para todas; las de empresa, solo para la suya. */
function catalogoDeUnidades() {
  const unidades = new Map<string, { companyId: string | null }>([
    [UNIDAD_SISTEMA, { companyId: null }],
    [UNIDAD_A, { companyId: EMPRESA_A }],
    [UNIDAD_B, { companyId: EMPRESA_B }],
  ]);
  const findRefs = vi.fn(async (ids: readonly string[], companyId: string) =>
    ids.flatMap((id) => {
      const unidad = unidades.get(id);
      if (unidad === undefined) return [];
      if (unidad.companyId !== null && unidad.companyId !== companyId) return [];
      return [{ id, name: 'kilogramo', symbol: 'kg', baseUnitId: null, factor: null }];
    }),
  );
  return { units: { findRefs } as unknown as UnitCatalog, findRefs };
}

/** Los nueve casos de uso cableados contra un almacen y un catalogo de unidades concretos. */
function casosDeUso(suppliers: SupplierRepository, catalog: SupplierCatalogRepository, units: UnitCatalog) {
  const log = { ignoredFields: vi.fn() };
  return {
    createSupplier: createCreateSupplier({ suppliers, now }),
    updateSupplier: createUpdateSupplier({ suppliers, now }),
    deleteSupplier: createDeleteSupplier({ suppliers, now }),
    getSupplier: createGetSupplier({ suppliers }),
    listSuppliers: createListSuppliers({ suppliers, log }),
    createCatalogLine: createCreateCatalogLine({ catalog, units, now }),
    updateCatalogLine: createUpdateCatalogLine({ catalog, units, now }),
    deleteCatalogLine: createDeleteCatalogLine({ catalog, now }),
    listCatalogLines: createListCatalogLines({ catalog, log }),
  };
}

/** Monta los nueve casos de uso sobre un almacen y un catalogo nuevos, todo de una vez. */
function montarTodo() {
  const a = almacen();
  const u = catalogoDeUnidades();
  return { a, u, c: casosDeUso(a.suppliers, a.catalog, u.units) };
}

async function capturar(promesa: Promise<unknown>): Promise<unknown> {
  return promesa.then(
    () => null,
    (error: unknown) => error,
  );
}

/** Retrato del almacen entero: sirve para afirmar «no se escribio NADA», no solo «no se llamo». */
function retrato(a: ReturnType<typeof almacen>): string {
  return JSON.stringify([...a.proveedores.entries(), ...a.lineas.entries()]);
}

describe('R21, R30 — los nueve casos de uso pasan al puerto el ambito DEL ACTOR, nunca el de la entrada', () => {
  it('cada llamada a un puerto lleva exactamente `{ companyId: actor.companyId }` como ULTIMO argumento', async () => {
    const { a, c } = montarTodo();

    await c.createSupplier({ ...ENTRADA_PROVEEDOR, companyId: EMPRESA_B, company_id: EMPRESA_B }, ACTOR_A);
    await c.updateSupplier(PROVEEDOR_A, { ...ENTRADA_PROVEEDOR, companyId: EMPRESA_B }, ACTOR_A);
    await c.getSupplier(PROVEEDOR_A, ACTOR_A);
    await c.listSuppliers({ page: 1 }, ACTOR_A);
    // Las dos entradas de LINEA van limpias, y no por comodidad: sus esquemas son
    // `strictObject`, asi que una empresa en la entrada no se descarta -se RECHAZA-, y eso
    // tiene su propio caso mas abajo.
    await c.createCatalogLine({ supplierId: PROVEEDOR_A, ...CAMPOS_LINEA }, ACTOR_A);
    await c.updateCatalogLine(LINEA_A, CAMPOS_LINEA, ACTOR_A);
    await c.listCatalogLines(PROVEEDOR_A, { page: 1 }, ACTOR_A);
    await c.deleteCatalogLine(LINEA_A, ACTOR_A);
    // La baja del proveedor va la ULTIMA: arrastra su catalogo y dejaria sin objeto a las demas.
    await c.deleteSupplier(PROVEEDOR_A, ACTOR_A);

    const llamadas = Object.entries(a.espias).flatMap(([metodo, espia]) =>
      espia.mock.calls.map((args) => [metodo, args as readonly unknown[]] as const),
    );

    // Los NUEVE metodos de los dos puertos se ejercitaron: sin esto, uno que nadie llamo pasaria
    // el bucle de abajo sin que nadie lo note.
    expect(new Set(llamadas.map(([metodo]) => metodo))).toEqual(
      new Set([
        'create',
        'findAliveById',
        'updateAlive',
        'softDeleteAlive',
        'listAlive',
        'replaceAlive',
        'listBySupplierAlive',
      ]),
    );
    // `create` y `softDeleteAlive` son nombre compartido por los dos puertos: se comprueba
    // ademas que los NUEVE metodos distintos se invocaron, contando por puerto.
    expect(
      Object.values(a.espiasDeProveedor).every((espia) => espia.mock.calls.length > 0),
      'algun metodo de SupplierRepository no se ejercito',
    ).toBe(true);
    expect(
      Object.values(a.espiasDeLinea).every((espia) => espia.mock.calls.length > 0),
      'algun metodo de SupplierCatalogRepository no se ejercito',
    ).toBe(true);

    for (const [metodo, args] of llamadas) {
      expect(args[args.length - 1], `${metodo}: el ambito es el del actor`).toStrictEqual({
        companyId: EMPRESA_A,
      });
    }

    // La empresa de la entrada no llega al puerto por NINGUN camino, ni siquiera serializada
    // dentro de otro argumento.
    expect(JSON.stringify(llamadas)).not.toContain(EMPRESA_B);
  });

  it('R30: las dos altas escriben la empresa del ACTOR, y la de la entrada se descarta', async () => {
    const { a, c } = montarTodo();

    const proveedor = await c.createSupplier(
      { ...ENTRADA_PROVEEDOR, companyId: EMPRESA_B, company_id: EMPRESA_B },
      ACTOR_A,
    );
    const linea = await c.createCatalogLine({ supplierId: PROVEEDOR_A, ...CAMPOS_LINEA }, ACTOR_A);

    expect(a.altasDeProveedor).toEqual([{ companyId: EMPRESA_A }]);
    expect(a.altasDeLinea).toEqual([{ companyId: EMPRESA_A }]);
    expect(a.proveedores.get(proveedor.id)?.companyId).toBe(EMPRESA_A);
    expect(a.lineas.get(linea.id)?.companyId).toBe(EMPRESA_A);

    // Y lo que llega como DATOS al puerto no lleva la empresa: no esta en `NewSupplier` ni en
    // `NewCatalogLine`, asi que lo que no esta en el tipo no se puede escribir por accidente.
    for (const espia of [a.espiasDeProveedor.create, a.espiasDeLinea.create]) {
      const args = espia.mock.calls[0] as unknown as readonly unknown[];
      expect(args[0]).not.toHaveProperty('companyId');
      expect(args[0]).not.toHaveProperty('company_id');
      expect(JSON.stringify(args)).not.toContain(EMPRESA_B);
    }
  });

  it('R30: en las DOS entradas de linea la empresa ni siquiera se descarta -se RECHAZA-, y no se escribe nada', async () => {
    // Los dos esquemas de la linea son `strictObject`: un campo que el tipo no tiene hace caer
    // la entrada entera. Es mas estricto que el del proveedor -que la elimina en silencio- y
    // las dos formas cumplen R30, pero conviene dejar escrito cual hace cada uno: si algun dia
    // el de la linea pasara a `object`, este caso lo dira.
    for (const [nombre, invocar] of [
      [
        'alta',
        (c: ReturnType<typeof casosDeUso>) =>
          c.createCatalogLine({ supplierId: PROVEEDOR_A, ...CAMPOS_LINEA, companyId: EMPRESA_B }, ACTOR_A),
      ],
      [
        'edicion',
        (c: ReturnType<typeof casosDeUso>) =>
          c.updateCatalogLine(LINEA_A, { ...CAMPOS_LINEA, companyId: EMPRESA_B }, ACTOR_A),
      ],
    ] as const) {
      const { a, c } = montarTodo();
      const antes = retrato(a);

      const error = await capturar(invocar(c));
      expect(error, `${nombre} con empresa en la entrada`).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).code).toBe('invalid_input');
      expect(retrato(a)).toBe(antes);
    }
  });
});

describe('R27, R28 — lo de otra empresa es INEXISTENTE, y nunca `UnauthorizedError`', () => {
  type Casos = ReturnType<typeof casosDeUso>;

  const SOBRE_PROVEEDOR = [
    ['getSupplier', (c: Casos, id: string) => c.getSupplier(id, ACTOR_A)],
    ['updateSupplier', (c: Casos, id: string) => c.updateSupplier(id, ENTRADA_PROVEEDOR, ACTOR_A)],
    ['deleteSupplier', (c: Casos, id: string) => c.deleteSupplier(id, ACTOR_A)],
    ['listCatalogLines', (c: Casos, id: string) => c.listCatalogLines(id, { page: 1 }, ACTOR_A)],
    [
      'createCatalogLine',
      (c: Casos, id: string) => c.createCatalogLine({ supplierId: id, ...CAMPOS_LINEA }, ACTOR_A),
    ],
  ] as const;

  for (const [nombre, invocar] of SOBRE_PROVEEDOR) {
    it(`${nombre}: proveedor de OTRA empresa -> SupplierNotFoundError, indistinguible de un id que no existe`, async () => {
      const ajeno = montarTodo();
      const antes = retrato(ajeno.a);
      const errorAjeno = await capturar(invocar(ajeno.c, PROVEEDOR_B));

      expect(errorAjeno, nombre).toBeInstanceOf(SupplierNotFoundError);
      expect(errorAjeno, `${nombre}: oraculo de existencia`).not.toBeInstanceOf(UnauthorizedError);
      expect((errorAjeno as SupplierNotFoundError).code).toBe('supplier_not_found');

      const inexistente = montarTodo();
      const errorInexistente = await capturar(invocar(inexistente.c, PROVEEDOR_INEXISTENTE));

      // INDISTINGUIBLE de lo que no existe: misma clase, mismo `code`, mismo mensaje.
      expect({
        clase: (errorAjeno as Error).constructor.name,
        code: (errorAjeno as SupplierNotFoundError).code,
        message: (errorAjeno as Error).message,
      }).toEqual({
        clase: (errorInexistente as Error).constructor.name,
        code: (errorInexistente as SupplierNotFoundError).code,
        message: (errorInexistente as Error).message,
      });

      // R28: no cambio NI UNA fila, ni la de B ni la de A. Se afirma sobre el ESTADO del
      // almacen, no sobre el conteo de llamadas: los metodos de escritura SI pueden haberse
      // invocado -es lo que el adaptador acotado promete- y devuelven «no encontrado» sin tocar
      // nada.
      expect(retrato(ajeno.a)).toBe(antes);
    });

    it(`${nombre}: CONTROL POSITIVO -con el MISMO almacen, el proveedor propio si se alcanza`, async () => {
      const propio = montarTodo();
      expect(await capturar(invocar(propio.c, PROVEEDOR_A))).toBeNull();
    });
  }

  const SOBRE_LINEA = [
    ['updateCatalogLine', (c: Casos, id: string) => c.updateCatalogLine(id, CAMPOS_LINEA, ACTOR_A)],
    ['deleteCatalogLine', (c: Casos, id: string) => c.deleteCatalogLine(id, ACTOR_A)],
  ] as const;

  for (const [nombre, invocar] of SOBRE_LINEA) {
    it(`${nombre}: linea de OTRA empresa -> CatalogLineNotFoundError, indistinguible de un id que no existe`, async () => {
      const ajeno = montarTodo();
      const antes = retrato(ajeno.a);
      const errorAjeno = await capturar(invocar(ajeno.c, LINEA_B));

      expect(errorAjeno, nombre).toBeInstanceOf(CatalogLineNotFoundError);
      expect(errorAjeno, `${nombre}: oraculo de existencia`).not.toBeInstanceOf(UnauthorizedError);
      expect((errorAjeno as CatalogLineNotFoundError).code).toBe('catalog_line_not_found');

      const inexistente = montarTodo();
      const errorInexistente = await capturar(invocar(inexistente.c, LINEA_INEXISTENTE));
      expect({
        clase: (errorAjeno as Error).constructor.name,
        code: (errorAjeno as CatalogLineNotFoundError).code,
        message: (errorAjeno as Error).message,
      }).toEqual({
        clase: (errorInexistente as Error).constructor.name,
        code: (errorInexistente as CatalogLineNotFoundError).code,
        message: (errorInexistente as Error).message,
      });

      expect(retrato(ajeno.a)).toBe(antes);
    });

    it(`${nombre}: CONTROL POSITIVO -con el MISMO almacen, la linea propia si se alcanza`, async () => {
      const propio = montarTodo();
      expect(await capturar(invocar(propio.c, LINEA_A))).toBeNull();
    });
  }

  it('R27: la ficha de un proveedor ajeno no devuelve NI UN dato de la fila', async () => {
    const { c } = montarTodo();
    const error = await capturar(c.getSupplier(PROVEEDOR_B, ACTOR_A));

    const serializado = JSON.stringify({ ...(error as object), message: (error as Error).message });
    expect(serializado).not.toContain(PROVEEDOR_B);
    expect(serializado).not.toContain(EMPRESA_B);
  });

  it('R28: la baja del proveedor propio NO arrastra ninguna linea de la otra empresa', async () => {
    const { a, c } = montarTodo();
    await c.deleteSupplier(PROVEEDOR_A, ACTOR_A);

    expect(a.proveedores.get(PROVEEDOR_A)?.deleted).toBe(true);
    expect(a.lineas.get(LINEA_A)?.deleted).toBe(true);
    // Lo de B, intacto: ni el proveedor ni su linea.
    expect(a.proveedores.get(PROVEEDOR_B)?.deleted).toBe(false);
    expect(a.lineas.get(LINEA_B)?.deleted).toBe(false);
  });

  it('los dos listados de A no traen nada de B', async () => {
    const { c } = montarTodo();

    const proveedores = await c.listSuppliers({ page: 1 }, ACTOR_A);
    expect(proveedores.items.map((item) => item.id)).toEqual([PROVEEDOR_A]);
    expect(proveedores.total).toBe(1);

    const catalogo = await c.listCatalogLines(PROVEEDOR_A, { page: 1 }, ACTOR_A);
    expect(catalogo.items.map((item) => item.id)).toEqual([LINEA_A]);
    expect(catalogo.total).toBe(1);
  });
});

describe('R21, R33 — el PERMISO se exige ANTES que el ambito, y la empresa no autoriza por si sola', () => {
  /** Dobles que EXPLOTAN: sin permiso, no se puede tocar ningun puerto. */
  function explosivos() {
    const explota = (nombre: string) =>
      vi.fn(() => {
        throw new Error(`${nombre} no debe llamarse sin permiso`);
      });

    const suppliers = {
      create: explota('suppliers.create'),
      findAliveById: explota('suppliers.findAliveById'),
      updateAlive: explota('suppliers.updateAlive'),
      softDeleteAlive: explota('suppliers.softDeleteAlive'),
      listAlive: explota('suppliers.listAlive'),
    };
    const catalog = {
      create: explota('catalog.create'),
      replaceAlive: explota('catalog.replaceAlive'),
      softDeleteAlive: explota('catalog.softDeleteAlive'),
      listBySupplierAlive: explota('catalog.listBySupplierAlive'),
    };
    const units = { findRefs: explota('units.findRefs') };
    const log = { ignoredFields: explota('log.ignoredFields') };

    return {
      casos: casosDeUso(
        suppliers as unknown as SupplierRepository,
        catalog as unknown as SupplierCatalogRepository,
        units as unknown as UnitCatalog,
      ),
      // El log de los listados se cablea dentro de `casosDeUso`, asi que aqui se vigilan los
      // puertos que si se inyectan; el log sin permiso lo cubre `authorization.test.ts`.
      espias: [...Object.values(suppliers), ...Object.values(catalog), ...Object.values(units)],
      log,
    };
  }

  type Explosivos = ReturnType<typeof explosivos>;

  const NUEVE = [
    ['createSupplier', (d: Explosivos, a: Actor) => d.casos.createSupplier(ENTRADA_PROVEEDOR, a)],
    ['updateSupplier', (d: Explosivos, a: Actor) => d.casos.updateSupplier(PROVEEDOR_A, ENTRADA_PROVEEDOR, a)],
    ['deleteSupplier', (d: Explosivos, a: Actor) => d.casos.deleteSupplier(PROVEEDOR_A, a)],
    ['getSupplier', (d: Explosivos, a: Actor) => d.casos.getSupplier(PROVEEDOR_A, a)],
    ['listSuppliers', (d: Explosivos, a: Actor) => d.casos.listSuppliers({ page: 1 }, a)],
    [
      'createCatalogLine',
      (d: Explosivos, a: Actor) =>
        d.casos.createCatalogLine({ supplierId: PROVEEDOR_A, ...CAMPOS_LINEA, unitId: UNIDAD_SISTEMA }, a),
    ],
    [
      'updateCatalogLine',
      (d: Explosivos, a: Actor) =>
        d.casos.updateCatalogLine(LINEA_A, { ...CAMPOS_LINEA, unitId: UNIDAD_SISTEMA }, a),
    ],
    ['deleteCatalogLine', (d: Explosivos, a: Actor) => d.casos.deleteCatalogLine(LINEA_A, a)],
    ['listCatalogLines', (d: Explosivos, a: Actor) => d.casos.listCatalogLines(PROVEEDOR_A, { page: 1 }, a)],
  ] as const;

  for (const [nombre, invocar] of NUEVE) {
    it(`${nombre}: actor SIN permiso y de OTRA empresa -> UnauthorizedError, sin tocar NINGUN puerto`, async () => {
      // Si el ambito se evaluara antes que el permiso, este actor recibiria «no existe» en vez
      // de `unauthorized`, y R21 exige exactamente el orden contrario: el permiso gana.
      const d = explosivos();
      const error = await capturar(invocar(d, actorCon(EMPRESA_B, 'otro.permiso')));

      expect(error, nombre).toBeInstanceOf(UnauthorizedError);
      expect((error as UnauthorizedError).code).toBe('unauthorized');
      for (const espia of d.espias) expect(espia, nombre).not.toHaveBeenCalled();
    });

    it(`${nombre}: la empresa NO AUTORIZA por si sola -ser de la MISMA empresa sin el permiso no abre nada`, async () => {
      const d = explosivos();
      const error = await capturar(invocar(d, actorCon(EMPRESA_A)));

      expect(error, nombre).toBeInstanceOf(UnauthorizedError);
      for (const espia of d.espias) expect(espia, nombre).not.toHaveBeenCalled();
    });
  }

  it('no nace ningun permiso nuevo: siguen siendo `proveedores.consultar` y `proveedores.modificar`', () => {
    expect(CONSULTAR).toBe('proveedores.consultar');
    expect(MODIFICAR).toBe('proveedores.modificar');
  });
});

describe('R18 — la unidad de una linea: de sistema si, propia si, ajena no, ausente si', () => {
  const CASOS_UNIDAD = [
    ['de SISTEMA', UNIDAD_SISTEMA, true],
    ['de la PROPIA empresa', UNIDAD_A, true],
    ['AUSENTE', null, true],
    ['de OTRA empresa', UNIDAD_B, false],
    ['INEXISTENTE', UNIDAD_INEXISTENTE, false],
  ] as const;

  for (const [etiqueta, unitId, aceptada] of CASOS_UNIDAD) {
    it(`alta de linea con unidad ${etiqueta} -> ${aceptada ? 'se acepta' : 'ValidationError, sin escribir nada'}`, async () => {
      const { a, c } = montarTodo();
      const antes = retrato(a);
      const entrada = { supplierId: PROVEEDOR_A, ...CAMPOS_LINEA, unitId };

      if (aceptada) {
        await expect(c.createCatalogLine(entrada, ACTOR_A)).resolves.toBeDefined();
        expect(a.espiasDeLinea.create).toHaveBeenCalledTimes(1);
      } else {
        const error = await capturar(c.createCatalogLine(entrada, ACTOR_A));
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).code).toBe('invalid_input');
        expect(a.espiasDeLinea.create).not.toHaveBeenCalled();
        expect(retrato(a)).toBe(antes);
      }
    });

    it(`edicion de linea con unidad ${etiqueta} -> ${aceptada ? 'se acepta' : 'ValidationError, la linea no se toca'}`, async () => {
      const { a, c } = montarTodo();
      const antes = retrato(a);
      const entrada = { ...CAMPOS_LINEA, unitId };

      if (aceptada) {
        await expect(c.updateCatalogLine(LINEA_A, entrada, ACTOR_A)).resolves.toBeUndefined();
        expect(a.espiasDeLinea.replaceAlive).toHaveBeenCalledTimes(1);
      } else {
        const error = await capturar(c.updateCatalogLine(LINEA_A, entrada, ACTOR_A));
        expect(error).toBeInstanceOf(ValidationError);
        expect(a.espiasDeLinea.replaceAlive).not.toHaveBeenCalled();
        expect(retrato(a)).toBe(antes);
      }
    });
  }

  it('la unidad AJENA se rechaza igual que la INEXISTENTE: misma clase y mismo codigo', async () => {
    const ajena = montarTodo();
    const inexistente = montarTodo();

    const errorAjena = await capturar(
      ajena.c.createCatalogLine({ supplierId: PROVEEDOR_A, ...CAMPOS_LINEA, unitId: UNIDAD_B }, ACTOR_A),
    );
    const errorInexistente = await capturar(
      inexistente.c.createCatalogLine(
        { supplierId: PROVEEDOR_A, ...CAMPOS_LINEA, unitId: UNIDAD_INEXISTENTE },
        ACTOR_A,
      ),
    );

    expect((errorAjena as Error).constructor.name).toBe((errorInexistente as Error).constructor.name);
    expect((errorAjena as ValidationError).code).toBe((errorInexistente as ValidationError).code);
    expect((errorAjena as Error).message).toBe((errorInexistente as Error).message);
  });

  it('la unidad se resuelve por la costura de `unidades`, pasando la empresa DEL ACTOR', async () => {
    const { u, c } = montarTodo();
    await c.createCatalogLine({ supplierId: PROVEEDOR_A, ...CAMPOS_LINEA, unitId: UNIDAD_SISTEMA }, ACTOR_A);

    expect(u.findRefs).toHaveBeenCalledTimes(1);
    expect(u.findRefs.mock.calls[0]).toEqual([[UNIDAD_SISTEMA], EMPRESA_A]);
  });

  it('sin unidad en la entrada no se le pregunta nada a `unidades`', async () => {
    const { u, c } = montarTodo();
    await c.createCatalogLine({ supplierId: PROVEEDOR_A, ...CAMPOS_LINEA, unitId: null }, ACTOR_A);
    expect(u.findRefs).not.toHaveBeenCalled();
  });
});
