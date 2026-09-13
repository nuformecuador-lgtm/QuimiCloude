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

import { requirePermission, type Actor } from '@/lib/modules/asignaciones/domain/actor';
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
