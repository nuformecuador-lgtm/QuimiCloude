// QC-87 T6 — Autorizacion POR PERMISO del modulo `asignaciones` (R1, R2, R3, R4).
//
// `docs/architecture.md > Acceso a datos y autorizacion` es explicito: Prisma se conecta como dueno
// de las tablas y no setea `auth.uid()`, asi que las policies de RLS de `order_assignments` **no
// filtran ninguna consulta de esta app**. La frontera real es el caso de uso, y este archivo existe
// para encontrar el agujero de que UNO de los cuatro se la saltara o la pusiera DESPUES de tocar un
// puerto.
//
// **ESTADO DE ESTE ARCHIVO (T6)**: los cuatro casos de uso son T7-T9 y todavia NO existen en disco.
// Lo que aqui se prueba es `requirePermission` DIRECTAMENTE —que es la unica pieza de autorizacion
// que T6 entrega— con la matriz completa del fallo cerrado y para los tres permisos en juego. El
// archivo queda listo para que T7-T9 lo AMPLIEN con los casos de uso reales: por cada uno, los
// mismos cuatro actores denegados y ademas `expect(puerto.metodo).not.toHaveBeenCalled()` sobre
// CADA metodo de CADA doble, que es lo que demuestra «sin leer ni escribir nada» (R2). Esa segunda
// mitad no se puede escribir sin las factorias, y adelantarla seria inventarse su firma.
//
// Cubre R1, R2, R3, R4 (la parte de T6).

import { describe, expect, it } from 'vitest';

import { canModifyAssignments, requirePermission, type Actor } from '@/lib/modules/asignaciones/domain/actor';
import { AsignacionesError, UnauthorizedError } from '@/lib/modules/asignaciones/domain/errors';

import type { PermissionCode } from '@/lib/modules/identity';

const EMPRESA = '33333333-3333-4333-8333-333333333333';
const PERSONA = '11111111-1111-4111-8111-111111111111';

/**
 * Los tres permisos que este modulo exige: `asignaciones.modificar` en las TRES escrituras (R1) y
 * `pedidos.consultar` en la consulta (R3). `asignaciones.consultar` entra en la matriz porque R3
 * prohibe EXPLICITAMENTE que sustituya a ninguno de los otros dos: sigue sin estrenarse (QC-88).
 */
const PERMISO_ESCRITURA: PermissionCode = 'asignaciones.modificar';
const PERMISO_CONSULTA: PermissionCode = 'pedidos.consultar';

/**
 * Los cuatro actores que R2 enumera como denegados, en un solo sitio para que las tres operaciones
 * de escritura se prueben con EXACTAMENTE la misma matriz. El cuarto no es un actor cualquiera sin
 * permisos: trae los OTROS permisos del sistema, que es el caso realista y el unico que distingue
 * «pertenencia exacta» de «tiene algo parecido».
 */
const ACTORES_DENEGADOS: readonly (readonly [string, Actor | null | undefined])[] = [
  ['actor nulo', null],
  ['actor ausente', undefined],
  [
    'sin conjunto de permisos',
    { id: PERSONA, companyId: EMPRESA } as unknown as Actor,
  ],
  ['con el conjunto vacio', { id: PERSONA, companyId: EMPRESA, permissions: [] }],
];

function conPermisos(...permissions: readonly string[]): Actor {
  return { id: PERSONA, companyId: EMPRESA, permissions };
}

