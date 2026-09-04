/**
 * T17 — tests de integracion del PROVEEDOR (QC-43) contra una base Postgres REAL, con la
 * migracion `20260903200343_supplier_contact_cost_and_line_audit` aplicada encima de la de
 * QC-42.
 *
 * DOS ESTRATEGIAS DE AISLAMIENTO, y es deliberado. Es exactamente el reparto que estableció
 * `tests/integration/inventario/product-crud.int.test.ts` (QC-20) y no se inventa nada
 * nuevo:
 *
 * 1) Los casos que verifican una restriccion de la BASE (R12, R17, y la variante B del
 *    `CHECK` de contacto) usan `prisma.$transaction` interactiva que SIEMPRE termina en
 *    `ROLLBACK` (`RollbackSignal`), con `SAVEPOINT` para la operacion que se espera que
 *    falle, y afirman sobre el SQLSTATE crudo leido de `meta.code`.
 *
 * 2) Los casos que ejercitan el ADAPTADOR real (`supplier-prisma.ts`) NO pueden usar esa
 *    estrategia: esas funciones llaman al cliente Prisma GLOBAL, no a un `tx` inyectado,
 *    asi que una llamada hecha "dentro" del callback de `prisma.$transaction(...)` corre en
 *    OTRA conexion del pool y hace COMMIT de inmediato. Por eso estos casos crean sus datos
 *    con `prisma` real y los borran ellos mismos en un `finally`, por su `id` exacto.
 *
 * SQL CRUDO PARA LO QUE DEBE FALLAR — la API tipada traduce el SQLSTATE a su propio codigo
 * (`P2002`, `P2003`…) y el SQLSTATE se pierde; ademas, escribir `phone = ''` a traves del
 * adaptador es imposible (el `zod` del borde lo convierte en ausencia antes). Justamente
 * por eso R12 EXIGE el camino crudo: lo que se demuestra aqui es que **Postgres** rechaza
 * el contacto en blanco, no que `zod` llego antes. Un test que se quedara verde quitando el
 * `CHECK` no contaria.
 *
 * NINGUNA AFIRMACION GLOBAL — ningun caso afirma "hay N proveedores". Los de paginacion
 * siembran sus propias filas, recorren las paginas y filtran por los ids que ellos mismos
 * escribieron; el `total` se contrasta contra un `count` calculado en el momento, no contra
 * una constante.
 *
 * SIN TESTS DE RLS — un test de RLS escrito con Prisma sale verde pase lo que pase, porque
 * Prisma se conecta como dueno de las tablas (`docs/architecture.md > Acceso a datos y
 * autorizacion`). R6 lo cierra `guard-rls-force`.
 *
 * Requisitos cubiertos: R7, R8 (la mitad que solo ve Postgres), R12, R15, R17, R18, R19,
 * R21, R22, R23.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createSupplier,
  findAliveSupplierById,
  listAliveSuppliers,
  softDeleteAliveSupplier,
  updateAliveSupplier,
} from '@/lib/modules/proveedores/adapters/driven/persistence/supplier-prisma';
import { normalizeSupplierName } from '@/lib/modules/proveedores/domain/supplier-name';
import { prisma } from '@/lib/shared/db/prisma';

import type { NewSupplier, SupplierView } from '@/lib/modules/proveedores/domain/supplier-view';

// ---------------------------------------------------------------------------
// Utilidades de aislamiento (estrategia 1), identicas en forma a las de
// `product-crud.int.test.ts` y `proveedores-constraints.int.test.ts`.
// ---------------------------------------------------------------------------

class RollbackSignal extends Error {
  constructor() {
    super('rollback de aislamiento del test');
    this.name = 'RollbackSignal';
  }
}

async function inRolledBackTransaction(
  body: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await body(tx);
        throw new RollbackSignal();
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error;
  }
}

let savepointSeq = 0;

/** SQLSTATE de Postgres. Son estables y NO dependen del idioma del servidor. */
const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';

function sqlStateOf(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta: unknown = error.meta;
    if (typeof meta === 'object' && meta !== null && 'code' in meta) {
      const code: unknown = (meta as { code: unknown }).code;
      if (typeof code === 'string') return code;
    }
    return error.code;
  }
  return error instanceof Error ? error.message : String(error);
}

