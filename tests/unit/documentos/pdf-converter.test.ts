// El adaptador de conversion y el aislamiento de la libreria de PDF.
//
// **Ningun caso de este archivo convierte un PDF de verdad**, y no es por comodidad: convertir
// exigiria meter un PDF binario de muestra en el repositorio, y esta feature no anade ni un archivo
// binario. Lo que si se verifica aqui es lo que se puede verificar sin uno: que la libreria siga
// encerrada en un solo archivo, que importar ese archivo no lance, y que la ausencia del par nativo
// falle con un error que NOMBRE esa causa en vez de disfrazarla de fallo del documento.
//
// Ningun caso hace red.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { resolveRasterizer } from '@/lib/modules/documentos/adapters/driven/pdf/pdf-converter-unpdf';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * Este mismo archivo escribe los dos nombres dentro de cadenas de ejemplo, para demostrar que el
 * detector dispara. Se excluye del barrido por eso y solo por eso: no los importa.
 */
const selfPath = fileURLToPath(import.meta.url);

const ADAPTADOR = 'lib/modules/documentos/adapters/driven/pdf/pdf-converter-unpdf.ts';

/**
 * Los dos paquetes de la conversion. La condicion con la que fueron aprobados es que vivan
 * **aislados en un solo archivo**: si aparecen en un segundo sitio, sustituirlos deja de ser
 * reescribir un archivo y pasa a ser buscarlos por el repositorio.
 */
const PAQUETES_DE_CONVERSION = ['unpdf', '@napi-rs/canvas'];

/** Arbol de produccion mas el de tests: la condicion no admite excepcion en ninguno de los dos. */
const ARBOL_VIGILADO = ['lib', 'app', 'components', 'hooks', 'scripts', 'tests', 'e2e'];

function toPosix(ruta: string): string {
  return ruta.split(sep).join('/');
}

