import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const archivoPropio = fileURLToPath(import.meta.url);

function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

const PATRONES_DE_TOTAL_FIJO: readonly { nombre: string; patron: RegExp }[] = [
  {
    nombre: 'PERMISSIONS.length',
    patron: /PERMISSIONS\.length\b[^;\n]{0,80}?\.(?:toBe|toEqual)\(\s*\d+\s*\)/,
  },
  {
    nombre: 'PERMISSIONS) + toHaveLength(',
    patron: /PERMISSIONS\)[^;\n]{0,80}?\.toHaveLength\(\s*\d+\s*\)/,
  },
  {
    nombre: 'CODIGOS_VALIDOS',
    patron: /CODIGOS_VALIDOS(?:\.length)?\)?[^;\n]{0,80}?\.(?:toBe|toEqual|toHaveLength)\(\s*\d+\s*\)/,
  },
  {
    nombre: 'PERMISOS_ESPERADOS =',
    patron: /PERMISOS_ESPERADOS\s*=\s*\d+\b/,
  },
  {
    nombre: 'TOTAL_DE_ASIGNACIONES_DEL_SEED',
    patron:
      /TOTAL_DE_ASIGNACIONES_DEL_SEED\)?[^;\n]{0,80}?\.(?:toBe|toEqual|toHaveLength)\(\s*\d+\s*\)/,
  },
];

/**
 * Los nombres de los anclajes de R3 que un fuente de test dispara, fuera de comentarios. Puro y
 * exportado para poder demostrar con casos sinteticos que la regla dispara, y el simetrico que no.
 */
export function totalesFijosDelCatalogoEn(fuente: string): string[] {
  const limpio = sinComentarios(fuente);
  return PATRONES_DE_TOTAL_FIJO.filter(({ patron }) => patron.test(limpio)).map(
    ({ nombre }) => nombre,
  );
}

function fuentesDeTestBajo(carpeta: string): { ruta: string; codigo: string }[] {
  const encontradas: { ruta: string; codigo: string }[] = [];

  const recorrer = (directorio: string) => {
    let entradas: string[];
    try {
      entradas = readdirSync(directorio);
    } catch {
      return;
    }
    for (const nombre of entradas) {
      const completa = join(directorio, nombre);
      if (statSync(completa).isDirectory()) {
        if (nombre === 'node_modules' || nombre === '.next') continue;
        recorrer(completa);
        continue;
      }
      if (/\.(test|spec)\.tsx?$/.test(nombre)) {
        encontradas.push({ ruta: completa, codigo: readFileSync(completa, 'utf8') });
      }
    }
  };

  recorrer(carpeta);
  return encontradas;
}

describe('totalesFijosDelCatalogoEn — el predicado que detecta un total literal del catalogo o del seed', () => {
  it('dispara con PERMISSIONS.length comparado contra un numero', () => {
    expect(totalesFijosDelCatalogoEn('expect(PERMISSIONS.length).toBe(20);')).toContain(
      'PERMISSIONS.length',
    );
  });

  it('dispara con PERMISSIONS seguido de toHaveLength con un numero', () => {
    expect(totalesFijosDelCatalogoEn('expect(PERMISSIONS).toHaveLength(20);')).toContain(
      'PERMISSIONS) + toHaveLength(',
    );
  });

  it('dispara con CODIGOS_VALIDOS comparado contra un numero', () => {
    expect(totalesFijosDelCatalogoEn('expect(CODIGOS_VALIDOS).toHaveLength(20);')).toContain(
      'CODIGOS_VALIDOS',
    );
  });

  it('dispara con PERMISOS_ESPERADOS asignado a un numero', () => {
    expect(totalesFijosDelCatalogoEn('const PERMISOS_ESPERADOS = 20')).toContain(
      'PERMISOS_ESPERADOS =',
    );
  });

  it('dispara con TOTAL_DE_ASIGNACIONES_DEL_SEED comparado contra un numero', () => {
    expect(
      totalesFijosDelCatalogoEn('expect(TOTAL_DE_ASIGNACIONES_DEL_SEED).toBe(24);'),
    ).toContain('TOTAL_DE_ASIGNACIONES_DEL_SEED');
  });

  it('no dispara con una derivacion sin literal ni con un total citado dentro de un comentario', () => {
    const sintetico = [
      '// expect(PERMISSIONS.length).toBe(20);',
      'expect(PERMISSIONS.length).toBeGreaterThan(0);',
      'expect(PERMISSIONS).toContainEqual(algo);',
      'const PERMISOS_ESPERADOS = codigos.length;',
      'expect(TOTAL_DE_ASIGNACIONES_DEL_SEED).toBeGreaterThan(0);',
      'expect(CODIGOS_VALIDOS.length).toBeGreaterThan(0);',
    ].join('\n');

    expect(totalesFijosDelCatalogoEn(sintetico)).toEqual([]);
  });
});

describe('barrido real de tests/ y e2e/ — ningun total fijo del catalogo ni del seed', () => {
  it('ningun fuente de test trae un total literal del catalogo ni del seed', () => {
    const hallazgos: string[] = [];

    for (const raiz of ['tests', 'e2e']) {
      for (const { ruta, codigo } of fuentesDeTestBajo(join(repoRoot, raiz))) {
        if (ruta === archivoPropio) continue;
        for (const nombre of totalesFijosDelCatalogoEn(codigo)) {
          hallazgos.push(`${ruta}: ${nombre}`);
        }
      }
    }

    expect(hallazgos, hallazgos.join('\n')).toEqual([]);
  });
});
