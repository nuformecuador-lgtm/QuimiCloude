/**
 * QC-94 T7 — El catalogo de roles contra Postgres REAL (R8, R9, R10, R17).
 *
 * QUE SE EJERCITA: el ADAPTADOR de produccion directamente —`listAllRoles` de
 * `lib/modules/identity/adapters/driven/persistence/role-catalog-prisma.ts`—, no la fachada ni la
 * Server Action. Mismo reparto que `user-crud.int.test.ts` con `user-admin-prisma.ts`: aqui se
 * prueba lo que SOLO la base puede contestar —que salen todas las filas, que salen con las dos
 * columnas enumeradas y que el `ORDER BY name ASC` lo aplica la base—, y la autorizacion y la forma
 * de la salida ya tienen sus unitarios (`tests/unit/identity/roles/**`).
 *
 * ESTE ARCHIVO NO ESCRIBE NADA (R17, R19): no crea, no edita y no borra ninguna fila, ni de `roles`
 * ni de ninguna otra tabla. No hace falta aislamiento porque no hay nada que deshacer. El catalogo
 * es GLOBAL y solo cambia por migracion y seed.
 *
 * POR QUE NO SE AFIRMA IGUALDAD EXACTA CONTRA «LOS DOS ROLES DEL SEED» (`design.md > 9.2`):
 * `e2e/login.spec.ts` crea y borra roles EFIMEROS (`qc9_e2e_rol_<RUN_ID>`), y los de integracion no
 * estan aislados entre suites. Un `toEqual([Administrador, Operador])` se pondria rojo por culpa de
 * otra suite. Asi que se afirma lo que es cierto pase lo que pase: que el Operador del seed ESTA
 * —y, desde el fix directo del 2026-09-22, que el Administrador NO sale—, que
 * cada elemento tiene EXACTAMENTE dos claves, y que la secuencia COMPLETA —sea cual sea su
 * contenido— esta ordenada con el MISMO criterio que la base.
 *
 * COMO SE COMPRUEBA EL ORDEN SIN INVENTARSE UNA COLACION: el orden esperado sale de la propia base
 * con un `ORDER BY name ASC` en SQL crudo, no de un `Array.prototype.sort()` de JavaScript. Es
 * deliberado y es el mismo argumento de `design.md > 8.2`: `localeCompare` y la collation de
 * Postgres no coinciden en acentos ni en mayusculas, asi que un orden esperado calculado en
 * JavaScript convertiria este test en una apuesta sobre la configuracion de la maquina. Lo que el
 * requisito pide (R10) es que ordene la BASE y que el adaptador no reordene: eso es exactamente lo
 * que compara este archivo.
 *
 * SIN TESTS DE RLS: un test de RLS escrito con Prisma sale verde pase lo que pase, porque Prisma se
 * conecta como dueno de las tablas (`docs/architecture.md > Acceso a datos y autorizacion`). R7 lo
 * cierra `tests/guards/guard-rls-force.test.ts`.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { listAllRoles } from '@/lib/modules/identity/adapters/driven/persistence/role-catalog-prisma';
import { ROLE_ADMINISTRADOR, ROLE_EMPACADOR, ROLE_MAESTRO, ROLE_OPERADOR } from '@/lib/modules/identity/domain/roles';
import { prisma } from '@/lib/shared/db/prisma';

/** El orden que la BASE considera correcto entre lo que el catalogo devuelve, preguntado a la base.
 *  Ver la cabecera. Comparte con `listAllRoles` el filtro que excluye al Administrador y al Maestro,
 *  asi que la comparacion no depende de como el motor resuelva el `NOT IN`. */
async function ordenSegunLaBase(): Promise<readonly string[]> {
  const filas = await prisma.role.findMany({
    where: { name: { notIn: [ROLE_ADMINISTRADOR, ROLE_MAESTRO] } },
    select: { name: true },
    orderBy: { name: 'asc' },
  });
  return filas.map((fila) => fila.name);
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('QC-94 — listAllRoles devuelve el catalogo sin el rol administrador (R8, fix directo 2026-09-22)', () => {
  it('el rol del seed que SI se ofrece —Operador— esta, con su identificador', async () => {
    const roles = await listAllRoles();

    const encontrado = roles.find((rol) => rol.name === ROLE_OPERADOR);
    expect(encontrado, `falta el rol del seed «${ROLE_OPERADOR}»`).toBeDefined();
    expect(typeof encontrado!.id).toBe('string');
    expect(encontrado!.id.length).toBeGreaterThan(0);
  });

  // El Empacador nace en el mismo selector, por el mismo filtro, sin tocar la pantalla.
  it('R22 — el rol Empacador tambien esta, con su identificador', async () => {
    const roles = await listAllRoles();

    const encontrado = roles.find((rol) => rol.name === ROLE_EMPACADOR);
    expect(encontrado, `falta el rol del seed «${ROLE_EMPACADOR}»`).toBeDefined();
    expect(typeof encontrado!.id).toBe('string');
    expect(encontrado!.id.length).toBeGreaterThan(0);
  });

  it('el rol administrador NO se ofrece: el select no puede concederlo', async () => {
    const roles = await listAllRoles();

    expect(roles.find((rol) => rol.name === ROLE_ADMINISTRADOR)).toBeUndefined();
  });

  it('QC-161 R23 — el rol Maestro existe en la base y NO se ofrece en el selector', async () => {
    // Ancla: si la fila no existiera, el `toBeUndefined` de abajo pasaria por la razon equivocada.
    expect(await prisma.role.count({ where: { name: ROLE_MAESTRO } })).toBe(1);

    const roles = await listAllRoles();

    expect(roles.find((rol) => rol.name === ROLE_MAESTRO)).toBeUndefined();
  });

  it('QC-161 R23 — no omite ninguna fila salvo las del Administrador y el Maestro', async () => {
    const roles = await listAllRoles();
    const total = await prisma.role.count({
      where: { name: { notIn: [ROLE_ADMINISTRADOR, ROLE_MAESTRO] } },
    });

    expect(roles).toHaveLength(total);
  });
});

describe('QC-94 — cada elemento trae EXACTAMENTE dos claves (R9)', () => {
  it('`id` y `name`, y ni `description` ni las marcas de tiempo', async () => {
    const roles = await listAllRoles();

    expect(roles.length).toBeGreaterThan(0);
    for (const rol of roles) {
      expect(Object.keys(rol).sort()).toEqual(['id', 'name']);
    }
  });
});

describe('QC-94 — la secuencia la ordena la BASE por nombre ascendente (R10)', () => {
  it('la secuencia completa coincide con el `ORDER BY name ASC` de la propia base', async () => {
    const roles = await listAllRoles();

    expect(roles.map((rol) => rol.name)).toEqual([...(await ordenSegunLaBase())]);
  });

  it('el orden es determinista: dos invocaciones devuelven la misma secuencia', async () => {
    const primera = await listAllRoles();
    const segunda = await listAllRoles();

    expect(segunda).toEqual(primera);
  });
});
