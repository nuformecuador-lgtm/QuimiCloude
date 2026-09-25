/**
 * T13 — tests de integracion del CRUD y del aislamiento por empresa de CLIENTES (QC-154)
 * contra una base Postgres REAL, con la migracion `20260924190000_customers_search_normalized`
 * aplicada encima de `20260924120000_customers` (QC-153).
 *
 * AISLAMIENTO: los cinco metodos de `customer-prisma.ts` llaman al cliente Prisma GLOBAL, no a
 * un `tx` inyectado, asi que envolver la corrida en una transaccion del test con `ROLLBACK`
 * seria aislamiento de mentira (mismo motivo que `proveedores/supplier-crud.int.test.ts`). Cada
 * caso crea sus filas con `prisma` real y las borra el mismo; cada empresa efimera de este
 * archivo (empresa, rol, tipo de documento, usuario) se limpia en `afterAll`, en el orden que
 * exigen las FK, y se afirma CONTANDO que no quedo ninguna fila de `customers` de esa empresa.
 *
 * NINGUNA AFIRMACION GLOBAL sobre el catalogo de clientes: cada caso mira solo las filas que el
 * mismo sembro, localizadas por su id o por un marcador irrepetible.
 *
 * Requisitos cubiertos: R9, R10, R11, R13, R15, R19, R21, R22, R23, R24, R25, R47.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createCustomer,
  findAliveCustomerById,
  listAliveCustomers,
  softDeleteAliveCustomer,
  updateAliveCustomer,
} from '@/lib/modules/clientes/adapters/driven/persistence/customer-prisma';
import { normalizeCustomerText } from '@/lib/modules/clientes/domain/customer-text';
import { normalizeCompanyName } from '@/lib/modules/identity';
import { prisma } from '@/lib/shared/db/prisma';

import type { CustomerScope } from '@/lib/modules/clientes/domain/customer-scope';
import type { ListQuery } from '@/lib/modules/clientes/domain/list-query';
import type { NewCustomer } from '@/lib/modules/clientes/domain/customer-view';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

type CustomerOverrides = Partial<{
  firstNames: string;
  lastNames: string;
  city: string;
  phone: string | null;
  email: string | null;
  address: string | null;
}>;

/** Entrada del puerto, con las tres formas normalizadas calculadas con la funcion REAL. */
function customerInput(overrides: CustomerOverrides = {}): NewCustomer {
  const firstNames = overrides.firstNames ?? `Nombre ${token()}`;
  const lastNames = overrides.lastNames ?? `Apellido ${token()}`;
  const city = overrides.city ?? `Ciudad ${token()}`;
  return {
    firstNames,
    firstNamesNormalized: normalizeCustomerText(firstNames),
    lastNames,
    lastNamesNormalized: normalizeCustomerText(lastNames),
    city,
    cityNormalized: normalizeCustomerText(city),
    phone: 'phone' in overrides ? overrides.phone ?? null : null,
    email: 'email' in overrides ? overrides.email ?? null : null,
    address: 'address' in overrides ? overrides.address ?? null : null,
  };
}

function consulta(partial: Partial<ListQuery> = {}): ListQuery {
  return { page: 1, sort: null, filters: {}, search: '', ...partial };
}

type EmpresaEfimera = {
  readonly companyId: string;
  readonly userId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
};

type Empresa = {
  readonly companyId: string;
  readonly actorId: string;
  readonly scope: CustomerScope;
};

const empresasEfimeras: EmpresaEfimera[] = [];

/**
 * Usuario REAL completo (tipo de documento + rol + usuario) en una empresa efimera propia:
 * `customers.created_by`/`updated_by` son FK reales hacia `users` (QC-153), asi que un uuid
 * inventado se rechazaria con `23503`.
 */
