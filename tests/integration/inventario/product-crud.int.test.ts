/**
 * Tests de integracion de QC-20 (crud-de-productos) contra una base Postgres REAL.
 *
 * ACTUALIZADO EL 2026-09-09: la autoria (`createdBy`/`updatedBy`) y la presentacion se mudaron
 * de `products` a `product_batches`, asi que los describes de auditoria (R7, R6, R8/D20) se
 * fueron de este archivo -ya no hay columnas de autor ni presentacion en `products` que
 * ejercitar-. Quedan los casos que prueban el ADAPTADOR real (`product-prisma.ts`):
 * `createProduct`, `findAliveProductById`, `updateAliveProduct`, `softDeleteAliveProduct`,
 * `listAliveProducts` con el contrato generico de consulta.
 *
 * AISLAMIENTO: estas funciones llaman al cliente Prisma GLOBAL (`@/lib/shared/db/prisma`), no
 * a un `tx` inyectado, asi que no participan de una transaccion que se deshaga. Por eso estos
 * casos crean sus propios datos con `prisma` real y los borran ellos mismos en un bloque
 * `finally`, por su `id` exacto. Ninguna afirmacion global ("hay N productos"): cada caso
 * filtra por los ids que el mismo sembro.
 *
 * SQLSTATE, nunca el texto del mensaje.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createProduct,
  findAliveProductById,
  listAliveProducts,
  softDeleteAliveProduct,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';
import type { ListQuery } from '@/lib/modules/inventario/domain/list-query';
import type { NewProduct } from '@/lib/modules/inventario/domain/product-view';

// ---------------------------------------------------------------------------
// Datos de apoyo
// ---------------------------------------------------------------------------

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

/* QC-80 (R7, R21) se llevo de aqui el helper `createTestUnit` y su normalizacion: existian
 * solo para rellenar `products.unit_id`, columna que la migracion de esta ficha elimino. El
 * producto ya no declara unidad -la declara la presentacion (R1)-, asi que el alta de un
 * producto no necesita ninguna unidad de apoyo. */

/**
 * Empresa propia del archivo y AMBITO de todas sus llamadas al adaptador (QC-49 R1, R13).
 *
 * `products.company_id` es NOT NULL desde `<ts>_inventory_company_scope`, y las siete funciones
 * de `product-prisma.ts` exigen el ambito en su firma: sin el no compilan (R13). La empresa es
 * EFIMERA y propia del archivo, asi que `collectAllPages` -que recorre el listado con
 * `search: ''`- ve EXACTAMENTE lo que este archivo sembro y nada mas, que es mas acotado que lo
 * que veia antes.
 *
 * ESTE ARCHIVO NO PRUEBA EL AISLAMIENTO: sigue probando borrado logico, exclusion de borrados,
 * paginacion estable y orden. El aislamiento es `company-scope-queries.int.test.ts`.
 */
let empresaDelArchivo: string;

function ambito(): InventoryScope {
  return { companyId: empresaDelArchivo };
}

beforeAll(async () => {
  const nombre = `Empresa crud productos ${token()}`;
  const { id } = await prisma.company.create({
    data: { name: nombre, nameNormalized: nombre.toLowerCase().replace(/[^a-z0-9]/gu, '') },
    select: { id: true },
  });
  empresaDelArchivo = id;
});

function baseProductInput(overrides: Partial<NewProduct> = {}): NewProduct {
  return {
    name: `Producto ${token()}`,
    ...overrides,
  };
}

/** Recorre TODAS las paginas de `listAliveProducts` con un `pageSize` dado y devuelve la
 * union de sus items, en el orden en que se recorrieron. */
async function collectAllPages(
  pageSize: number,
): Promise<{ id: string; name: string }[]> {
  const listQuery = (page: number): ListQuery => ({
    page,
    pageSize,
    sort: null,
    filters: {},
    search: '',
  });
  const first = await listAliveProducts(listQuery(1), ambito());
  const items = [...first.items];
  for (let page = 2; page <= first.totalPages; page += 1) {
    const next = await listAliveProducts(listQuery(page), ambito());
    items.push(...next.items);
  }
  return items.map((item) => ({ id: item.id, name: item.name }));
}

