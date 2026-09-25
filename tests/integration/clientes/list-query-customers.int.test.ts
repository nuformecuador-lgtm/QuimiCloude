/**
 * T14 — el listado de CLIENTES con el contrato generico, contra Postgres REAL.
 *
 * POR QUE ESTE ARCHIVO EXISTE Y NO BASTA UN UNITARIO: un doble del puerto puede afirmar que la
 * consulta saneada llego al repositorio, pero no que el motor filtro y ordeno el CONJUNTO
 * COMPLETO antes de paginar, ni que la busqueda y el filtro de ciudad de verdad ignoran acentos
 * y mayusculas via las columnas `*_normalized` (R41, R47, `design.md > 17.3`). Solo Postgres
 * puede demostrarlo.
 *
 * AISLAMIENTO: `listAliveCustomers` llama al cliente Prisma GLOBAL, asi que una transaccion de
 * test con ROLLBACK no lo envolveria. Cada caso siembra sus filas con un marcador irrepetible y
 * las borra por id exacto; las empresas efimeras se limpian en `afterAll` con el mismo conteo de
 * defensa que `customer-repository.int.test.ts`.
 *
 * NINGUNA AFIRMACION GLOBAL sobre el catalogo de clientes: todo caso acota por la BUSQUEDA con un
 * marcador unico sembrado en nombres/apellidos/ciudad.
 *
 * Requisitos cubiertos: R26, R29, R30, R31, R11 (con busqueda), R41, R47.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createCustomer, listAliveCustomers } from '@/lib/modules/clientes/adapters/driven/persistence/customer-prisma';
import { normalizeCustomerText } from '@/lib/modules/clientes/domain/customer-text';
import { normalizeCompanyName } from '@/lib/modules/identity';
import { prisma } from '@/lib/shared/db/prisma';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';

import type { CustomerScope } from '@/lib/modules/clientes/domain/customer-scope';
import type { ListFilterValue, ListQuery } from '@/lib/modules/clientes/domain/list-query';
import type { NewCustomer } from '@/lib/modules/clientes/domain/customer-view';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

/** Marca comun de TODAS las filas de este archivo: basta para acotar cada consulta. */
const MARCA = `zqc154${token().slice(0, 12)}`;

type CustomerOverrides = Partial<{
  firstNames: string;
  lastNames: string;
  city: string;
  createdAt: Date;
  deletedAt: Date | null;
}>;

function customerInput(overrides: CustomerOverrides = {}): NewCustomer {
  const firstNames = overrides.firstNames ?? `Nombre ${MARCA}`;
  const lastNames = overrides.lastNames ?? `Apellido ${MARCA}`;
  const city = overrides.city ?? `Ciudad ${MARCA}`;
  return {
    firstNames,
    firstNamesNormalized: normalizeCustomerText(firstNames),
    lastNames,
    lastNamesNormalized: normalizeCustomerText(lastNames),
    city,
    cityNormalized: normalizeCustomerText(city),
    phone: null,
    email: null,
    address: null,
  };
}

function consulta(partial: Partial<ListQuery> = {}): ListQuery {
  return { page: 1, sort: null, filters: {}, search: MARCA, ...partial };
}