/** Ver la nota del barrido gemelo: se vigilan los IMPORTS, no la prosa de los comentarios. */
function fuenteSinComentarios(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/[^\n]*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

function archivosDe(absDir: string): readonly string[] {
  if (!existsSync(absDir)) return [];
  const salida: string[] = [];
  const recorrer = (dir: string) => {
    for (const nombre of readdirSync(dir)) {
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else if (/\.(ts|tsx|mts|mjs|js)$/.test(ruta)) salida.push(ruta);
    }
  };
  recorrer(absDir);
  return salida;
}

function importaElPaquete(source: string, paquete: string): boolean {
  const escapado = paquete.replace(/[/@-]/g, (c) => `\\${c}`);
  return new RegExp(
    `from\\s+['"]${escapado}['"]|require\\(\\s*['"]${escapado}['"]\\s*\\)|import\\(\\s*['"]${escapado}['"]\\s*\\)`,
  ).test(fuenteSinComentarios(source));
}

describe('documentos — el adaptador de conversion y el aislamiento de su libreria', () => {
  describe('la libreria de conversion vive en un solo archivo (R24)', () => {
    const fuentes = ARBOL_VIGILADO.flatMap((dir) => archivosDe(join(repoRoot, dir))).filter(
      (abs) => abs !== selfPath,
    );

    it('R24 — el barrido recorre de verdad el arbol vigilado', () => {
      expect(fuentes.length).toBeGreaterThan(100);
    });

    it.each(PAQUETES_DE_CONVERSION)('R24 — %s lo importa un UNICO archivo, el adaptador', (paquete) => {
      const importadores = fuentes
        .filter((abs) => importaElPaquete(readFileSync(abs, 'utf8'), paquete))
        .map((abs) => toPosix(relative(repoRoot, abs)))
        .sort();

      expect(importadores).toEqual([ADAPTADOR]);
    });

    it('R24 — el detector dispara: un import de la libreria en otro archivo seria un hallazgo', () => {
      // Sin este caso, una expresion mal escrita dejaria el barrido en verde sobre cualquier cosa.
      expect(importaElPaquete("import { extractText } from 'unpdf';", 'unpdf')).toBe(true);
      expect(importaElPaquete("await import('@napi-rs/canvas');", '@napi-rs/canvas')).toBe(true);
      expect(importaElPaquete("// se nombra unpdf en un comentario", 'unpdf')).toBe(false);
    });

    it('R24 — el dominio y los puertos del modulo no ven ninguno de los dos paquetes', () => {
      const delModulo = archivosDe(join(repoRoot, 'lib', 'modules', 'documentos'))
        .map((abs) => toPosix(relative(repoRoot, abs)))
        .filter((ruta) => ruta.includes('/domain/') || ruta.includes('/ports/'));
      expect(delModulo.length).toBeGreaterThan(0);

      for (const ruta of delModulo) {
        const source = readFileSync(join(repoRoot, ruta), 'utf8');
        for (const paquete of PAQUETES_DE_CONVERSION) {
          expect(importaElPaquete(source, paquete), `${ruta} importa ${paquete}`).toBe(false);
        }
      }
    });
  });

  describe('el adaptador se puede importar sin convertir nada (R22)', () => {
    it('R22 — importar el adaptador no lanza y expone las tres operaciones del puerto', async () => {
      const adaptador = await import('@/lib/modules/documentos/adapters/driven/pdf/pdf-converter-unpdf');

      expect(typeof adaptador.countPages).toBe('function');
      expect(typeof adaptador.extractPdfText).toBe('function');
      expect(typeof adaptador.renderPages).toBe('function');
    });

    it('R22 — contar paginas y rasterizar son operaciones SEPARADAS: se puede rechazar sin renderizar', async () => {
      const adaptador = await import('@/lib/modules/documentos/adapters/driven/pdf/pdf-converter-unpdf');

      expect(adaptador.countPages).not.toBe(adaptador.renderPages);
      // `countPages` recibe solo los bytes; `renderPages` recibe ademas la resolucion.
      expect(adaptador.countPages.length).toBe(1);
      expect(adaptador.renderPages.length).toBe(2);
    });
  });

  describe('sin el par nativo, la imagen falla nombrando la causa y el texto no (R25)', () => {
    it('R25 — si el par nativo no carga, el error NOMBRA esa causa y dice que el texto sigue disponible', async () => {
      const fallo = new Error("Cannot find module '@napi-rs/canvas'");

      let mensaje = '';
      try {
        await resolveRasterizer(() => Promise.reject(fallo));
      } catch (error) {
        mensaje = error instanceof Error ? error.message : String(error);
      }

      expect(mensaje).toMatch(/par nativo/);
      expect(mensaje).toMatch(/no esta disponible/);
      expect(mensaje).toMatch(/texto/);
      // El fallo original no se traga: viaja dentro del mensaje.
      expect(mensaje).toContain(fallo.message);
    });

    it('R25 — con el par disponible, lo devuelve tal cual y no envuelve nada', async () => {
      const parDoble = { createCanvas: () => undefined };

      await expect(resolveRasterizer(() => Promise.resolve(parDoble))).resolves.toBe(parDoble);
    });

    it('R25 — extraer texto no pasa por el par nativo: no aparece en el camino de la conversion a texto', () => {
      const fuente = fuenteSinComentarios(readFileSync(join(repoRoot, ADAPTADOR), 'utf8'));

      // La carga del par nativo esta DENTRO de `renderPages`, no en el top-level ni en el camino
      // del texto: si estuviera arriba, un entorno sin el binario tumbaria tambien el texto.
      const cargaDelPar = fuente.indexOf('resolveRasterizer(() => import(');
      const inicioDeRender = fuente.indexOf('export async function renderPages');
      expect(cargaDelPar).toBeGreaterThan(inicioDeRender);

      const caminoDelTexto = fuente.slice(
        fuente.indexOf('export async function extractPdfText'),
        inicioDeRender,
      );
      expect(caminoDelTexto).not.toMatch(/resolveRasterizer|napi/);
    });
  });
});
