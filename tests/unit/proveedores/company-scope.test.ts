// El punto unico de consulta de `proveedores` y la forma de la salida publica (R23, R31).
//
// Dos cosas, y las dos se prueban en EJECUCION, no solo en texto:
//
//   1. R23: `supplierCompanyScope`, `catalogLineCompanyScope` y `companyScopeColumns` son TRES
//      envolturas de UNA definicion. Existen solo para tipar -dos para un `where` de Prisma
//      (proveedor y linea, que son dos `WhereInput` distintos) y una para lo que se escribe en
//      un `create`-, asi que para cualquier ambito tienen que devolver EXACTAMENTE lo mismo. Si
//      un dia divergieran, el listado y el alta dirian «de la empresa» de dos maneras. La
//      comprobacion por funcion de que TODA consulta pasa por ellas es de
//      `tests/guards/guard-ambito-empresa-proveedores.test.ts`; aqui se fija lo que devuelven.
//
//   2. R31: la empresa ENTRA en la consulta y NO VUELVE. Ni la vista del proveedor, ni la de la
//      linea, ni el estado que devuelven las Server Actions la llevan. Se prueba con filas de
//      Prisma que, en tiempo de ejecucion, SI traen `companyId` de mas -lo que pasaria si
//      alguien anadiera la columna al `select`-: la salida tiene que seguir sin ella, porque
//      los mapeadores construyen campo a campo y no esparcen la fila.
//
//      DONDE ESTA LA FRONTERA, y conviene no equivocarse: los casos de uso de este modulo
//      devuelven la vista del puerto TAL CUAL, sin re-mapear -a diferencia de `pedidos`, que
//      arma la suya-. Asi que quien impide que la empresa salga son el `select` y el mapeador
//      del adaptador, y por eso los dos tienen caso propio aqui.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import {
  catalogLineCompanyScope,
  companyScopeColumns,
  supplierCompanyScope,
} from '@/lib/modules/proveedores/adapters/driven/persistence/company-scope';
import { toCatalogLineView } from '@/lib/modules/proveedores/adapters/driven/persistence/supplier-catalog-line-prisma';
import { toSupplierView } from '@/lib/modules/proveedores/adapters/driven/persistence/supplier-prisma';
import { createGetSupplier } from '@/lib/modules/proveedores/domain/get-supplier';
import { createListCatalogLines } from '@/lib/modules/proveedores/domain/list-catalog-lines';
import { createListSuppliers } from '@/lib/modules/proveedores/domain/list-suppliers';

import type { Actor } from '@/lib/modules/proveedores/domain/actor';
import type { CatalogLineView } from '@/lib/modules/proveedores/domain/catalog-line-view';
import type { SupplierScope } from '@/lib/modules/proveedores/domain/supplier-scope';
import type { SupplierView } from '@/lib/modules/proveedores/domain/supplier-view';
import type { CatalogImageUrl } from '@/lib/modules/proveedores/ports/catalog-image-url';
import type { SupplierCatalogRepository } from '@/lib/modules/proveedores/ports/supplier-catalog-repository';
import type { SupplierRepository } from '@/lib/modules/proveedores/ports/supplier-repository';

const EMPRESA = '11111111-1111-4111-8111-111111111111';
const OTRA_EMPRESA = '22222222-2222-4222-8222-222222222222';
const PROVEEDOR = '33333333-3333-4333-8333-333333333333';
const LINEA = '44444444-4444-4444-8444-444444444444';
const PRESENTACION = '55555555-5555-4555-8555-555555555555';

const AHORA = new Date('2026-09-17T10:00:00.000Z');

