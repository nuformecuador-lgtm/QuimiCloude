import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const archivoPropio = fileURLToPath(import.meta.url);

/**
 * Quita comentarios tokenizando con el scanner de TypeScript en vez de con una regex: una regex
 * confunde un asterisco-barra dentro de un string o un template literal (por ejemplo un glob
 * `lib/**` en el nombre de un caso) con el inicio de un comentario real y se come el codigo hasta
 * el siguiente cierre de comentario.
 */
function sinComentarios(fuente: string): string {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, fuente);
  const piezas: string[] = [];
  let token = scanner.scan();
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    const texto = scanner.getTokenText();
    const esComentario =
      token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia;
    piezas.push(esComentario ? texto.replace(/[^\n]/g, ' ') : texto);
    token = scanner.scan();
  }
  // Colapsa el espacio en blanco para que una asercion repartida en varias lineas (parametros,
  // mensaje de fallo concatenado con `+`) se vea como una sola secuencia para los patrones.
  return piezas.join('').replace(/\s+/g, ' ');
}

// Ventana entre el identificador y el matcher: suficiente para una asercion multilinea con un
// mensaje de fallo concatenado (~250 caracteres en el precedente real), sin abrir paso libre.
const VENTANA = '.{0,300}?';

const PATRONES_DE_TOTAL_FIJO: readonly { nombre: string; patron: RegExp }[] = [
  {
    nombre: 'PERMISSIONS.length',
    patron: new RegExp(`PERMISSIONS\\.length\\b${VENTANA}\\.(?:toBe|toEqual)\\(\\s*\\d+\\s*\\)`),
  },
  {
    nombre: 'PERMISSIONS) + toHaveLength(',
    patron: new RegExp(`PERMISSIONS\\)${VENTANA}\\.toHaveLength\\(\\s*\\d+\\s*\\)`),
  },
  {
    nombre: 'CODIGOS_VALIDOS',
    patron: new RegExp(
      `CODIGOS_VALIDOS(?:\\.length)?\\)?${VENTANA}\\.(?:toBe|toEqual|toHaveLength)\\(\\s*\\d+\\s*\\)`,
    ),
  },
  {
    nombre: 'PERMISOS_ESPERADOS =',
    patron: /PERMISOS_ESPERADOS\s*=\s*\d+\b/,
  },
  {
    nombre: 'TOTAL_DE_ASIGNACIONES_DEL_SEED',
    patron: new RegExp(
      `TOTAL_DE_ASIGNACIONES_DEL_SEED\\)?${VENTANA}\\.(?:toBe|toEqual|toHaveLength)\\(\\s*\\d+\\s*\\)`,
    ),
  },
  {
    nombre: 'codigosDelAdministrador) + toHaveLength(',
    patron: new RegExp(`codigosDelAdministrador\\)${VENTANA}\\.toHaveLength\\(\\s*\\d+\\s*\\)`),
  },
  {
    nombre: 'antes.permisos) + toHaveLength(',
    patron: new RegExp(`antes\\.permisos\\)${VENTANA}\\.toHaveLength\\(\\s*\\d+\\s*\\)`),
  },
  {
    nombre: 'antes.asignaciones) + toHaveLength(',
    patron: new RegExp(`antes\\.asignaciones\\)${VENTANA}\\.toHaveLength\\(\\s*\\d+\\s*\\)`),
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
    const entradas = readdirSync(directorio);
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

  it('dispara con codigosDelAdministrador seguido de toHaveLength con un numero', () => {
    expect(
      totalesFijosDelCatalogoEn('expect(codigosDelAdministrador).toHaveLength(20);'),
    ).toContain('codigosDelAdministrador) + toHaveLength(');
  });

  it('dispara con antes.permisos seguido de toHaveLength con un numero', () => {
    expect(totalesFijosDelCatalogoEn('expect(antes.permisos).toHaveLength(20);')).toContain(
      'antes.permisos) + toHaveLength(',
    );
  });

  it('dispara con antes.asignaciones seguido de toHaveLength con un numero', () => {
    expect(totalesFijosDelCatalogoEn('expect(antes.asignaciones).toHaveLength(24);')).toContain(
      'antes.asignaciones) + toHaveLength(',
    );
  });

  it('no dispara con una derivacion sin literal ni con un total citado dentro de un comentario', () => {
    const sintetico = [
      '// expect(PERMISSIONS.length).toBe(20);',
      'expect(PERMISSIONS.length).toBeGreaterThan(0);',
      'expect(PERMISSIONS).toContainEqual(algo);',
      'const PERMISOS_ESPERADOS = codigos.length;',
      'expect(TOTAL_DE_ASIGNACIONES_DEL_SEED).toBeGreaterThan(0);',
      'expect(CODIGOS_VALIDOS.length).toBeGreaterThan(0);',
      'expect(codigosDelAdministrador).toHaveLength(PERMISSIONS.length);',
      'expect(antes.permisos).toHaveLength(PERMISSIONS.length);',
    ].join('\n');

    expect(totalesFijosDelCatalogoEn(sintetico)).toEqual([]);
  });

  // R3 en origin/dev, sitio #1 (guard-permisos-sembrados.test.ts): la asercion real esta repartida
  // en varias lineas y el mensaje de fallo va concatenado con `+`.
  it('dispara con la asercion multilinea real de guard-permisos-sembrados.test.ts en origin/dev', () => {
    const fragmentoReal = `
    expect(
      PERMISSIONS.length,
      'El catalogo es cerrado y tiene dieciocho entradas, sumadas ficha a ficha. Si esta ' +
        'ficha lo cambia a proposito, actualiza este numero; si no, alguien borro o duplico una ' +
        'fila de PERMISSIONS.',
    ).toBe(18)
    `;

    expect(totalesFijosDelCatalogoEn(fragmentoReal)).toContain('PERMISSIONS.length');
  });

  // R3 en origin/dev, sitio #9 (qc145-estado-solo-planta.test.ts): el archivo trae, mas arriba, un
  // string con un glob `lib/**` que una regex de comentarios confunde con un comentario de bloque.
  it('dispara con el fragmento real de qc145-estado-solo-planta.test.ts, con su glob lib/** delante', () => {
    const fragmentoReal = `
    it('ningun bloque \`data:\` de lib/** fuera de order-prisma.ts nombra finishedAt/finished_at', () => {
      expect(true).toBe(true);
    });

    describe('R16 — el catalogo de permisos sigue en dieciocho codigos', () => {
      it('PERMISSIONS tiene exactamente 18 entradas', () => {
        expect(PERMISSIONS).toHaveLength(18);
      });
    });
    `;

    expect(totalesFijosDelCatalogoEn(fragmentoReal)).toContain('PERMISSIONS) + toHaveLength(');
  });
});

describe('barrido real de tests/ y e2e/ — ningun total fijo del catalogo ni del seed', () => {
  // Ancla contra el verde por vacuidad: si la raiz se resolviera mal, el barrido no leeria nada y
  // el caso de abajo pasaria sin haber mirado un solo archivo.
  it('el barrido lee mas de cero archivos de tests/, incluido guard-permisos-sembrados.test.ts', () => {
    const encontrados = fuentesDeTestBajo(join(repoRoot, 'tests'));

    expect(encontrados.length).toBeGreaterThan(0);
    expect(encontrados.map(({ ruta }) => ruta)).toContain(
      join(repoRoot, 'tests', 'guards', 'guard-permisos-sembrados.test.ts'),
    );
  });

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
