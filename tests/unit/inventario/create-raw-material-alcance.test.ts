// Guardia de alcance de `createRawMaterial` / `createCreateRawMaterial`: la excepcion que
// permite crear un PRODUCT sin lote solo puede llamarla la revision de una importacion de
// formula. Afirma el ESTADO NUEVO en positivo, sobre fuentes nombradas y sobre fuentes
// fabricadas, al estilo de `qc121-alcance.test.ts` y `qc159-alcance.test.ts`.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

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

function leer(rutaRelativa: string): string {
  return readFileSync(join(repoRoot, rutaRelativa), 'utf8');
}

const CARPETAS_IGNORADAS = new Set(['node_modules', '.next', '.git', 'dist', 'coverage']);
const SUFIJOS_FUENTE = ['.ts', '.tsx'];

/** Los archivos fuente bajo una carpeta, en ruta relativa al repo y con `/` siempre. */
function archivosBajoCarpeta(carpetaRelativa: string): string[] {
  const encontrados: string[] = [];
  const base = join(repoRoot, carpetaRelativa);

  const recorrer = (directorio: string, relativa: string) => {
    for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
      const completa = join(directorio, entrada.name);
      const relativaHija = relativa === '' ? entrada.name : `${relativa}/${entrada.name}`;
      if (entrada.isDirectory()) {
        if (CARPETAS_IGNORADAS.has(entrada.name)) continue;
        recorrer(completa, relativaHija);
        continue;
      }
      if (SUFIJOS_FUENTE.some((sufijo) => entrada.name.endsWith(sufijo))) {
        encontrados.push(`${carpetaRelativa}/${relativaHija}`);
      }
    }
  };

  recorrer(base, '');
  return encontrados.sort();
}