afterAll(async () => {
  // La empresa del archivo, cuando ya no queda ningun producto que la referencie:
  // `products_company_id_fkey` es ON DELETE RESTRICT.
  await prisma.company.deleteMany({ where: { id: empresaDelArchivo } });
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------

describe('R15: el borrado logico conserva la fila', () => {
  it('al borrar conserva la fila y marca deleted_at', async () => {
    let productId: string | null = null;

    try {
      const input: NewProduct = { ...baseProductInput() };
      const created = await createProduct(input, new Date(), ambito());
      productId = created.id;

      const before = await prisma.product.findUniqueOrThrow({ where: { id: created.id } });
      expect(before.deletedAt).toBeNull();

      const ok = await softDeleteAliveProduct(created.id, new Date(), ambito());
      expect(ok).toBe(true);

      // Se relee con Prisma DIRECTO (sin el filtro de "vivo") para comprobar que la fila
      // sigue existiendo ENTERA: R15 prohibe el borrado fisico.
      const after = await prisma.product.findUniqueOrThrow({ where: { id: created.id } });
      expect(after.id).toBe(created.id);
      expect(after.name).toBe(before.name);
      expect(after.deletedAt).not.toBeNull();
      expect(after.deletedAt).toBeInstanceOf(Date);
      // ACTUALIZADO EL 2026-09-11 POR QC-80 (R7, R21). ANTES, las dos lineas que faltan aqui
      // comprobaban que `unit_id` sobrevivia al borrado logico: era LA columna con la que este
      // caso demostraba que «no se pierde ningun dato». La columna ya no existe, asi que la
      // afirmacion no se borra sino que se REFUERZA a la fila ENTERA: todo salvo `deleted_at` y
      // la marca de modificacion tiene que ser identico. Una columna futura queda cubierta sola.
      expect({ ...after, deletedAt: null, updatedAt: before.updatedAt }).toEqual(before);
    } finally {
      if (productId !== null) {
        await prisma.product.deleteMany({ where: { id: productId } });
      }
    }
  });
});

describe('R16: los productos borrados no aparecen en ninguna consulta', () => {
  it('la lista paginada y la ficha excluyen los productos borrados', async () => {
    let productId: string | null = null;

    try {
      const input: NewProduct = { ...baseProductInput() };
      const created = await createProduct(input, new Date(), ambito());
      productId = created.id;

      // Vivo: aparece en la ficha y en el listado.
      expect(await findAliveProductById(created.id, ambito())).not.toBeNull();
      const aliveList = await collectAllPages(25);
      expect(aliveList.some((item) => item.id === created.id)).toBe(true);

      const ok = await softDeleteAliveProduct(created.id, new Date(), ambito());
      expect(ok).toBe(true);

      // Borrado: desaparece de las DOS consultas, aunque la fila siga existiendo.
      expect(await findAliveProductById(created.id, ambito())).toBeNull();
      const deletedList = await collectAllPages(25);
      expect(deletedList.some((item) => item.id === created.id)).toBe(false);

      const stillThere = await prisma.product.findUnique({ where: { id: created.id } });
      expect(stillThere).not.toBeNull();
    } finally {
      if (productId !== null) {
        await prisma.product.deleteMany({ where: { id: productId } });
      }
    }
  });
});

describe('R26: la paginacion es estable con homonimos', () => {
  it('recorre las paginas sin repetir ni omitir productos homonimos', async () => {
    const homonymName = `Homonimo ${token()}`;
    const createdIds: string[] = [];

    try {
      // Cinco productos con el MISMO nombre (D14/R12 lo permite explicitamente): sin el
      // desempate por id, dos de ellos podrian intercambiarse entre paginas.
      for (let i = 0; i < 5; i += 1) {
        const input: NewProduct = { ...baseProductInput({ name: homonymName }) };
        const created = await createProduct(input, new Date(), ambito());
        createdIds.push(created.id);
      }

      // `pageSize` pequeno a proposito, para forzar varias paginas.
      const seen = await collectAllPages(2);
      const seenIds = seen.map((item) => item.id);

      const ownSeen = seenIds.filter((id) => createdIds.includes(id));
      // Cada uno de los cinco aparece EXACTAMENTE una vez en toda la recorrida.
      expect(ownSeen.sort()).toEqual([...createdIds].sort());
      expect(new Set(ownSeen).size).toBe(createdIds.length);

      // Y el recorrido completo tampoco repite NINGUN id (no solo los propios): la prueba
      // de que el orden es estable es que la union entera es sin duplicados.
      expect(new Set(seenIds).size).toBe(seenIds.length);
    } finally {
      await prisma.product.deleteMany({ where: { id: { in: createdIds } } });
    }
  });
});

describe('R35: orden name ASC, id ASC', () => {
  it('ordena por nombre ascendente y desempata por identificador ascendente', async () => {
    const homonymName = `Zzz-Orden ${token()}`;
    const createdIds: string[] = [];

    try {
      for (let i = 0; i < 4; i += 1) {
        const input: NewProduct = { ...baseProductInput({ name: homonymName }) };
        const created = await createProduct(input, new Date(), ambito());
        createdIds.push(created.id);
      }

      const all = await collectAllPages(25);
      const own = all.filter((item) => item.name === homonymName);

      expect(own).toHaveLength(createdIds.length);
      // Mismo nombre para todos: lo unico que puede ordenarlos es el desempate por id.
      const orderedIds = own.map((item) => item.id);
      const expectedOrder = [...orderedIds].sort();
      expect(orderedIds).toEqual(expectedOrder);
    } finally {
      await prisma.product.deleteMany({ where: { id: { in: createdIds } } });
    }
  });
});
