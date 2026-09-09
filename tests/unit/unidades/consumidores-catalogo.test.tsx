// QC-39 T2 — Los consumidores de hoy del catalogo siguen en pie (R4).
//
// R4 dice dos cosas y aqui se comprueban las dos:
//   1. que el selector de unidad del formulario de recetas (`UnitPicker`) y el del detalle de
//      proveedor (`UnitSelect`) RENDERIZAN con datos de `UnitView` -sin estrechar ninguna union
//      y sin descartar campos-, y
//   2. que sus archivos NO HAN CAMBIADO respecto a la rama base: seguir compilando «porque se
//      les retoco algo» no es seguir compilando sin cambios.
//
// El punto 1 tiene ademas una mitad que este archivo demuestra en COMPILACION y no en ejecucion:
// las props de los dos componentes siguen tipadas con `UnitRef`, y se les pasa `UnitView`. Si
// `UnitView` dejara de extender `UnitRef`, este archivo no compilaria -y `pnpm typecheck` es
// parte del gate-.
//
// No se abre ningun desplegable: lo que R4 exige es que estos componentes sigan aceptando y
// pintando el catalogo, no volver a probar su comportamiento -eso ya lo hacen
// `tests/unit/recetas-ui/recipe-form.test.tsx` y `tests/unit/proveedores-ui/unit-select.test.tsx`,
// que son suyos-.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { UnitPicker } from '@/app/(private)/produccion/formulas/components';
import { NO_UNIT_VALUE, UNIT_FIELD, UnitSelect } from '@/app/(private)/proveedores/[id]/components';

import type { UnitRef, UnitView } from '@/lib/modules/unidades';

/** Sube desde este archivo hasta la raiz del repo (la carpeta con `package.json`). */
function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    try {
      readFileSync(join(dir, 'package.json'));
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) throw new Error(`no se encontro package.json subiendo desde ${startDir}`);
      dir = parent;
    }
  }
}

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));

/** Las dos pantallas que hoy piden el catalogo completo (`design.md > 0`). */
const PANTALLAS_CONSUMIDORAS = ['app/(private)/produccion/formulas', 'app/(private)/proveedores'];

/** Catalogo con las dos formas que existen: una unidad BASE de sistema y una DERIVADA de la
 *  empresa, sin simbolo. Es lo que devuelve `listUnitsAction()` desde QC-39. */
const UNIDADES: readonly UnitView[] = [
  { id: 'unit-kg', name: 'Kilogramo', symbol: 'kg', baseUnitId: null, factor: null, isSystem: true },
  {
    id: 'unit-saco',
    name: 'Saco',
    symbol: null,
    baseUnitId: 'unit-kg',
    factor: '25.0000',
    isSystem: false,
  },
];

/** La prueba en COMPILACION de R4: lo que devuelve el listado sigue siendo un `UnitRef` valido
 *  para quien solo conoce `UnitRef`, sin estrechar nada ni descartar campos. */
const COMO_LOS_VE_QUIEN_SOLO_CONOCE_UNITREF: readonly UnitRef[] = UNIDADES;

function git(args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd: repoRoot, encoding: 'utf8' });
}

/** La BASE DE FUSION con `origin/dev`, calculada en cada ejecucion -el mismo mecanismo que usa
 *  `modulo-intacto.test.ts`-. Aqui habia un commit fijado a mano (`516e9c0`, la punta de
 *  `origin/dev` al montar el worktree). Un commit fijado deja de ser «la rama base» en cuanto
 *  hay un merge: al mergear `origin/dev` en esta rama, la comparacion empezo a atribuir a QC-39
 *  los nueve archivos de `produccion/formulas/` que trajo el merge. Era un falso positivo de la
 *  MEDICION -`git diff --name-only origin/dev...HEAD` no lista ninguno-, no una infraccion de R4.
 *  Devuelve `null` si el rango no esta disponible (sin remoto, clon superficial); quien lo llama
 *  SALTA en voz alta en vez de pasar en verde. */
function mergeBaseConDev(): string | null {
  try {
    return git(['merge-base', 'origin/dev', 'HEAD']).trim();
  } catch {
    return null;
  }
}

afterEach(() => {
  cleanup();
});

describe('el selector del formulario de recetas renderiza con datos de UnitView (R4)', () => {
  it('se monta con el catalogo ampliado y presenta su disparador', () => {
    render(
      <UnitPicker
        units={UNIDADES}
        value={UNIDADES[0]?.id ?? ''}
        onChange={() => undefined}
        label="Unidad"
        testId="unit-picker"
      />,
    );

    // Por `data-testid` y por rol/nombre accesible, nunca por copy de la pantalla (R49).
    expect(screen.getByTestId('unit-picker')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Unidad' })).toBeInTheDocument();
  });

  it('acepta el catalogo entero sin descartar ninguna unidad ni ningun campo', () => {
    expect(COMO_LOS_VE_QUIEN_SOLO_CONOCE_UNITREF).toHaveLength(UNIDADES.length);
    expect(COMO_LOS_VE_QUIEN_SOLO_CONOCE_UNITREF[1]?.symbol).toBeNull();
  });
});

describe('el selector del detalle de proveedor renderiza con datos de UnitView (R4)', () => {
  it('se monta dentro de su formulario y envia el identificador de la unidad elegida', () => {
    render(
      <form data-testid="formulario">
        <UnitSelect units={UNIDADES} defaultValue={UNIDADES[1]?.id ?? null} />
      </form>,
    );

    expect(screen.getByTestId('unit-select')).toBeInTheDocument();
    const enviado = new FormData(screen.getByTestId('formulario') as HTMLFormElement);
    expect(enviado.get(UNIT_FIELD)).toBe('unit-saco');
  });

  it('sin unidad asignada sigue enviando el valor de «sin unidad»', () => {
    render(
      <form data-testid="formulario">
        <UnitSelect units={UNIDADES} />
      </form>,
    );

    const enviado = new FormData(screen.getByTestId('formulario') as HTMLFormElement);
    expect(enviado.get(UNIT_FIELD)).toBe(NO_UNIT_VALUE);
  });
});

describe('sus archivos NO cambian con esta ficha (R4, R47)', () => {
  it('ni el formulario de recetas ni el detalle de proveedor se tocan respecto a la base de fusion', (ctx) => {
    const base = mergeBaseConDev();
    if (base === null) {
      ctx.skip(
        'no se pudo calcular `git merge-base origin/dev HEAD` (sin remoto, o rango no ' +
          'disponible): este caso NO ha comprobado nada.',
      );
      return;
    }

    // Se compara el ARBOL ENTERO de las dos pantallas, no solo los dos selectores: lo que R4
    // promete es que estos consumidores no pagan la ampliacion, y retocar su pagina o su
    // formulario para que compile seria pagarla.
    const cambiados = git(['diff', '--name-only', base, '--', ...PANTALLAS_CONSUMIDORAS])
      .split('\n')
      .map((linea) => linea.trim())
      .filter((linea) => linea !== '');

    expect(cambiados, `QC-39 modifico pantallas ajenas: ${cambiados.join(', ')}`).toEqual([]);
  });
});