function soloLasMias(extra: Record<string, ListFilterValue> = {}): Record<string, ListFilterValue> {
  return { ...extra };
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
const creados: string[] = [];

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
  const companyName = `Empresa list-query-clientes ${marker}`;
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

async function sembrar(
  actorId: string,
  scope: CustomerScope,
  semillas: readonly CustomerOverrides[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const semilla of semillas) {
    const created = await createCustomer(
      customerInput(semilla),
      actorId,
      semilla.createdAt ?? new Date('2026-01-01T00:00:00Z'),
      scope,
    );
    if (semilla.deletedAt !== undefined && semilla.deletedAt !== null) {
      await prisma.customer.update({
        where: { id: created.id },
        data: { deletedAt: semilla.deletedAt },
      });
    }
    ids.push(created.id);
    creados.push(created.id);
  }
  return ids;
}

/** Empresa unica del archivo para los casos que no comparan empresas entre si. */
let empresaA: Empresa;
/** Segunda empresa, solo para el caso de R11 con busqueda. */
let empresaB: Empresa;

beforeAll(async () => {
  empresaA = await crearEmpresaConActor();
  empresaB = await crearEmpresaConActor();
});

afterAll(async () => {
  if (creados.length > 0) {
    await prisma.customer.deleteMany({ where: { id: { in: creados } } });
  }
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

describe('R26: pagina por defecto y tope de 25', () => {
  it('R26 — usa 10 por defecto y devuelve 25 como maximo cuando se piden 100, con el total', async () => {
    const marca = `r26${token().slice(0, 8)}`;
    const nombres = Array.from({ length: 26 }, (_, i) => `Cliente ${MARCA} ${marca} ${String(i).padStart(2, '0')}`);
    await sembrar(
      empresaA.actorId,
      empresaA.scope,
      nombres.map((firstNames) => ({ firstNames })),
    );

    const porDefecto = await listAliveCustomers(consulta({ search: marca }), empresaA.scope);
    expect(porDefecto.pageSize).toBe(10);
    expect(porDefecto.items).toHaveLength(10);
    expect(porDefecto.total).toBe(26);

    const pidiendoCien = await listAliveCustomers(consulta({ search: marca, pageSize: 100 }), empresaA.scope);
    expect(pidiendoCien.pageSize).toBe(MAX_PAGE_SIZE);
    expect(pidiendoCien.items.length).toBeLessThanOrEqual(MAX_PAGE_SIZE);
    expect(pidiendoCien.total).toBe(26);
  });
});

describe('R29: sin orden pedido ordena por apellidos y nombres, y el recorrido de paginas no repite ni omite, con empates', () => {
  it('R29 — sin orden pedido ordena por apellidos y nombres y recorre las paginas sin repetir ni omitir', async () => {
    const marca = `r29${token().slice(0, 8)}`;
    const ids = await sembrar(
      empresaA.actorId,
      empresaA.scope,
      Array.from({ length: 12 }, (_, i) => ({
        firstNames: `Nombre ${MARCA} ${marca}`,
        lastNames: `Apellido ${MARCA} ${marca} ${String(i).padStart(2, '0')}`,
      })),
    );
    const sembrados = new Set(ids);

    const vistos: string[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const pagina = await listAliveCustomers(consulta({ search: marca, page, pageSize: 5 }), empresaA.scope);
      vistos.push(...pagina.items.map((c) => c.id));
      totalPages = pagina.totalPages;
      page += 1;
    } while (page <= totalPages);

    const mios = vistos.filter((id) => sembrados.has(id));
    expect(mios).toHaveLength(ids.length);
    expect(new Set(mios).size).toBe(ids.length);

    const esperado = await prisma.customer.findMany({
      where: { id: { in: ids } },
      select: { id: true },
      orderBy: [{ lastNames: 'asc' }, { firstNames: 'asc' }, { id: 'asc' }],
    });
    expect(mios).toEqual(esperado.map((c) => c.id));
  });

  it('cuatro filas empatadas en apellidos y nombres no se repiten ni se pierden entre paginas (desempate por id)', async () => {
    const marca = `r29empate${token().slice(0, 8)}`;
    const ids = await sembrar(
      empresaA.actorId,
      empresaA.scope,
      [1, 2, 3, 4].map(() => ({
        firstNames: `Nombre ${MARCA} ${marca}`,
        lastNames: `Apellido ${MARCA} ${marca}`,
      })),
    );

    const vistos: string[] = [];
    for (const page of [1, 2]) {
      const pagina = await listAliveCustomers(consulta({ search: marca, page, pageSize: 2 }), empresaA.scope);
      vistos.push(...pagina.items.map((c) => c.id));
    }

    expect(vistos).toHaveLength(4);
    expect(new Set(vistos).size).toBe(4);
    // Todas empatan en apellidos y nombres: solo el desempate por id define el orden.
    expect([...vistos].sort()).toEqual(vistos);
    expect(vistos.sort()).toEqual([...ids].sort());
  });
});

describe('R30: cada palabra debe aparecer en nombres, apellidos o ciudad', () => {
  it('R30 — cada palabra debe aparecer en nombres, apellidos o ciudad', async () => {
    const marca = `r30${token().slice(0, 8)}`;
    const [id] = await sembrar(empresaA.actorId, empresaA.scope, [
      { firstNames: `Carlos ${MARCA} ${marca}`, lastNames: `Perez ${MARCA} ${marca}` },
    ]);

    const pagina = await listAliveCustomers(
      consulta({ search: `${marca} perez carlos`, pageSize: 25 }),
      empresaA.scope,
    );
    expect(pagina.items.map((c) => c.id)).toEqual([id]);
  });

  it('un termino en blanco equivale a no buscar (sigue devolviendo la fila)', async () => {
    const marca = `r30blank${token().slice(0, 8)}`;
    const [id] = await sembrar(empresaA.actorId, empresaA.scope, [
      { firstNames: `Nombre ${MARCA} ${marca}`, city: `Ciudad ${MARCA} ${marca}` },
    ]);
    const filtroDeCiudad = soloLasMias({
      city: { kind: 'text', value: normalizeCustomerText(`Ciudad ${MARCA} ${marca}`) },
    });

    const conBlanco = await listAliveCustomers(
      { page: 1, sort: null, filters: filtroDeCiudad, search: '   ', pageSize: 25 },
      empresaA.scope,
    );
    const sinBusqueda = await listAliveCustomers(
      { page: 1, sort: null, filters: filtroDeCiudad, search: '', pageSize: 25 },
      empresaA.scope,
    );
    expect(conBlanco.items.map((c) => c.id)).toEqual(sinBusqueda.items.map((c) => c.id));
    expect(conBlanco.items.map((c) => c.id)).toEqual([id]);
  });
});

describe('R41: la busqueda ignora acentos y mayusculas, y un termino solo de simbolos equivale a no buscar', () => {
  it('R41 — la busqueda ignora acentos y mayusculas y un termino solo de simbolos equivale a no buscar', async () => {
    const marca = `r41${token().slice(0, 8)}`;
    const [id] = await sembrar(empresaA.actorId, empresaA.scope, [
      { firstNames: `María José ${MARCA} ${marca}`, lastNames: `Pérez Muñoz ${MARCA} ${marca}` },
    ]);

    const conMinusculasSinAcentos = await listAliveCustomers(
      consulta({ search: `maria ${marca}`, pageSize: 25 }),
      empresaA.scope,
    );
    expect(conMinusculasSinAcentos.items.map((c) => c.id)).toEqual([id]);

    const conMayusculas = await listAliveCustomers(
      consulta({ search: `PEREZ ${marca}`, pageSize: 25 }),
      empresaA.scope,
    );
    expect(conMayusculas.items.map((c) => c.id)).toEqual([id]);

    const filtroDeCiudad = soloLasMias({
      city: { kind: 'text', value: normalizeCustomerText(`Ciudad ${MARCA} ${marca}`) },
    });
    const conSimbolos = await listAliveCustomers(
      { page: 1, sort: null, filters: filtroDeCiudad, search: '%_---%', pageSize: 25 },
      empresaA.scope,
    );
    const sinBusqueda = await listAliveCustomers(
      { page: 1, sort: null, filters: filtroDeCiudad, search: '', pageSize: 25 },
      empresaA.scope,
    );
    expect(conSimbolos.items.map((c) => c.id)).toEqual(sinBusqueda.items.map((c) => c.id));
    expect(conSimbolos.total).toBe(sinBusqueda.total);
  });
});

describe('R47: filtrar por bogota devuelve Bogota con tilde', () => {
  it('R47 — filtrar por bogota devuelve Bogota con tilde', async () => {
    const marca = `r47${token().slice(0, 8)}`;
    const [enBogota, enMedellin] = await sembrar(empresaA.actorId, empresaA.scope, [
      { firstNames: `Nombre ${MARCA} ${marca} uno`, city: `Bogotá ${MARCA} ${marca}` },
      { firstNames: `Nombre ${MARCA} ${marca} dos`, city: `Medellín ${MARCA} ${marca}` },
    ]);

    const pagina = await listAliveCustomers(
      consulta({
        search: `${marca}`,
        pageSize: 25,
        filters: soloLasMias({ city: { kind: 'text', value: 'bogota' } }),
      }),
      empresaA.scope,
    );
    expect(pagina.items.map((c) => c.id)).toEqual([enBogota]);
    expect(pagina.items.map((c) => c.id)).not.toContain(enMedellin);
  });
});

describe('R31: el total describe el conjunto filtrado, y el filtro se aplica antes de paginar', () => {
  it('R31 — el total describe el conjunto filtrado y el filtro se aplica antes de paginar', async () => {
    const marca = `r31${token().slice(0, 8)}`;
    const ids = await sembrar(
      empresaA.actorId,
      empresaA.scope,
      Array.from({ length: 7 }, (_, i) => ({ firstNames: `Nombre ${MARCA} ${marca} ${String(i)}` })),
    );

    const pagina = await listAliveCustomers(consulta({ search: marca, pageSize: 3 }), empresaA.scope);
    expect(pagina.items).toHaveLength(3);
    expect(pagina.total).toBe(ids.length);
    expect(pagina.totalPages).toBe(Math.ceil(ids.length / 3));
  });
});

describe('R11: el listado y su total solo cuentan la empresa del actor, aun cuando la busqueda case con otra', () => {
  it('R11 — una busqueda que casa con clientes de otra empresa no los devuelve', async () => {
    const marca = `r11busqueda${token().slice(0, 8)}`;
    const idsA = await sembrar(empresaA.actorId, empresaA.scope, [
      { firstNames: `Nombre ${MARCA} ${marca} A` },
    ]);
    const idsB = await sembrar(empresaB.actorId, empresaB.scope, [
      { firstNames: `Nombre ${MARCA} ${marca} B1` },
      { firstNames: `Nombre ${MARCA} ${marca} B2` },
    ]);

    const pagina = await listAliveCustomers(consulta({ search: marca, pageSize: 25 }), empresaA.scope);
    expect(pagina.total).toBe(idsA.length);
    expect(pagina.items.map((c) => c.id)).toEqual(idsA);
    expect(pagina.items.map((c) => c.id)).not.toEqual(expect.arrayContaining(idsB));
  });
});