async function expectRejectedByDatabase(
  tx: Prisma.TransactionClient,
  run: () => Promise<unknown>,
  what: string,
): Promise<string> {
  savepointSeq += 1;
  const savepoint = `sp_${String(savepointSeq)}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
  try {
    await run();
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    return sqlStateOf(error);
  }
  await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
  throw new Error(`se esperaba que la base rechazara la operacion, pero la acepto: ${what}`);
}

// ---------------------------------------------------------------------------
// Datos de apoyo. `Db` acepta tanto un `tx` como el cliente real: `PrismaClient` satisface
// estructuralmente `Prisma.TransactionClient`.
// ---------------------------------------------------------------------------

type Db = Prisma.TransactionClient;

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

/**
 * Usuario REAL completo (tipo de documento + rol + usuario). `suppliers.created_by` y
 * `updated_by` son FK reales hacia `users` (QC-42), asi que un uuid inventado se rechazaria
 * con `23503`: el actor de estos tests existe de verdad.
 */
async function createTestUser(db: Db): Promise<string> {
  const marker = token();
  const documentType = await db.documentType.create({
    data: { code: `DOC${marker.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const role = await db.role.create({
    data: { name: `rol-${marker}`, description: 'Rol de prueba' },
    select: { id: true },
  });
  const user = await db.user.create({
    data: {
      firstNames: 'Ana Maria',
      lastNames: 'Perez Gomez',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `ana.${marker}@quimicloude.test`,
      phone: '+57 300 111 2233',
      documentTypeCode: documentType.code,
      documentNumber: marker.slice(0, 12),
      username: `ana.${marker}`,
      passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
      roleId: role.id,
    },
    select: { id: true },
  });
  return user.id;
}

async function deleteTestUser(db: Db, userId: string): Promise<void> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { roleId: true, documentTypeCode: true },
  });
  await db.user.delete({ where: { id: userId } });
  await db.role.delete({ where: { id: user.roleId } });
  await db.documentType.delete({ where: { code: user.documentTypeCode } });
}

/** Entrada del puerto. El nombre normalizado se calcula con la funcion real del dominio. */
function supplierInput(name: string, overrides: Partial<NewSupplier> = {}): NewSupplier {
  return {
    name,
    nameNormalized: normalizeSupplierName(name),
    phone: '+57 300 000 0000',
    email: null,
    ...overrides,
  };
}

/** `INSERT INTO suppliers` crudo: el unico camino que propaga el SQLSTATE de verdad. */
function rawInsertSupplier(
  tx: Prisma.TransactionClient,
  name: string,
  phone: string | null,
  email: string | null,
): Promise<number> {
  return tx.$executeRaw`
    INSERT INTO "suppliers" ("name", "name_normalized", "phone", "email", "updated_at")
    VALUES (${name}, ${normalizeSupplierName(name)}, ${phone}, ${email}, CURRENT_TIMESTAMP)`;
}

/**
 * Siembra `cantidad` proveedores VIVOS con nombres ordenables (`... 00`, `... 01`, …) y
 * devuelve sus ids. Se usa en los casos de paginacion, que necesitan mas de 25 filas para
 * que el tope de `MAX_PAGE_SIZE` sea observable.
 */
async function seedSuppliers(cantidad: number, actorId: string): Promise<string[]> {
  const marker = token();
  const ids: string[] = [];
  for (let i = 0; i < cantidad; i += 1) {
    const name = `Proveedor ${marker} ${String(i).padStart(2, '0')}`;
    const created = await prisma.supplier.create({
      data: {
        name,
        nameNormalized: normalizeSupplierName(name),
        phone: '+57 300 000 0000',
        createdBy: actorId,
        updatedBy: actorId,
      },
      select: { id: true },
    });
    ids.push(created.id);
  }
  return ids;
}

/** Recorre TODAS las paginas de `listAliveSuppliers` y devuelve la union de sus items. */
async function collectAllPages(pageSize: number): Promise<SupplierView[]> {
  const first = await listAliveSuppliers({ page: 1, pageSize });
  const items = [...first.items];
  for (let page = 2; page <= first.totalPages; page += 1) {
    const next = await listAliveSuppliers({ page, pageSize });
    items.push(...next.items);
  }
  return items;
}

// ---------------------------------------------------------------------------

/** Actor compartido por los casos a los que no les importa QUIEN es el autor. */
let sharedActorId: string;