const ACTOR: Actor = {
  id: 'u-1',
  companyId: EMPRESA,
  permissions: ['proveedores.consultar', 'proveedores.modificar'],
};

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Fuente SIN comentarios: se vigila el CODIGO, no la prosa que explica la regla. */
function codigoDe(...ruta: readonly string[]): string {
  return readFileSync(join(repoRoot, ...ruta), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

/** Busca `companyId`/`company_id` en CUALQUIER nivel de un valor, y el uuid de la empresa como
 *  valor suelto: una salida que lo llevara con otro nombre tambien lo estaria exponiendo. */
function exponeEmpresa(valor: unknown): boolean {
  const texto = JSON.stringify(valor);
  return /companyId|company_id/i.test(texto) || texto.includes(EMPRESA);
}

/** Fila de Prisma del proveedor que, en EJECUCION, trae la empresa de contrabando. */
function filaDeProveedorConEmpresa(): Parameters<typeof toSupplierView>[0] {
  const fila = {
    id: PROVEEDOR,
    name: 'Quimicos del Pacifico',
    nameNormalized: 'quimicos del pacifico',
    phone: '+593 99 123 4567',
    email: null,
    createdAt: AHORA,
    updatedAt: AHORA,
    createdBy: 'u-0',
    updatedBy: 'u-0',
    companyId: EMPRESA,
  };
  return fila as unknown as Parameters<typeof toSupplierView>[0];
}

/** Lo mismo para una linea del catalogo. */
function filaDeLineaConEmpresa(): Parameters<typeof toCatalogLineView>[0] {
  const fila = {
    id: LINEA,
    supplierId: PROVEEDOR,
    name: 'Acido citrico anhidro',
    presentationId: PRESENTACION,
    unitId: null,
    imagePath: null,
    cost: new Prisma.Decimal('12.5'),
    minPurchase: null,
    deliveryTime: null,
    createdAt: AHORA,
    updatedAt: AHORA,
    createdBy: 'u-0',
    updatedBy: 'u-0',
    companyId: EMPRESA,
  };
  return fila as unknown as Parameters<typeof toCatalogLineView>[0];
}

/** Las vistas que el adaptador REAL entrega al puerto, a partir de esas filas. */
const vistaDeProveedor = (): SupplierView => toSupplierView(filaDeProveedorConEmpresa());
const vistaDeLinea = (): CatalogLineView => toCatalogLineView(filaDeLineaConEmpresa());

describe('R23 — las TRES envolturas son UNA definicion', () => {
  const AMBITOS: readonly SupplierScope[] = [
    { companyId: EMPRESA },
    { companyId: OTRA_EMPRESA },
    // Un valor raro tambien: la definicion no valida ni transforma, filtra. Si una envoltura
    // empezara a normalizar y otra no, divergirian justo aqui.
    { companyId: '  ' },
  ];

  for (const scope of AMBITOS) {
    it(`para ${JSON.stringify(scope)} las tres devuelven exactamente el mismo objeto`, () => {
      const deProveedor = supplierCompanyScope(scope);
      const deLinea = catalogLineCompanyScope(scope);
      const columnas = companyScopeColumns(scope);

      expect(deProveedor).toStrictEqual(deLinea);
      expect(deProveedor).toStrictEqual(columnas);
      // Y es la condicion de verdad: solo la empresa, ni una clave mas, con el valor tal cual.
      expect(deProveedor).toStrictEqual({ companyId: scope.companyId });
      expect(Object.keys(columnas)).toEqual(['companyId']);
    });
  }

  it('las envolturas no devuelven el propio `scope` (no se puede mutar el ambito del caso de uso a traves de ellas)', () => {
    const scope: SupplierScope = { companyId: EMPRESA };
    expect(supplierCompanyScope(scope)).not.toBe(scope);
    expect(catalogLineCompanyScope(scope)).not.toBe(scope);
    expect(companyScopeColumns(scope)).not.toBe(scope);
  });

  it('en el codigo, las tres envolturas delegan en la MISMA funcion privada', () => {
    const codigo = codigoDe(
      'lib',
      'modules',
      'proveedores',
      'adapters',
      'driven',
      'persistence',
      'company-scope.ts',
    );
    expect(codigo.match(/return companyScope\(scope\);/g)).toHaveLength(3);
    expect(codigo.match(/\bscope\.companyId\b/g)).toHaveLength(1);
    expect(codigo).not.toMatch(/export\s+function\s+companyScope\b/);
  });
});

describe('R31 — ninguna salida publica lleva la empresa', () => {
  it('el adaptador: `toSupplierView` no copia `companyId` aunque la fila de Prisma lo traiga', () => {
    const vista = toSupplierView(filaDeProveedorConEmpresa());
    expect(vista).not.toHaveProperty('companyId');
    expect(exponeEmpresa(vista)).toBe(false);
    // Control: la vista SI trae los datos de la fila; si fuera vacia, «no expone» seria vacuo.
    expect(vista.id).toBe(PROVEEDOR);
  });

  it('el adaptador: `toCatalogLineView` tampoco la copia', () => {
    const vista = toCatalogLineView(filaDeLineaConEmpresa());
    expect(vista).not.toHaveProperty('companyId');
    expect(exponeEmpresa(vista)).toBe(false);
    expect(vista.cost).toBe('12.5000');
  });

  it('los dos `select` del adaptador no piden la columna de empresa', () => {
    // Es la OTRA mitad, y la que de verdad cierra el paso: los dos mapeadores construyen campo
    // a campo, pero solo pueden copiar lo que el `select` haya traido. Los casos de uso, en
    // cambio, devuelven la vista del puerto TAL CUAL -no re-mapean-, asi que la frontera de la
    // salida vive aqui, en el adaptador, y no en el dominio.
    const proveedor = codigoDe(
      'lib',
      'modules',
      'proveedores',
      'adapters',
      'driven',
      'persistence',
      'supplier-prisma.ts',
    );
    const linea = codigoDe(
      'lib',
      'modules',
      'proveedores',
      'adapters',
      'driven',
      'persistence',
      'supplier-catalog-line-prisma.ts',
    );

    for (const [nombre, codigo, constante] of [
      ['supplier-prisma.ts', proveedor, 'const SUPPLIER_SELECT = {'],
      ['supplier-catalog-line-prisma.ts', linea, 'const CATALOG_LINE_SELECT = {'],
    ] as const) {
      const desde = codigo.indexOf(constante);
      expect(desde, `${nombre} no declara ${constante}`).toBeGreaterThan(-1);
      const hasta = codigo.indexOf('}', desde);
      expect(codigo.slice(desde, hasta), `${nombre}: el select pide la empresa`).not.toMatch(
        /companyId/,
      );
    }
  });

  it('la ficha y los dos listados no la llevan: lo que el adaptador entrega ya viene sin ella', async () => {
    const suppliers = {
      findAliveById: vi.fn(async () => vistaDeProveedor()),
      listAlive: vi.fn(async () => ({
        items: [vistaDeProveedor()],
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      })),
    } as unknown as SupplierRepository;

    const catalog = {
      listBySupplierAlive: vi.fn(async () => ({
        items: [vistaDeLinea()],
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      })),
    } as unknown as SupplierCatalogRepository;

    const log = { ignoredFields: vi.fn() };

    const images: CatalogImageUrl = { publicUrl: vi.fn((path: string) => `https://cdn.test/${path}`) };

    const ficha = await createGetSupplier({ suppliers })(PROVEEDOR, ACTOR);
    const lista = await createListSuppliers({ suppliers, log })({ page: 1 }, ACTOR);
    const catalogo = await createListCatalogLines({ catalog, log, images })(
      PROVEEDOR,
      { page: 1 },
      ACTOR,
    );

    // Controles: las salidas SON las de la fila.
    expect(ficha.id).toBe(PROVEEDOR);
    expect(lista.items.map((item) => item.id)).toEqual([PROVEEDOR]);
    expect(catalogo.items.map((item) => item.id)).toEqual([LINEA]);

    for (const [nombre, salida] of [
      ['ficha', ficha],
      ['listado de proveedores', lista],
      ['listado del catalogo', catalogo],
    ] as const) {
      expect(exponeEmpresa(salida), `${nombre} expone la empresa`).toBe(false);
    }
  });

  it('los TIPOS de salida no la declaran: SupplierView, CatalogLineView y los estados de las dos Server Actions', () => {
    // La mitad estatica: lo que no esta en el tipo no se puede devolver por accidente con un
    // literal nuevo, y un campo nuevo en el tipo aparece aqui antes que en el navegador.
    for (const vista of ['supplier-view.ts', 'catalog-line-view.ts']) {
      expect(codigoDe('lib', 'modules', 'proveedores', 'domain', vista)).not.toMatch(
        /companyId|company_id/,
      );
    }

    const ESTADOS: Record<string, readonly string[]> = {
      'supplier-actions.ts': [
        'CreateSupplierFormState',
        'SupplierMutationFormState',
        'SupplierQueryResult',
        'SupplierListResult',
      ],
      'supplier-catalog-actions.ts': [
        'CreateCatalogLineFormState',
        'CatalogLineMutationFormState',
        'CatalogLineListResult',
      ],
    };

    for (const [archivo, tipos] of Object.entries(ESTADOS)) {
      const actions = codigoDe('lib', 'modules', 'proveedores', 'adapters', 'driving', archivo);
      for (const tipo of tipos) {
        const desde = actions.indexOf(`export type ${tipo}`);
        expect(desde, `falta el tipo ${tipo} en ${archivo}`).toBeGreaterThan(-1);
        const declaracion = actions.slice(desde, actions.indexOf(';', desde));
        expect(declaracion, `${tipo} declara la empresa`).not.toMatch(/companyId|company_id/);
      }

      // En las actions, la empresa aparece SOLO donde se construye el actor. Ningun `return` de
      // una action la menciona.
      const inicioActor = actions.indexOf('async function currentActor(');
      expect(inicioActor, `${archivo} no declara currentActor`).toBeGreaterThan(-1);
      const finActor = actions.indexOf('\n}', inicioActor);
      const fuera = actions.slice(0, inicioActor) + actions.slice(finActor);
      expect(fuera, `${archivo}: la empresa aparece fuera de currentActor`).not.toMatch(/companyId/);
    }
  });
});
