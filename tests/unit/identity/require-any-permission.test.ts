// QC-94 T2 — `assertAnyPermission` y `requireAnyPermission`: «basta UNO de estos codigos» (R1, R2,
// R3). Hermano de `require-permission.test.ts`, que NO se toca: aquel sigue afirmando lo mismo que
// afirmaba, y su verde es la prueba de que la extraccion de `holdsPermission` no cambio nada.
//
// Se prueban tres cosas por separado:
//   1. que falla CERRADO -actor ausente, sin conjunto, conjunto vacio, conjunto que no es lista y
//      permiso ajeno- y que el error lo pone quien llama (`onDenied` manda);
//   2. que la pertenencia es EXACTA: sin normalizacion de caja ni de espacios y sin coincidencia
//      parcial -ni un prefijo, ni un codigo que lo contiene, ni la implicacion entre acciones-;
//   3. que basta CUALQUIERA de los dos codigos, sin exigir los dos.
//
// Y una cuarta que no es un caso de test sino de compilacion: la TUPLA VACIA no compila. Va con
// `@ts-expect-error`, que se pone rojo tanto si la llamada compila (el error esperado no aparece)
// como si el codigo deja de existir.
//
// Cubre R1, R2, R3.

import { describe, expect, it, vi } from 'vitest';

import { requireAnyPermission } from '@/lib/modules/identity';
import {
  assertAnyPermission,
  type PermissionBearer,
} from '@/lib/modules/identity/domain/require-permission';
import { UnauthorizedError } from '@/lib/modules/identity/domain/errors';

import type { PermissionCode } from '@/lib/modules/identity/domain/permissions';

/** Clase propia: si `assertAnyPermission` lanzara algo generico en vez de invocar `onDenied`,
 *  esto lo detecta —no basta con un `toThrow()` a secas—. */
class ErrorDePrueba extends Error {}

/** Los dos codigos alternativos de la consulta de roles (QC-94 decision cerrada 2). */
const CUALQUIERA: readonly [PermissionCode, ...PermissionCode[]] = [
  'usuarios.consultar',
  'usuarios.modificar',
];

type Portador = Parameters<typeof assertAnyPermission>[0];

/** Actores que NO deben pasar el corte de «consultar O modificar». */
const RECHAZADOS: readonly (readonly [string, Portador])[] = [
  ['sin actor (null)', null],
  ['sin actor (undefined)', undefined],
  ['sin conjunto de permisos', {} as unknown as PermissionBearer],
  ['permisos nulos', { permissions: null } as unknown as PermissionBearer],
  [
    'permisos que no son un array',
    { permissions: 'usuarios.consultar' } as unknown as PermissionBearer,
  ],
  ['conjunto vacio', { permissions: [] }],
  ['un permiso ajeno', { permissions: ['inventario.consultar'] }],
  ['R2: solo el prefijo del codigo', { permissions: ['usuarios.'] }],
  ['R2: solo el modulo', { permissions: ['usuarios'] }],
  ['R2: un codigo que EMPIEZA por uno de los dos', { permissions: ['usuarios.consultarlo'] }],
  ['R2: el codigo con otra caja', { permissions: ['USUARIOS.CONSULTAR'] }],
  ['R2: el codigo con otra caja (modificar)', { permissions: ['Usuarios.Modificar'] }],
  ['R2: el codigo con espacios alrededor', { permissions: [' usuarios.consultar '] }],
  ['R2: un codigo que lo CONTIENE', { permissions: ['super.usuarios.modificar.todo'] }],
];

/** Actores que SI deben pasar el corte: basta UNO de los dos (R3). */
const ACEPTADOS: readonly (readonly [string, PermissionBearer])[] = [
  ['R3: solo `usuarios.consultar`', { permissions: ['usuarios.consultar'] }],
  ['R3: solo `usuarios.modificar`', { permissions: ['usuarios.modificar'] }],
  ['los dos a la vez', { permissions: ['usuarios.consultar', 'usuarios.modificar'] }],
  [
    'uno de los dos entre permisos ajenos',
    { permissions: ['inventario.consultar', 'usuarios.modificar', 'pedidos.consultar'] },
  ],
];

describe('QC-94 — assertAnyPermission falla cerrado (R2)', () => {
  for (const [quien, actor] of RECHAZADOS) {
    it(`${quien}: lanza EXACTAMENTE el error que devuelve onDenied`, () => {
      const esperado = new ErrorDePrueba('denegado');
      const fabrica = vi.fn(() => esperado);

      expect(() => assertAnyPermission(actor, CUALQUIERA, fabrica)).toThrow(esperado);
      expect(fabrica).toHaveBeenCalledTimes(1);
    });
  }
});

describe('QC-94 — assertAnyPermission concede con UNO de los dos (R1, R3)', () => {
  for (const [quien, actor] of ACEPTADOS) {
    it(`${quien}: no lanza y no pide el error`, () => {
      const fabrica = vi.fn(() => new ErrorDePrueba('denegado'));

      expect(() => assertAnyPermission(actor, CUALQUIERA, fabrica)).not.toThrow();
      expect(fabrica).not.toHaveBeenCalled();
    });
  }

  it('no exige los DOS: con uno solo basta, y el otro codigo no se consulta para nada mas', () => {
    const soloConsultar: PermissionBearer = { permissions: ['usuarios.consultar'] };
    const soloModificar: PermissionBearer = { permissions: ['usuarios.modificar'] };

    expect(() =>
      assertAnyPermission(soloConsultar, CUALQUIERA, () => new ErrorDePrueba('x')),
    ).not.toThrow();
    expect(() =>
      assertAnyPermission(soloModificar, CUALQUIERA, () => new ErrorDePrueba('x')),
    ).not.toThrow();
  });

  it('un solo codigo en la tupla se comporta como `assertPermission`', () => {
    const unico: readonly [PermissionCode] = ['usuarios.consultar'];

    expect(() =>
      assertAnyPermission({ permissions: ['usuarios.consultar'] }, unico, () => new ErrorDePrueba('x')),
    ).not.toThrow();
    expect(() =>
      assertAnyPermission({ permissions: ['usuarios.modificar'] }, unico, () => new ErrorDePrueba('x')),
    ).toThrow(ErrorDePrueba);
  });
});

describe('QC-94 — requireAnyPermission pone el UnauthorizedError del modulo (R2, R3)', () => {
  for (const [quien, actor] of RECHAZADOS) {
    it(`${quien}: lanza UnauthorizedError`, () => {
      expect(() =>
        requireAnyPermission(actor as Parameters<typeof requireAnyPermission>[0], CUALQUIERA),
      ).toThrow(UnauthorizedError);
    });
  }

  it('con uno de los dos codigos no lanza', () => {
    const actor = { id: 'u1', companyId: 'c1', permissions: ['usuarios.modificar'] };

    expect(() => requireAnyPermission(actor, CUALQUIERA)).not.toThrow();
  });
});

describe('QC-94 — la tupla VACIA no compila (T2)', () => {
  it('`assertAnyPermission(actor, [])` es un error de tipos, no un caso en tiempo de ejecucion', () => {
    const actor: PermissionBearer = { permissions: ['usuarios.consultar'] };

    expect(() => {
      // @ts-expect-error la lista de codigos es una tupla NO VACIA: `[]` no satisface
      // `readonly [PermissionCode, ...PermissionCode[]]`. Si algun dia compilara, este test se
      // pone rojo — que es exactamente lo que se quiere.
      assertAnyPermission(actor, [], () => new ErrorDePrueba('x'));
    }).toThrow(ErrorDePrueba);
  });
});