beforeAll(async () => {
  // Falla claro si la migracion de esta ficha no esta aplicada: sin ella, media docena de
  // casos fallarian con un error de columna inexistente que no dice nada.
  const [contactCheck] = await prisma.$queryRaw<{ definition: string }[]>`
    SELECT pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'suppliers' AND c.conname = 'suppliers_contact_required'`;
  if (contactCheck === undefined || !contactCheck.definition.includes('btrim')) {
    throw new Error(
      'la base de pruebas no tiene aplicada la migracion de QC-43 ' +
        '(supplier_contact_cost_and_line_audit): `suppliers_contact_required` sigue siendo la de ' +
        'QC-42. Corre `pnpm run db:migrate` antes de estos tests.',
    );
  }

  sharedActorId = await createTestUser(prisma);
});

afterAll(async () => {
  await deleteTestUser(prisma, sharedActorId);
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Restricciones de la BASE (estrategia 1)
// ---------------------------------------------------------------------------

describe('R12: el contacto en blanco lo rechaza la base, no solo `zod`', () => {
  it('el CHECK rechaza con SQLSTATE 23514 el proveedor vivo sin contacto util, al insertar y al modificar', async () => {
    await inRolledBackTransaction(async (tx) => {
      // (1) INSERT con los dos AUSENTES: esto ya lo rechazaba QC-42.
      const sinNinguno = await expectRejectedByDatabase(
        tx,
        () => rawInsertSupplier(tx, `Sin contacto ${token()}`, null, null),
        'alta de proveedor sin telefono ni correo',
      );
      expect(sinNinguno).toBe(CHECK_VIOLATION);

      // (2) INSERT con los dos EN BLANCO: esto es lo NUEVO de esta ficha. Con la
      // restriccion de QC-42 (`phone IS NOT NULL OR email IS NOT NULL`) esta fila
      // pasaba, porque `''` no es NULL.
      const nombreEnBlanco = `Contacto en blanco ${token()}`;
      const enBlanco = await expectRejectedByDatabase(
        tx,
        () => rawInsertSupplier(tx, nombreEnBlanco, '   ', ''),
        'alta de proveedor con telefono y correo en blanco',
      );
      expect(enBlanco).toBe(CHECK_VIOLATION);

      // «No crear ninguna fila»: se busca lo que ese intento habria escrito.
      const supervivientes = await tx.supplier.findMany({
        where: { name: nombreEnBlanco },
        select: { id: true },
      });
      expect(supervivientes).toEqual([]);

      // (3) UPDATE: la restriccion tambien vigila el camino de la modificacion. Se parte
      // de un proveedor valido y se le vacia el contacto.
      const nombreValido = `Proveedor valido ${token()}`;
      await rawInsertSupplier(tx, nombreValido, '+57 300 111 2233', null);
      const vivo = await tx.supplier.findFirstOrThrow({
        where: { name: nombreValido },
        select: { id: true, phone: true },
      });
      expect(vivo.phone).toBe('+57 300 111 2233');

      const alModificar = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`UPDATE "suppliers" SET "phone" = '  ', "email" = NULL WHERE "id" = CAST(${vivo.id} AS uuid)`,
        'vaciar el contacto de un proveedor vivo',
      );
      expect(alModificar).toBe(CHECK_VIOLATION);

      // El rechazo no dejo la fila a medias.
      const intacto = await tx.supplier.findUniqueOrThrow({
        where: { id: vivo.id },
        select: { phone: true, email: true },
      });
      expect(intacto).toEqual({ phone: '+57 300 111 2233', email: null });
    });
  });

  it('un proveedor dado de baja si puede quedarse sin telefono ni correo (P2, variante B)', async () => {
    await inRolledBackTransaction(async (tx) => {
      // La consecuencia BUSCADA de escribir el CHECK solo para las filas vivas: una
      // solicitud de borrado de datos personales se puede atender sin eliminar la fila
      // ni romper nada que la referencie. Con la restriccion evaluada sobre TODA fila
      // -variante A- este UPDATE seria un 23514.
      const nombre = `Proveedor de baja ${token()}`;
      await rawInsertSupplier(tx, nombre, '+57 300 555 4433', 'ventas@proveedor.test');
      const supplier = await tx.supplier.findFirstOrThrow({
        where: { name: nombre },
        select: { id: true },
      });

      await tx.$executeRaw`
        UPDATE "suppliers"
        SET "deleted_at" = CURRENT_TIMESTAMP, "phone" = NULL, "email" = NULL
        WHERE "id" = CAST(${supplier.id} AS uuid)`;

      const despues = await tx.supplier.findUniqueOrThrow({
        where: { id: supplier.id },
        select: { phone: true, email: true, deletedAt: true },
      });
      expect(despues.phone).toBeNull();
      expect(despues.email).toBeNull();
      expect(despues.deletedAt).not.toBeNull();
    });
  });
});

describe('R17: la unicidad del nombre la garantiza el indice, no un SELECT previo', () => {
  it('el indice unico parcial rechaza con SQLSTATE 23505 el segundo proveedor vivo con el mismo nombre normalizado', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token();
      await rawInsertSupplier(tx, `Quimicos ${marker}`, '+57 300 111 2233', null);

      // Mismo nombre NORMALIZADO, escrito distinto: acentos, mayusculas y puntuacion no
      // hacen distinto a un proveedor.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () => rawInsertSupplier(tx, `  QUÍMICOS, ${marker}!  `, '+57 300 999 8877', null),
        'alta de un segundo proveedor vivo con el mismo nombre normalizado',
      );
      expect(sqlState).toBe(UNIQUE_VIOLATION);

      const vivos = await tx.supplier.findMany({
        where: { nameNormalized: normalizeSupplierName(`Quimicos ${marker}`), deletedAt: null },
        select: { id: true },
      });
      expect(vivos).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// El ADAPTADOR real contra Postgres (estrategia 2)
// ---------------------------------------------------------------------------

describe('R7: alta del proveedor', () => {
  it('crea el proveedor con sus datos validos y devuelve su identificador', async () => {
    let supplierId: string | null = null;
    try {
      const input = supplierInput(`Proveedor feliz ${token()}`, {
        phone: '+57 300 123 4567',
        email: 'ventas@proveedor.test',
      });
      const created = await createSupplier(input, sharedActorId, new Date('2026-01-01T00:00:00Z'));
      expect(created).not.toBe('duplicate');
      if (created === 'duplicate') return;
      supplierId = created.id;
      expect(created.id).toMatch(/^[0-9a-f-]{36}$/u);

      const guardado = await findAliveSupplierById(created.id);
      expect(guardado).not.toBeNull();
      expect(guardado?.name).toBe(input.name);
      expect(guardado?.nameNormalized).toBe(input.nameNormalized);
      expect(guardado?.phone).toBe('+57 300 123 4567');
      expect(guardado?.email).toBe('ventas@proveedor.test');
      expect(guardado?.createdBy).toBe(sharedActorId);
      expect(guardado?.updatedBy).toBe(sharedActorId);
    } finally {
      if (supplierId !== null) await prisma.supplier.delete({ where: { id: supplierId } });
    }
  });
});

describe('R8: el autor de la creacion no se pisa', () => {
  it('la edicion y la baja no pisan created_by y sellan updated_by con el actor', async () => {
    // Esta es la mitad de R8 que NINGUN doble puede morder: que el `updateMany` del
    // adaptador no escriba `created_by` solo lo puede decir Postgres.
    const autorA = await createTestUser(prisma);
    const autorB = await createTestUser(prisma);
    let supplierId: string | null = null;

    try {
      const input = supplierInput(`Proveedor auditado ${token()}`);
      const created = await createSupplier(input, autorA, new Date('2026-01-01T00:00:00Z'));
      if (created === 'duplicate') throw new Error('el alta de apoyo no deberia duplicar');
      supplierId = created.id;

      const recienCreado = await findAliveSupplierById(created.id);
      expect(recienCreado?.createdBy).toBe(autorA);
      expect(recienCreado?.updatedBy).toBe(autorA);

      const editado = await updateAliveSupplier(
        created.id,
        supplierInput(`Proveedor auditado y editado ${token()}`, { email: 'nuevo@proveedor.test' }),
        autorB,
        new Date('2026-02-02T00:00:00Z'),
      );
      expect(editado).toBe('ok');

      const trasEditar = await findAliveSupplierById(created.id);
      expect(trasEditar?.createdBy).toBe(autorA);
      expect(trasEditar?.updatedBy).toBe(autorB);

      const dadoDeBaja = await softDeleteAliveSupplier(
        created.id,
        autorB,
        new Date('2026-03-03T00:00:00Z'),
      );
      expect(dadoDeBaja).toBe(true);

      // Ya no sale por el adaptador (R22), asi que se mira la fila directamente.
      const fila = await prisma.supplier.findUniqueOrThrow({
        where: { id: created.id },
        select: { createdBy: true, updatedBy: true },
      });
      expect(fila.createdBy).toBe(autorA);
      expect(fila.updatedBy).toBe(autorB);
    } finally {
      if (supplierId !== null) await prisma.supplier.delete({ where: { id: supplierId } });
      await deleteTestUser(prisma, autorB);
      await deleteTestUser(prisma, autorA);
    }
  });
});

describe('R15: el nombre solo es unico entre los vivos', () => {
  it('el nombre de un proveedor dado de baja queda libre para otro proveedor', async () => {
    const nombre = `Proveedor reciclado ${token()}`;
    const ids: string[] = [];
    try {
      const primero = await createSupplier(
        supplierInput(nombre),
        sharedActorId,
        new Date('2026-01-01T00:00:00Z'),
      );
      if (primero === 'duplicate') throw new Error('el alta de apoyo no deberia duplicar');
      ids.push(primero.id);

      // Mientras el primero siga VIVO, el segundo se rechaza.
      const chocando = await createSupplier(
        supplierInput(nombre.toUpperCase()),
        sharedActorId,
        new Date('2026-01-01T00:00:00Z'),
      );
      expect(chocando).toBe('duplicate');

      await softDeleteAliveSupplier(primero.id, sharedActorId, new Date('2026-02-02T00:00:00Z'));

      // Dado de baja el primero, el nombre queda libre: el indice unico es PARCIAL.
      const segundo = await createSupplier(
        supplierInput(nombre),
        sharedActorId,
        new Date('2026-03-03T00:00:00Z'),
      );
      expect(segundo).not.toBe('duplicate');
      if (segundo === 'duplicate') return;
      ids.push(segundo.id);
      expect(segundo.id).not.toBe(primero.id);

      // Y no hay recuperacion: la fila dada de baja sigue ahi, con su nombre intacto.
      const viejo = await prisma.supplier.findUniqueOrThrow({
        where: { id: primero.id },
        select: { name: true, deletedAt: true },
      });
      expect(viejo.name).toBe(nombre);
      expect(viejo.deletedAt).not.toBeNull();
    } finally {
      if (ids.length > 0) await prisma.supplier.deleteMany({ where: { id: { in: ids } } });
    }
  });
});

describe('R22, R23: la baja es logica y saca al proveedor de toda consulta', () => {
  it('la lista y la ficha excluyen los proveedores dados de baja', async () => {
    let supplierId: string | null = null;
    try {
      const created = await createSupplier(
        supplierInput(`Proveedor que se va ${token()}`),
        sharedActorId,
        new Date('2026-01-01T00:00:00Z'),
      );
      if (created === 'duplicate') throw new Error('el alta de apoyo no deberia duplicar');
      supplierId = created.id;

      // Vivo: sale por la ficha y aparece en alguna pagina del listado.
      expect(await findAliveSupplierById(created.id)).not.toBeNull();
      const antes = await collectAllPages(25);
      expect(antes.map((s) => s.id)).toContain(created.id);

      await softDeleteAliveSupplier(created.id, sharedActorId, new Date('2026-02-02T00:00:00Z'));

      // Dado de baja: ni ficha, ni listado, ni edicion, ni segunda baja.
      expect(await findAliveSupplierById(created.id)).toBeNull();
      const despues = await collectAllPages(25);
      expect(despues.map((s) => s.id)).not.toContain(created.id);
      expect(
        await updateAliveSupplier(
          created.id,
          supplierInput(`Otro nombre ${token()}`),
          sharedActorId,
          new Date('2026-03-03T00:00:00Z'),
        ),
      ).toBe('not_found');
      expect(
        await softDeleteAliveSupplier(created.id, sharedActorId, new Date('2026-03-03T00:00:00Z')),
      ).toBe(false);
    } finally {
      if (supplierId !== null) await prisma.supplier.delete({ where: { id: supplierId } });
    }
  });

  it('al dar de baja conserva la fila completa y marca deleted_at', async () => {
    let supplierId: string | null = null;
    try {
      const input = supplierInput(`Proveedor conservado ${token()}`, {
        phone: '+57 301 222 3344',
        email: 'contacto@proveedor.test',
      });
      const created = await createSupplier(input, sharedActorId, new Date('2026-01-01T00:00:00Z'));
      if (created === 'duplicate') throw new Error('el alta de apoyo no deberia duplicar');
      supplierId = created.id;

      const baja = new Date('2026-02-02T00:00:00Z');
      expect(await softDeleteAliveSupplier(created.id, sharedActorId, baja)).toBe(true);

      // La fila NO se elimina fisicamente: sigue entera, con todos sus campos de negocio.
      const fila = await prisma.supplier.findUnique({
        where: { id: created.id },
        select: {
          name: true,
          nameNormalized: true,
          phone: true,
          email: true,
          createdBy: true,
          deletedAt: true,
        },
      });
      expect(fila).toEqual({
        name: input.name,
        nameNormalized: input.nameNormalized,
        phone: input.phone,
        email: input.email,
        createdBy: sharedActorId,
        deletedAt: baja,
      });
    } finally {
      if (supplierId !== null) await prisma.supplier.delete({ where: { id: supplierId } });
    }
  });
});

describe('R18, R19, R21: el listado paginado contra la base', () => {
  it('devuelve como maximo el tamano de pagina pedido y el total de proveedores', async () => {
    let ids: string[] = [];
    try {
      ids = await seedSuppliers(12, sharedActorId);

      const page = await listAliveSuppliers({ page: 1, pageSize: 7 });
      expect(page.items).toHaveLength(7);
      expect(page.pageSize).toBe(7);

      // El `total` es el de los proveedores que cumplen la consulta -los vivos-, no el de
      // la pagina. Se contrasta con un `count` calculado ahora, nunca con una constante.
      const vivos = await prisma.supplier.count({ where: { deletedAt: null } });
      expect(page.total).toBe(vivos);
      expect(page.totalPages).toBe(Math.ceil(vivos / 7));
    } finally {
      if (ids.length > 0) await prisma.supplier.deleteMany({ where: { id: { in: ids } } });
    }
  });

  it('usa 10 por defecto y devuelve 25 como maximo cuando se piden 100', async () => {
    let ids: string[] = [];
    try {
      // Hacen falta mas de 25 filas vivas para que el tope sea OBSERVABLE: con 25 o menos,
      // una consulta sin limite superior devolveria lo mismo y el test no mordera nada.
      ids = await seedSuppliers(26, sharedActorId);
      expect(await prisma.supplier.count({ where: { deletedAt: null } })).toBeGreaterThan(25);

      const porDefecto = await listAliveSuppliers({ page: 1 });
      expect(porDefecto.pageSize).toBe(10);
      expect(porDefecto.items).toHaveLength(10);

      const pidiendoCien = await listAliveSuppliers({ page: 1, pageSize: 100 });
      expect(pidiendoCien.pageSize).toBe(25);
      expect(pidiendoCien.items).toHaveLength(25);
    } finally {
      if (ids.length > 0) await prisma.supplier.deleteMany({ where: { id: { in: ids } } });
    }
  });

  it('ordena por nombre ascendente y recorre las paginas sin repetir ni omitir ningun proveedor', async () => {
    let ids: string[] = [];
    try {
      ids = await seedSuppliers(26, sharedActorId);
      const sembrados = new Set(ids);

      const todos = await collectAllPages(5);
      const mios = todos.filter((s) => sembrados.has(s.id));

      // Ninguno omitido, ninguno repetido: 26 sembrados, 26 vistos, todos distintos.
      expect(mios).toHaveLength(ids.length);
      expect(new Set(mios.map((s) => s.id)).size).toBe(ids.length);

      // Y el recorrido de paginas sale ordenado por nombre ascendente. Se compara contra
      // la ordenacion de Postgres -un `ORDER BY name`- y no contra la de JavaScript, que
      // usa otro criterio de intercalacion.
      const esperado = await prisma.supplier.findMany({
        where: { id: { in: ids } },
        select: { id: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
      expect(mios.map((s) => s.id)).toEqual(esperado.map((s) => s.id));
    } finally {
      if (ids.length > 0) await prisma.supplier.deleteMany({ where: { id: { in: ids } } });
    }
  });
});