function stripComments(fuente: string): string {
  let salida = '';
  let i = 0;
  while (i < fuente.length) {
    const c = fuente[i];
    const siguiente = fuente[i + 1];
    if (c === '/' && siguiente === '/') {
      while (i < fuente.length && fuente[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && siguiente === '*') {
      const fin = fuente.indexOf('*/', i + 2);
      i = fin === -1 ? fuente.length : fin + 2;
      salida += ' ';
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const inicio = i;
      i += 1;
      while (i < fuente.length && fuente[i] !== c) {
        if (fuente[i] === '\\') i += 1;
        i += 1;
      }
      i += 1;
      salida += fuente.slice(inicio, i);
      continue;
    }
    salida += c;
    i += 1;
  }
  return salida;
}

// -------------------------------------------------------------------------------------------
// R (m2) — createRawMaterial / createCreateRawMaterial solo en inventario, composition y el
// consumidor (documentos/domain)
// -------------------------------------------------------------------------------------------

const PATRON_IDENTIFICADOR = /\b(?:createRawMaterial|createCreateRawMaterial)\b/;

const RUTAS_PERMITIDAS = (ruta: string): boolean =>
  ruta.startsWith('lib/modules/inventario/') ||
  ruta === 'lib/composition/index.ts' ||
  ruta.startsWith('lib/modules/documentos/domain/');

/** Los archivos, de entre los dados, cuya fuente (sin comentarios) nombra el identificador y no
 *  estan en la lista de rutas permitidas. */
export function infraccionesDeAlcance(archivos: readonly { readonly ruta: string; readonly fuente: string }[]): string[] {
  return archivos
    .filter(({ fuente }) => PATRON_IDENTIFICADOR.test(stripComments(fuente)))
    .map(({ ruta }) => ruta.replace(/\\/g, '/'))
    .filter((ruta) => !RUTAS_PERMITIDAS(ruta))
    .sort();
}

describe('m2 — createRawMaterial / createCreateRawMaterial no aparecen fuera de su alcance', () => {
  it('detector: un archivo fabricado fuera de la lista permitida se detecta; los permitidos no', () => {
    const archivos = [
      { ruta: 'lib/modules/pedidos/domain/create-order.ts', fuente: 'await deps.createRawMaterial({ name }, actor);' },
      { ruta: 'app/(private)/produccion/atajo/page.tsx', fuente: 'const crear = createCreateRawMaterial({ products });' },
      { ruta: 'lib/modules/inventario/domain/create-raw-material.ts', fuente: 'export function createCreateRawMaterial() {}' },
      { ruta: 'lib/modules/inventario/index.ts', fuente: 'export { createCreateRawMaterial } from "./domain/create-raw-material";' },
      { ruta: 'lib/composition/index.ts', fuente: 'createRawMaterial: createCreateRawMaterial({ products: productRepository }),' },
      { ruta: 'lib/modules/documentos/domain/confirm-formula-import.ts', fuente: 'await deps.createRawMaterial({ name: need.rawName }, actor);' },
      { ruta: 'lib/modules/documentos/domain/preview-formula-import.ts', fuente: 'type CreateRawMaterial = ReturnType<typeof createCreateRawMaterial>;' },
      { ruta: 'lib/modules/recetas/domain/create-recipe.ts', fuente: 'sin nada que ver con materias primas' },
    ];

    expect(infraccionesDeAlcance(archivos)).toEqual([
      'app/(private)/produccion/atajo/page.tsx',
      'lib/modules/pedidos/domain/create-order.ts',
    ]);
  });

  it('el codigo real bajo app/, lib/ y components/ no nombra el identificador fuera de las rutas permitidas', () => {
    const archivos = [
      ...archivosBajoCarpeta('app'),
      ...archivosBajoCarpeta('lib'),
      ...archivosBajoCarpeta('components'),
    ];
    expect(archivos.length).toBeGreaterThan(100);

    const fuentes = archivos.map((ruta) => ({ ruta, fuente: leer(ruta) }));
    const infracciones = infraccionesDeAlcance(fuentes);
    expect(
      infracciones,
      `m2: la excepcion que crea un PRODUCT sin lote es solo para la revision de formula. Hallazgos:\n${infracciones.join('\n')}`,
    ).toEqual([]);
  });
});

// -------------------------------------------------------------------------------------------
// El uso DENTRO de lib/composition/index.ts esta acotado a dos sitios: el cableado de la
// fachada `inventario` y `formulaImportDeps`
// -------------------------------------------------------------------------------------------

function bloqueTrasEncabezado(codigoSinComentarios: string, encabezado: string): string | null {
  const inicio = codigoSinComentarios.indexOf(encabezado);
  if (inicio === -1) return null;
  const llave = codigoSinComentarios.indexOf('{', inicio);
  if (llave === -1) return null;
  let profundidad = 0;
  let fin = -1;
  for (let i = llave; i < codigoSinComentarios.length; i += 1) {
    if (codigoSinComentarios[i] === '{') profundidad += 1;
    if (codigoSinComentarios[i] === '}') {
      profundidad -= 1;
      if (profundidad === 0) {
        fin = i;
        break;
      }
    }
  }
  return fin === -1 ? null : codigoSinComentarios.slice(inicio, fin + 1);
}

/** Todas las apariciones del identificador que NO son el `import { ... createCreateRawMaterial
 *  ... }` de cabecera y que caen FUERA de los dos bloques permitidos: el cableado de la fachada
 *  `inventario` y `formulaImportDeps`. */
export function ocurrenciasFueraDeLosBloquesPermitidos(fuenteComposition: string): number {
  const codigo = stripComments(fuenteComposition);
  const bloqueInventario = bloqueTrasEncabezado(codigo, 'export const inventario = {') ?? '';
  const bloqueFormulaImportDeps = bloqueTrasEncabezado(codigo, 'const formulaImportDeps: FormulaImportDeps = {') ?? '';

  const patron = new RegExp(PATRON_IDENTIFICADOR.source, 'g');
  let fuera = 0;
  let match: RegExpExecArray | null;
  while ((match = patron.exec(codigo)) !== null) {
    const antes = codigo.slice(0, match.index);
    const esImport = /import\s*\{[^}]*$/.test(antes.slice(-400));
    if (esImport) continue;
    const enInventario = bloqueInventario !== '' && codigo.indexOf(bloqueInventario) <= match.index && match.index < codigo.indexOf(bloqueInventario) + bloqueInventario.length;
    const enFormulaImportDeps =
      bloqueFormulaImportDeps !== '' &&
      codigo.indexOf(bloqueFormulaImportDeps) <= match.index &&
      match.index < codigo.indexOf(bloqueFormulaImportDeps) + bloqueFormulaImportDeps.length;
    if (!enInventario && !enFormulaImportDeps) fuera += 1;
  }
  return fuera;
}

describe('m2 — dentro de lib/composition/index.ts, solo la fachada de inventario y formulaImportDeps lo usan', () => {
  it('detector: una llamada fabricada fuera de los dos bloques se detecta', () => {
    const fuente = [
      "import { createCreateRawMaterial } from '@/lib/modules/inventario';",
      '',
      'export const inventario = {',
      '  createRawMaterial: createCreateRawMaterial({ products: productRepository }),',
      '};',
      '',
      'const formulaImportDeps: FormulaImportDeps = {',
      '  createRawMaterial: inventario.createRawMaterial,',
      '};',
      '',
      'const otroCableadoQueNoDeberiaTocarlo = createCreateRawMaterial({ products: otroRepo });',
    ].join('\n');

    expect(ocurrenciasFueraDeLosBloquesPermitidos(fuente)).toBe(1);
  });

  it('verde: la misma forma sin el cableado extra no marca ninguna ocurrencia fuera de sitio', () => {
    const fuente = [
      "import { createCreateRawMaterial } from '@/lib/modules/inventario';",
      '',
      'export const inventario = {',
      '  createRawMaterial: createCreateRawMaterial({ products: productRepository }),',
      '};',
      '',
      'const formulaImportDeps: FormulaImportDeps = {',
      '  createRawMaterial: inventario.createRawMaterial,',
      '};',
    ].join('\n');

    expect(ocurrenciasFueraDeLosBloquesPermitidos(fuente)).toBe(0);
  });

  it('el lib/composition/index.ts real no usa el identificador fuera de esos dos bloques', () => {
    const fuente = leer('lib/composition/index.ts');
    expect(ocurrenciasFueraDeLosBloquesPermitidos(fuente)).toBe(0);
  });
});
