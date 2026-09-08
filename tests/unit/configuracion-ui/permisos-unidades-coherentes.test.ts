// QC-39 T4 — El ancla de R11: ningun rol sembrado puede llevar EXACTAMENTE UNO de los dos
// permisos de unidades.
//
// **Por que existe.** El item del menu declara `unidades.consultar` y la pantalla exige los DOS
// codigos (`design.md > 6`). Hoy eso es coherente porque el unico rol que tiene alguno de los dos
// —el Administrador— tiene los dos. Pero es una coincidencia del seed, no una garantia: el dia que
// un rol reciba solo `unidades.consultar` vera el enlace en el menu y recibira un 404 al pulsarlo
// (R10 + R12), y el dia que reciba solo `unidades.modificar` podra entrar a una pantalla cuyo
// enlace no ve y cuya lista no puede leer.
//
// Este archivo convierte esa suposicion en un rojo del gate: es barato, no renderiza nada y no
// depende del arbol de la UI. Los dos codigos se DERIVAN del catalogo de `identity`, no se
// escriben a mano.

import { describe, expect, it } from 'vitest';

import { PERMISSIONS, ROLE_ADMINISTRADOR, SEED_ROLE_PERMISSIONS } from '@/lib/modules/identity';

/** Los codigos del modulo `unidades`, DERIVADOS del catalogo (nunca literales sueltos). */
const CODIGOS_DE_UNIDADES: readonly string[] = PERMISSIONS.filter(
  (entrada) => entrada.module === 'unidades',
).map((entrada) => entrada.code);

/**
 * La regla, aislada de la fuente de datos para poder dispararla con casos sinteticos.
 *
 * Devuelve los nombres de rol que llevan **algunos, pero no todos** los codigos del modulo. Con
 * cero codigos y con todos, el rol es coherente: o no tiene nada que ver con unidades, o lo tiene
 * todo.
 */
function rolesIncoherentes(
  porRol: Readonly<Record<string, readonly string[]>>,
  codigos: readonly string[],
): readonly string[] {
  return Object.entries(porRol)
    .filter(([, permisos]) => {
      const cuantos = codigos.filter((codigo) => permisos.includes(codigo)).length;
      return cuantos > 0 && cuantos < codigos.length;
    })
    .map(([rol]) => rol);
}

describe('ningun rol sembrado tiene uno solo de los permisos de unidades (R11)', () => {
  it('ancla: el catalogo declara los DOS codigos de unidades', () => {
    // Anti-vacuidad: con la lista vacia —o con uno solo— la regla no podria distinguir «todos» de
    // «algunos» y el test de abajo pasaria sin comprobar nada.
    expect([...CODIGOS_DE_UNIDADES].sort()).toEqual(['unidades.consultar', 'unidades.modificar']);
  });

  it('ancla: el seed tiene al menos un rol con los dos permisos', () => {
    // Si nadie tuviera ninguno, la comprobacion seria trivialmente verde y la pantalla no seria
    // alcanzable por nadie.
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR] ?? []).toEqual(
      expect.arrayContaining([...CODIGOS_DE_UNIDADES]),
    );
  });

  it('SEED_ROLE_PERMISSIONS no tiene ningun rol con exactamente uno de los dos', () => {
    const incoherentes = rolesIncoherentes(SEED_ROLE_PERMISSIONS, CODIGOS_DE_UNIDADES);

    expect(
      incoherentes,
      `estos roles llevan uno solo de ${CODIGOS_DE_UNIDADES.join(' / ')}: ${incoherentes.join(', ')}. ` +
        'Verian el item del menu y recibirian 404 al pulsarlo (R10 + R12), o al reves. ' +
        'Dales los dos permisos o ninguno.',
    ).toEqual([]);
  });
});

describe('la regla dispara donde debe y no dispara donde no debe (caso sintetico)', () => {
  it('dispara con un rol que solo tiene consultar', () => {
    const incoherentes = rolesIncoherentes(
      { 'solo-consulta': ['unidades.consultar', 'inventario.consultar'] },
      CODIGOS_DE_UNIDADES,
    );

    expect(incoherentes).toEqual(['solo-consulta']);
  });

  it('dispara con un rol que solo tiene modificar', () => {
    const incoherentes = rolesIncoherentes(
      { 'solo-escritura': ['unidades.modificar'] },
      CODIGOS_DE_UNIDADES,
    );

    expect(incoherentes).toEqual(['solo-escritura']);
  });

  it('NO dispara con un rol que tiene los dos ni con uno que no tiene ninguno', () => {
    const incoherentes = rolesIncoherentes(
      {
        completo: [...CODIGOS_DE_UNIDADES],
        ajeno: ['inventario.consultar'],
        vacio: [],
      },
      CODIGOS_DE_UNIDADES,
    );

    expect(incoherentes).toEqual([]);
  });
});