describe('QC-87 — autorizacion de `asignaciones`', () => {
  describe('falla cerrado (R2)', () => {
    for (const [nombre, actor] of ACTORES_DENEGADOS) {
      it(`${nombre}: rechaza la escritura con 'unauthorized'`, () => {
        expect(() => requirePermission(actor, PERMISO_ESCRITURA)).toThrow(UnauthorizedError);
        try {
          requirePermission(actor, PERMISO_ESCRITURA);
          expect.unreachable('tenia que haber lanzado');
        } catch (error) {
          expect(error).toBeInstanceOf(AsignacionesError);
          expect((error as UnauthorizedError).code).toBe('unauthorized');
        }
      });

      it(`${nombre}: rechaza tambien la consulta con 'unauthorized'`, () => {
        expect(() => requirePermission(actor, PERMISO_CONSULTA)).toThrow(UnauthorizedError);
      });
    }

    it('un actor con OTROS permisos, pero no el exigido, se rechaza igual', () => {
      const actor = conPermisos('inventario.consultar', 'recetas.modificar', 'usuarios.consultar');
      expect(() => requirePermission(actor, PERMISO_ESCRITURA)).toThrow(UnauthorizedError);
      expect(() => requirePermission(actor, PERMISO_CONSULTA)).toThrow(UnauthorizedError);
    });

    it('el rechazo no revela NADA del recurso: el mensaje es el del catalogo y no lleva ids', () => {
      const error = new UnauthorizedError();
      expect(error.message).not.toContain(PERSONA);
      expect(error.message).not.toContain(EMPRESA);
      // El mismo actor denegado produce el mismo texto exista o no el pedido: esta funcion ni
      // siquiera recibe el pedido, que es la forma fuerte de la propiedad (R2).
      expect(error.code).toBe('unauthorized');
    });
  });

  describe('pertenencia EXACTA, sin implicacion entre permisos (R3)', () => {
    it('`asignaciones.modificar` NO concede `pedidos.consultar`', () => {
      const actor = conPermisos('asignaciones.modificar');
      expect(() => requirePermission(actor, PERMISO_ESCRITURA)).not.toThrow();
      expect(() => requirePermission(actor, PERMISO_CONSULTA)).toThrow(UnauthorizedError);
    });

    it('`pedidos.consultar` NO concede `asignaciones.modificar`', () => {
      const actor = conPermisos('pedidos.consultar');
      expect(() => requirePermission(actor, PERMISO_CONSULTA)).not.toThrow();
      expect(() => requirePermission(actor, PERMISO_ESCRITURA)).toThrow(UnauthorizedError);
    });

    it('`asignaciones.consultar` no sustituye a ninguno de los dos', () => {
      const actor = conPermisos('asignaciones.consultar');
      expect(() => requirePermission(actor, PERMISO_ESCRITURA)).toThrow(UnauthorizedError);
      expect(() => requirePermission(actor, PERMISO_CONSULTA)).toThrow(UnauthorizedError);
    });

    it('no hay normalizacion ni coincidencia parcial', () => {
      for (const parecido of ['asignaciones.modificar ', 'ASIGNACIONES.MODIFICAR', 'asignaciones', 'modificar']) {
        expect(() => requirePermission(conPermisos(parecido), PERMISO_ESCRITURA)).toThrow(UnauthorizedError);
      }
    });
  });

  describe('la forma del actor (R4, R5)', () => {
    it('el actor trae empresa JUNTO con los permisos, no como argumento suelto', () => {
      const actor = conPermisos(PERMISO_ESCRITURA);
      expect(actor.companyId).toBe(EMPRESA);
      // `requirePermission` toma el actor POR PARAMETRO: no hay ninguna via por la que el dominio
      // pueda leer la sesion, una cookie o una cabecera.
      expect(requirePermission.length).toBe(2);
    });

    it('el archivo del dominio no importa `next/*` ni la sesion (R4)', async () => {
      const { readFileSync } = await import('node:fs');
      const { dirname, join } = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
      const fuente = readFileSync(join(raiz, 'lib', 'modules', 'asignaciones', 'domain', 'actor.ts'), 'utf8');
      expect(fuente).not.toMatch(/from\s+'next/);
      expect(fuente).not.toMatch(/\bcookies\s*\(/);
      expect(fuente).not.toMatch(/getSession(User|Context)\s*\(/);
      // Del otro modulo se consume el CONTRATO, nunca una ruta profunda.
      expect(fuente).toContain("from '@/lib/modules/identity'");
      expect(fuente).not.toMatch(/@\/lib\/modules\/identity\//);
    });
  });
});

// ---------------------------------------------------------------------------------------
// QC-102 — `canModifyAssignments`, el PREDICADO que la pantalla pregunta (R28, R29, R50).
//
// Existe para que el codigo `'asignaciones.modificar'` no se escriba fuera del modulo: la pantalla
// necesita el `canWrite` que R28 baja por props y ahora lo obtiene PREGUNTANDO, no escribiendo la
// cadena. Estos casos fijan las dos mitades de su contrato:
//
//   1. que responda SI/NO y NO LANCE nunca —es una pregunta, no una autorizacion—;
//   2. que su criterio sea el MISMO que el de `requirePermission`, letra por letra: pertenencia
//      exacta, sin parecidos, sin comodines y con el mismo fallo cerrado. Los dos comparten
//      `assertPermission` de `identity`, y el ultimo caso lo comprueba EN PAREJA sobre la misma
//      matriz de actores en vez de fiarse de que la implementacion siga delegando.
// ---------------------------------------------------------------------------------------
describe('QC-102 — `canModifyAssignments` (R28, R29, R50)', () => {
  it('verdadero cuando el conjunto trae `asignaciones.modificar`', () => {
    expect(canModifyAssignments(conPermisos(PERMISO_ESCRITURA))).toBe(true);
    // Y tambien acompañado de otros permisos: lo que importa es que ESE este.
    expect(canModifyAssignments(conPermisos('pedidos.consultar', PERMISO_ESCRITURA, 'usuarios.consultar'))).toBe(
      true,
    );
  });

  it('falso cuando NO esta, aunque traiga los otros permisos del sistema (R3)', () => {
    expect(canModifyAssignments(conPermisos('pedidos.consultar', 'usuarios.modificar'))).toBe(false);
    // `asignaciones.consultar` NO concede la escritura: ninguna implicacion entre permisos.
    expect(canModifyAssignments(conPermisos('asignaciones.consultar'))).toBe(false);
  });

  it('falso con un codigo PARECIDO pero distinto: la pertenencia es exacta, no por prefijo (R3)', () => {
    for (const parecido of [
      'asignaciones.modificarr',
      'asignaciones.modifica',
      'asignaciones.modificar.todo',
      'super.asignaciones.modificar',
      'Asignaciones.Modificar',
      'asignaciones.modificar ',
      ' asignaciones.modificar',
    ]) {
      expect(canModifyAssignments(conPermisos(parecido)), `'${parecido}' no deberia conceder`).toBe(false);
    }
  });

  it('falso con un COMODIN: `assertPermission` no los interpreta, y esto lo comprueba (R3)', () => {
    for (const comodin of ['*', '*.*', 'asignaciones.*', 'asignaciones.**', '.*']) {
      // La otra mitad, que es la que lo demuestra: `requirePermission` TAMPOCO los acepta. Si
      // alguien enseñara a una de las dos a expandir comodines, este par dejaria de cuadrar.
      expect(canModifyAssignments(conPermisos(comodin)), `'${comodin}' no deberia conceder`).toBe(false);
      expect(() => requirePermission(conPermisos(comodin), PERMISO_ESCRITURA)).toThrow(UnauthorizedError);
    }
  });

  it('falla cerrado y NO LANZA ante los mismos cuatro actores que R2 deniega', () => {
    for (const [nombre, actor] of ACTORES_DENEGADOS) {
      expect(() => canModifyAssignments(actor), `${nombre}: el predicado no debe lanzar`).not.toThrow();
      expect(canModifyAssignments(actor), nombre).toBe(false);
    }
    // Un conjunto que no es un array tampoco revienta: falla cerrado igual (R14 de QC-74).
    const roto = { id: PERSONA, companyId: EMPRESA, permissions: 'asignaciones.modificar' } as unknown as Actor;
    expect(canModifyAssignments(roto)).toBe(false);
  });

  it('responde EXACTAMENTE lo mismo que `requirePermission` sobre la matriz completa (mismo criterio)', () => {
    const casos: ReadonlyArray<Actor | null | undefined> = [
      ...ACTORES_DENEGADOS.map(([, actor]) => actor),
      conPermisos(PERMISO_ESCRITURA),
      conPermisos('asignaciones.consultar'),
      conPermisos('asignaciones.modificarr'),
      conPermisos('asignaciones.*'),
      conPermisos(PERMISO_CONSULTA, PERMISO_ESCRITURA),
    ];
    for (const actor of casos) {
      let autorizado = true;
      try {
        requirePermission(actor, PERMISO_ESCRITURA);
      } catch {
        autorizado = false;
      }
      expect(canModifyAssignments(actor), JSON.stringify(actor)).toBe(autorizado);
    }
  });

  it('el modulo lo publica en su CONTRATO: es la via por la que la pantalla pregunta (R29, R50)', async () => {
    const contrato = await import('@/lib/modules/asignaciones');
    expect(typeof contrato.canModifyAssignments).toBe('function');
    expect(contrato.canModifyAssignments(conPermisos(PERMISO_ESCRITURA))).toBe(true);
    expect(contrato.canModifyAssignments(conPermisos('pedidos.consultar'))).toBe(false);
  });
});