async function crearEmpresaConActor(): Promise<Empresa> {
  const marker = token();
  const documentType = await prisma.documentType.create({
    data: { code: `DOC${marker.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const role = await prisma.role.create({
    data: { name: `rol-${marker}`, description: 'Rol de prueba' },
    select: { id: true },
  });
  const companyName = `Empresa clientes ${marker}`;
  const company = await prisma.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
    select: { id: true },
  });
  const user = await prisma.user.create({
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
      companyId: company.id,
    },
    select: { id: true },
  });
  empresasEfimeras.push({
    companyId: company.id,
    userId: user.id,
    roleId: role.id,
    documentTypeCode: documentType.code,
  });
  return { companyId: company.id, actorId: user.id, scope: { companyId: company.id } };
}

/** Actores compartidos por los casos a los que no les importa QUIEN o de que empresa es. */
let empresaA: Empresa;
let empresaB: Empresa;

beforeAll(async () => {
  empresaA = await crearEmpresaConActor();
  empresaB = await crearEmpresaConActor();
});

afterAll(async () => {
  // Cada caso borra sus propios clientes en su `finally`; esto es la comprobacion de que
  // ninguno se olvido: si quedara alguno, el conteo lo delata antes de borrar el resto.
  for (const empresa of empresasEfimeras) {
    const restantes = await prisma.customer.count({ where: { companyId: empresa.companyId } });
    expect(restantes).toBe(0);
  }
  for (const empresa of empresasEfimeras) {
    await prisma.user.delete({ where: { id: empresa.userId } });
    await prisma.role.delete({ where: { id: empresa.roleId } });
    await prisma.documentType.delete({ where: { code: empresa.documentTypeCode } });
    await prisma.company.delete({ where: { id: empresa.companyId } });
  }
  await prisma.$disconnect();
});

describe('R9: el alta usa la empresa del actor', () => {
  it('R9 — el cliente creado queda en la empresa del actor', async () => {
    let customerId: string | null = null;
    try {
      const created = await createCustomer(
        customerInput(),
        empresaA.actorId,
        new Date('2026-01-01T00:00:00Z'),
        empresaA.scope,
      );
      customerId = created.id;

      const fila = await prisma.customer.findUniqueOrThrow({
        where: { id: created.id },
        select: { companyId: true },
      });
      expect(fila.companyId).toBe(empresaA.companyId);
    } finally {
      if (customerId !== null) await prisma.customer.delete({ where: { id: customerId } });
    }
  });
});

describe('R13: crea el cliente con datos validos y devuelve su identificador', () => {
  it('R13 — crea el cliente con datos validos y devuelve su identificador', async () => {
    let customerId: string | null = null;
    try {
      const input = customerInput({
        phone: '+57 300 123 4567',
        email: 'compras@cliente.test',
        address: 'Calle 1 # 2-3',
      });
      const created = await createCustomer(
        input,
        empresaA.actorId,
        new Date('2026-01-01T00:00:00Z'),
        empresaA.scope,
      );
      customerId = created.id;
      expect(created.id).toMatch(/^[0-9a-f-]{36}$/u);

      const ficha = await findAliveCustomerById(created.id, empresaA.scope);
      expect(ficha).not.toBeNull();
      expect(ficha?.firstNames).toBe(input.firstNames);
      expect(ficha?.lastNames).toBe(input.lastNames);
      expect(ficha?.city).toBe(input.city);
      expect(ficha?.phone).toBe('+57 300 123 4567');
      expect(ficha?.email).toBe('compras@cliente.test');
      expect(ficha?.address).toBe('Calle 1 # 2-3');
      expect(ficha?.createdBy).toBe(empresaA.actorId);
      expect(ficha?.updatedBy).toBe(empresaA.actorId);
    } finally {
      if (customerId !== null) await prisma.customer.delete({ where: { id: customerId } });
    }
  });
});

describe('R15: el opcional en blanco se guarda como NULL', () => {
  it('R15 — el opcional en blanco se guarda como NULL', async () => {
    let customerId: string | null = null;
    try {
      const created = await createCustomer(
        customerInput({ phone: null, email: null, address: null }),
        empresaA.actorId,
        new Date('2026-01-01T00:00:00Z'),
        empresaA.scope,
      );
      customerId = created.id;

      const fila = await prisma.customer.findUniqueOrThrow({
        where: { id: created.id },
        select: { phone: true, email: true, address: true },
      });
      expect(fila).toEqual({ phone: null, email: null, address: null });
    } finally {
      if (customerId !== null) await prisma.customer.delete({ where: { id: customerId } });
    }
  });
});

describe('R19: dos clientes vivos con los mismos seis datos se crean los dos', () => {
  it('R19 — dos clientes vivos con los mismos seis datos se crean los dos', async () => {
    let ids: string[] = [];
    try {
      const input = customerInput({ phone: '+57 300 000 0000' });
      const primero = await createCustomer(
        input,
        empresaA.actorId,
        new Date('2026-01-01T00:00:00Z'),
        empresaA.scope,
      );
      const segundo = await createCustomer(
        input,
        empresaA.actorId,
        new Date('2026-01-01T00:00:00Z'),
        empresaA.scope,
      );
      ids = [primero.id, segundo.id];
      expect(segundo.id).not.toBe(primero.id);

      const vivos = await prisma.customer.count({
        where: {
          firstNames: input.firstNames,
          lastNames: input.lastNames,
          deletedAt: null,
          companyId: empresaA.companyId,
        },
      });
      expect(vivos).toBe(2);
    } finally {
      if (ids.length > 0) await prisma.customer.deleteMany({ where: { id: { in: ids } } });
    }
  });
});

describe('R21: la autoria de creacion y de modificacion', () => {
  it('R21 — editar y dar de baja no pisan created_by ni created_at', async () => {
    const autorCreador = await crearEmpresaConActor();
    const autorEditor = empresaA.actorId;
    const autorQueBaja = empresaB.actorId;
    let customerId: string | null = null;
    try {
      const created = await createCustomer(
        customerInput(),
        autorCreador.actorId,
        new Date('2026-01-01T00:00:00Z'),
        autorCreador.scope,
      );
      customerId = created.id;

      const recienCreado = await prisma.customer.findUniqueOrThrow({
        where: { id: created.id },
        select: { createdBy: true, updatedBy: true, createdAt: true },
      });
      expect(recienCreado.createdBy).toBe(autorCreador.actorId);
      expect(recienCreado.updatedBy).toBe(autorCreador.actorId);

      const editado = await updateAliveCustomer(
        created.id,
        customerInput({ firstNames: `Editado ${token()}` }),
        autorEditor,
        new Date('2026-02-02T00:00:00Z'),
        autorCreador.scope,
      );
      expect(editado).toBe('ok');

      const trasEditar = await prisma.customer.findUniqueOrThrow({
        where: { id: created.id },
        select: { createdBy: true, updatedBy: true, createdAt: true },
      });
      // R21 — editar no pisa `created_by` ni `created_at`.
      expect(trasEditar.createdBy).toBe(autorCreador.actorId);
      expect(trasEditar.createdAt).toEqual(recienCreado.createdAt);
      expect(trasEditar.updatedBy).toBe(autorEditor);

      const dadoDeBaja = await softDeleteAliveCustomer(
        created.id,
        autorQueBaja,
        new Date('2026-03-03T00:00:00Z'),
        autorCreador.scope,
      );
      expect(dadoDeBaja).toBe(true);

      // Ya no sale por el adaptador de lectura viva (R25): se mira la fila directamente.
      const trasBaja = await prisma.customer.findUniqueOrThrow({
        where: { id: created.id },
        select: { createdBy: true, updatedBy: true, createdAt: true, deletedAt: true },
      });
      // R21 — dar de baja tampoco pisa `created_by` ni `created_at`.
      expect(trasBaja.createdBy).toBe(autorCreador.actorId);
      expect(trasBaja.createdAt).toEqual(recienCreado.createdAt);
      expect(trasBaja.updatedBy).toBe(autorQueBaja);
      expect(trasBaja.deletedAt).not.toBeNull();
    } finally {
      if (customerId !== null) await prisma.customer.delete({ where: { id: customerId } });
      await prisma.user.delete({ where: { id: autorCreador.actorId } });
      await prisma.role.delete({
        where: { id: empresasEfimeras.find((e) => e.companyId === autorCreador.companyId)!.roleId },
      });
      await prisma.documentType.delete({
        where: {
          code: empresasEfimeras.find((e) => e.companyId === autorCreador.companyId)!
            .documentTypeCode,
        },
      });
      await prisma.company.delete({ where: { id: autorCreador.companyId } });
      empresasEfimeras.splice(
        empresasEfimeras.findIndex((e) => e.companyId === autorCreador.companyId),
        1,
      );
    }
  });
});

describe('R23: un cliente ya dado de baja no cambia con una segunda operacion', () => {
  it('R23 — editar o dar de baja un cliente ya dado de baja no cambia ninguna fila', async () => {
    let customerId: string | null = null;
    try {
      const created = await createCustomer(
        customerInput(),
        empresaA.actorId,
        new Date('2026-01-01T00:00:00Z'),
        empresaA.scope,
      );
      customerId = created.id;

      const primeraBaja = await softDeleteAliveCustomer(
        created.id,
        empresaA.actorId,
        new Date('2026-02-02T00:00:00Z'),
        empresaA.scope,
      );
      expect(primeraBaja).toBe(true);

      const filaTrasPrimeraBaja = await prisma.customer.findUniqueOrThrow({
        where: { id: created.id },
        select: { deletedAt: true, updatedAt: true, updatedBy: true },
      });

      // Segunda baja: no encuentra fila viva, no cambia nada.
      const segundaBaja = await softDeleteAliveCustomer(
        created.id,
        empresaB.actorId,
        new Date('2026-03-03T00:00:00Z'),
        empresaA.scope,
      );
      expect(segundaBaja).toBe(false);

      // Editar el ya dado de baja: `'not_found'`, tampoco cambia nada.
      const edicion = await updateAliveCustomer(
        created.id,
        customerInput({ firstNames: `No deberia aplicarse ${token()}` }),
        empresaB.actorId,
        new Date('2026-03-03T00:00:00Z'),
        empresaA.scope,
      );
      expect(edicion).toBe('not_found');

      const filaFinal = await prisma.customer.findUniqueOrThrow({
        where: { id: created.id },
        select: { deletedAt: true, updatedAt: true, updatedBy: true, firstNames: true },
      });
      expect(filaFinal.deletedAt).toEqual(filaTrasPrimeraBaja.deletedAt);
      expect(filaFinal.updatedAt).toEqual(filaTrasPrimeraBaja.updatedAt);
      expect(filaFinal.updatedBy).toBe(filaTrasPrimeraBaja.updatedBy);
    } finally {
      if (customerId !== null) await prisma.customer.delete({ where: { id: customerId } });
    }
  });
});

describe('R24: la baja conserva la fila completa y marca deleted_at', () => {
  it('R24 — la baja conserva la fila completa y marca deleted_at', async () => {
    let customerId: string | null = null;
    try {
      const input = customerInput({
        phone: '+57 301 222 3344',
        email: 'contacto@cliente.test',
        address: 'Avenida 5 # 6-7',
      });
      const created = await createCustomer(
        input,
        empresaA.actorId,
        new Date('2026-01-01T00:00:00Z'),
        empresaA.scope,
      );
      customerId = created.id;

      const baja = new Date('2026-02-02T00:00:00Z');
      expect(await softDeleteAliveCustomer(created.id, empresaA.actorId, baja, empresaA.scope)).toBe(
        true,
      );

      const fila = await prisma.customer.findUnique({
        where: { id: created.id },
        select: {
          firstNames: true,
          lastNames: true,
          city: true,
          phone: true,
          email: true,
          address: true,
          createdBy: true,
          deletedAt: true,
        },
      });
      expect(fila).toEqual({
        firstNames: input.firstNames,
        lastNames: input.lastNames,
        city: input.city,
        phone: input.phone,
        email: input.email,
        address: input.address,
        createdBy: empresaA.actorId,
        deletedAt: baja,
      });
    } finally {
      if (customerId !== null) await prisma.customer.delete({ where: { id: customerId } });
    }
  });
});

describe('R25: la ficha y el listado excluyen los dados de baja', () => {
  it('R25 — la ficha y el listado excluyen los dados de baja', async () => {
    let customerId: string | null = null;
    try {
      const marca = `r25${token().slice(0, 10)}`;
      const created = await createCustomer(
        customerInput({ firstNames: `Nombre ${marca}` }),
        empresaA.actorId,
        new Date('2026-01-01T00:00:00Z'),
        empresaA.scope,
      );
      customerId = created.id;

      expect(await findAliveCustomerById(created.id, empresaA.scope)).not.toBeNull();
      const antes = await listAliveCustomers(consulta({ search: marca, pageSize: 25 }), empresaA.scope);
      expect(antes.items.map((c) => c.id)).toContain(created.id);

      await softDeleteAliveCustomer(
        created.id,
        empresaA.actorId,
        new Date('2026-02-02T00:00:00Z'),
        empresaA.scope,
      );

      expect(await findAliveCustomerById(created.id, empresaA.scope)).toBeNull();
      const despues = await listAliveCustomers(
        consulta({ search: marca, pageSize: 25 }),
        empresaA.scope,
      );
      expect(despues.items.map((c) => c.id)).not.toContain(created.id);
    } finally {
      if (customerId !== null) await prisma.customer.delete({ where: { id: customerId } });
    }
  });
});

describe('R10: un cliente de otra empresa responde como no encontrado y su fila queda intacta', () => {
  it('R10 — la ficha, la edicion y la baja de un cliente de otra empresa responden customer_not_found y la fila ajena queda intacta', async () => {
    let customerId: string | null = null;
    try {
      const input = customerInput({ phone: '+57 300 999 8877' });
      const created = await createCustomer(
        input,
        empresaB.actorId,
        new Date('2026-01-01T00:00:00Z'),
        empresaB.scope,
      );
      customerId = created.id;

      // Empresa A intenta leer, editar y dar de baja el cliente de la empresa B.
      expect(await findAliveCustomerById(created.id, empresaA.scope)).toBeNull();
      expect(
        await updateAliveCustomer(
          created.id,
          customerInput({ firstNames: `No deberia aplicarse ${token()}` }),
          empresaA.actorId,
          new Date('2026-02-02T00:00:00Z'),
          empresaA.scope,
        ),
      ).toBe('not_found');
      expect(
        await softDeleteAliveCustomer(
          created.id,
          empresaA.actorId,
          new Date('2026-02-02T00:00:00Z'),
          empresaA.scope,
        ),
      ).toBe(false);

      // R10 — se relee la fila ajena, con SU propia empresa, y sigue intacta.
      const filaAjena = await findAliveCustomerById(created.id, empresaB.scope);
      expect(filaAjena).not.toBeNull();
      expect(filaAjena?.firstNames).toBe(input.firstNames);
      expect(filaAjena?.updatedBy).toBe(empresaB.actorId);

      const filaCrudaAjena = await prisma.customer.findUniqueOrThrow({
        where: { id: created.id },
        select: { updatedAt: true, updatedBy: true, deletedAt: true },
      });
      expect(filaCrudaAjena.updatedBy).toBe(empresaB.actorId);
      expect(filaCrudaAjena.deletedAt).toBeNull();
    } finally {
      if (customerId !== null) await prisma.customer.delete({ where: { id: customerId } });
    }
  });
});

describe('R11: el listado y su total solo cuentan la empresa del actor', () => {
  it('R11 — el listado y su total solo cuentan la empresa del actor', async () => {
    const marca = `r11${token().slice(0, 10)}`;
    let idsA: string[] = [];
    let idsB: string[] = [];
    try {
      idsA = (
        await Promise.all(
          [1, 2].map((n) =>
            createCustomer(
              customerInput({ firstNames: `Nombre ${marca} A${String(n)}` }),
              empresaA.actorId,
              new Date('2026-01-01T00:00:00Z'),
              empresaA.scope,
            ),
          ),
        )
      ).map((c) => c.id);
      idsB = (
        await Promise.all(
          [1, 2, 3].map((n) =>
            createCustomer(
              customerInput({ firstNames: `Nombre ${marca} B${String(n)}` }),
              empresaB.actorId,
              new Date('2026-01-01T00:00:00Z'),
              empresaB.scope,
            ),
          ),
        )
      ).map((c) => c.id);

      const pagina = await listAliveCustomers(consulta({ search: marca, pageSize: 25 }), empresaA.scope);
      expect(pagina.total).toBe(idsA.length);
      expect(pagina.items.map((c) => c.id).sort()).toEqual([...idsA].sort());
      expect(pagina.items.map((c) => c.id)).not.toEqual(
        expect.arrayContaining([...idsB]),
      );
    } finally {
      if (idsA.length > 0) await prisma.customer.deleteMany({ where: { id: { in: idsA } } });
      if (idsB.length > 0) await prisma.customer.deleteMany({ where: { id: { in: idsB } } });
    }
  });
});

/** Las 11 claves reales de `CustomerView`, en el orden que exige `Object.keys(...).sort()`. */
const CUSTOMER_VIEW_KEYS = [
  'address',
  'city',
  'createdAt',
  'createdBy',
  'email',
  'firstNames',
  'id',
  'lastNames',
  'phone',
  'updatedAt',
  'updatedBy',
].sort();

describe('R22 y R47: las claves de la fila real, no las del doble', () => {
  it('R22 — findAliveCustomerById devuelve exactamente las 11 claves, sin companyId ni deletedAt', async () => {
    let customerId: string | null = null;
    try {
      const created = await createCustomer(
        customerInput(),
        empresaA.actorId,
        new Date('2026-01-01T00:00:00Z'),
        empresaA.scope,
      );
      customerId = created.id;

      const ficha = await findAliveCustomerById(created.id, empresaA.scope);
      expect(ficha).not.toBeNull();
      expect(Object.keys(ficha!).sort()).toEqual(CUSTOMER_VIEW_KEYS);
    } finally {
      if (customerId !== null) await prisma.customer.delete({ where: { id: customerId } });
    }
  });

  it('R47 — cada item de listAliveCustomers devuelve exactamente las 11 claves, sin ninguna forma normalizada', async () => {
    const marca = `r47claves${token().slice(0, 8)}`;
    let customerId: string | null = null;
    try {
      const created = await createCustomer(
        customerInput({ firstNames: `Nombre ${marca}` }),
        empresaA.actorId,
        new Date('2026-01-01T00:00:00Z'),
        empresaA.scope,
      );
      customerId = created.id;

      const pagina = await listAliveCustomers(
        consulta({ search: marca, pageSize: 25 }),
        empresaA.scope,
      );
      expect(pagina.items.length).toBeGreaterThan(0);
      for (const item of pagina.items) {
        expect(Object.keys(item).sort()).toEqual(CUSTOMER_VIEW_KEYS);
      }
    } finally {
      if (customerId !== null) await prisma.customer.delete({ where: { id: customerId } });
    }
  });
});
