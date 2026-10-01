// QC-161 T10 — la sesion de quien no tiene empresa (el Maestro) llega a las Server Actions con
// el usuario resuelto y SIN contexto de empresa. Toda operacion con ambito de empresa tiene que
// rechazarla como no autorizada antes de tocar el repositorio (R29).
//
// El usuario de la sesion lleva a proposito TODO el catalogo de permisos: asi lo unico que le
// falta es la empresa, y si alguna action dejara pasar al actor por tener el permiso, este test
// se pone rojo. Las acciones son las de verdad y los casos de uso tambien: el unico doble es la
// composicion, que cablea cada caso de uso real con un repositorio trampa que registra y revienta
// si alguien lo toca. Ningun archivo de produccion cambia para que esto pase: el `currentActor()`
// de cada adaptador ya devuelve `null` sin contexto.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PERMISSIONS } from '@/lib/modules/identity';
import { listUsersAction } from '@/lib/modules/identity/adapters/driving/user-actions';
import { createListUsers } from '@/lib/modules/identity/domain/list-users';
import { listProductsAction } from '@/lib/modules/inventario/adapters/driving/product-actions';
import { createListProducts } from '@/lib/modules/inventario/domain/list-products';
import { listOrdersAction } from '@/lib/modules/pedidos/adapters/driving/order-actions';
import { createListOrders } from '@/lib/modules/pedidos/domain/list-orders';
import { listUnitsAction } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import { createListUnits } from '@/lib/modules/unidades/domain/list-units';

const { getSessionUserMock, getSessionContextMock, readRequestIdHeaderMock, cableado } =
  vi.hoisted(() => ({
    getSessionUserMock: vi.fn(),
    getSessionContextMock: vi.fn(),
    readRequestIdHeaderMock: vi.fn(async () => '7c9e6679-7425-40de-944b-e07fc1f90ae7'),
    // Cada caso de uso real se cablea en `beforeEach`; la composicion doble delega en el.
    cableado: {
      listProducts: null as null | ((input: unknown, actor: unknown) => Promise<unknown>),
      listOrders: null as null | ((input: unknown, actor: unknown) => Promise<unknown>),
      listUnits: null as null | ((input: unknown, actor: unknown) => Promise<unknown>),
      listUsers: null as null | ((actor: unknown, input: unknown) => Promise<unknown>),
    },
  }));

vi.mock('@/lib/composition', () => ({
  observabilidad: { readRequestIdHeader: readRequestIdHeaderMock },
  identity: {
    getSessionUser: getSessionUserMock,
    getSessionContext: getSessionContextMock,
    listUsers: (actor: unknown, input: unknown) => cableado.listUsers?.(actor, input),
  },
  inventario: {
    listProducts: (input: unknown, actor: unknown) => cableado.listProducts?.(input, actor),
  },
  pedidos: {
    listOrders: (input: unknown, actor: unknown) => cableado.listOrders?.(input, actor),
  },
  unidades: {
    listUnits: (input: unknown, actor: unknown) => cableado.listUnits?.(input, actor),
  },
}));

/** Todo el catalogo: el permiso nunca es lo que falta. */
const TODO_EL_CATALOGO = PERMISSIONS.map((permiso) => permiso.code);

const USUARIO_SIN_EMPRESA = {
  id: '3f2b1c9e-0d4a-4c8b-9e77-2a5f6c1d8b40',
  username: 'plataforma.inicial',
  displayName: 'Plataforma Inicial',
  roleName: 'Maestro',
  permissions: TODO_EL_CATALOGO,
};

/**
 * Un puerto trampa: cualquier metodo que se le pida queda anotado y revienta. Asi «no toca el
 * repositorio» se afirma por lo que se registro, y una llamada inesperada no puede pasar en
 * silencio aunque el `catch` de la action la convierta en un estado de error.
 */
function trampa(nombre: string, llamadas: string[]): never {
  return new Proxy(
    {},
    {
      get(_objetivo, propiedad) {
        if (typeof propiedad === 'symbol' || propiedad === 'then') return undefined;
        return () => {
          llamadas.push(`${nombre}.${propiedad}`);
          throw new Error(`${nombre}.${propiedad} no debia invocarse sin empresa`);
        };
      },
    },
  ) as never;
}

const LOG_MUDO = { ignoredFields: () => undefined };

let llamadas: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  llamadas = [];
  getSessionUserMock.mockResolvedValue(USUARIO_SIN_EMPRESA);
  getSessionContextMock.mockResolvedValue(null);

  cableado.listProducts = createListProducts({
    products: trampa('products', llamadas),
    log: LOG_MUDO,
  }) as (input: unknown, actor: unknown) => Promise<unknown>;
  cableado.listOrders = createListOrders({
    orders: trampa('orders', llamadas),
    recipes: trampa('recipes', llamadas),
    presentations: trampa('presentations', llamadas),
    log: LOG_MUDO,
  }) as (input: unknown, actor: unknown) => Promise<unknown>;
  cableado.listUnits = createListUnits({
    units: trampa('units', llamadas),
    log: LOG_MUDO,
  }) as (input: unknown, actor: unknown) => Promise<unknown>;
  cableado.listUsers = createListUsers({
    users: trampa('users', llamadas),
    log: LOG_MUDO,
  }) as (actor: unknown, input: unknown) => Promise<unknown>;
});

const ACCIONES: ReadonlyArray<{ modulo: string; accion: () => Promise<unknown> }> = [
  { modulo: 'inventario', accion: () => listProductsAction({}) },
  { modulo: 'pedidos', accion: () => listOrdersAction({}) },
  { modulo: 'unidades', accion: () => listUnitsAction({}) },
  { modulo: 'identity (usuarios)', accion: () => listUsersAction({}) },
];

describe('una sesion sin empresa no opera nada con ambito de empresa (QC-161)', () => {
  for (const { modulo, accion } of ACCIONES) {
    it(`QC-161 R29: ${modulo} responde no autorizada con todo el catalogo y sin contexto, sin tocar el repositorio`, async () => {
      const resultado = await accion();

      expect(resultado).toMatchObject({ status: 'error', code: 'unauthorized' });
      expect(llamadas).toEqual([]);
      // La sesion se leyo: el rechazo sale de la falta de empresa, no de que no hubiera sesion.
      expect(getSessionUserMock).toHaveBeenCalled();
      expect(getSessionContextMock).toHaveBeenCalled();
    });
  }

  // Simetrico: con el mismo usuario y un contexto de empresa, el caso de uso SI pasa la
  // autorizacion y llega al repositorio. Sin esto, los casos de arriba pasarian tambien con un
  // cableado que rechazara todo por cualquier otro motivo.
  for (const { modulo, accion } of ACCIONES) {
    it(`QC-161 R29: ${modulo} con el mismo usuario y con empresa si llega al repositorio`, async () => {
      getSessionContextMock.mockResolvedValue({
        userId: USUARIO_SIN_EMPRESA.id,
        companyId: '7c1e0f52-8a3d-4b6e-9f21-5d0c4a8e7b13',
        roleName: 'Administrador',
      });

      const resultado = await accion();

      expect(llamadas.length).toBeGreaterThan(0);
      expect(resultado).not.toMatchObject({ code: 'unauthorized' });
    });
  }
});
