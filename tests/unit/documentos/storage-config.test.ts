// Configuracion del almacenamiento de documentos y aislamiento de la libreria de Storage.
//
// Este archivo NO hace red y NO depende de que ninguna variable del Storage tenga valor: lo que
// prueba es que la configuracion se lea EN LA INVOCACION —de modo que importar el adaptador con
// todo vacio no falle—, que el error nombre lo que falta sin filtrar valores, que `.env.example`
// declare la variable vacia y documentada, y que la libreria siga aislada en un solo archivo nuevo.
//
// Ninguna operacion del adaptador se llega a ejecutar contra un bucket: las dos invocaciones que
// hay aqui fallan al resolver la configuracion, ANTES de construir cliente alguno.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { readDocumentStorageConfigFromEnv } from '@/lib/modules/documentos/adapters/driven/config/document-storage-config-env';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const ADAPTADOR = '@/lib/modules/documentos/adapters/driven/storage/document-storage-supabase';

const REQUIRED_VARS = ['SUPABASE_STORAGE_URL', 'SUPABASE_DOCUMENTS_BUCKET', 'SUPABASE_STORAGE_KEY'] as const;

/** Arbol de PRODUCCION: lo que se despliega. Los tests se vigilan aparte. */
const ARBOL_DE_PRODUCCION = ['lib', 'app', 'components', 'hooks', 'scripts'];

/**
 * Los DOS archivos que pueden importar la libreria de Storage, y ninguno mas. El primero es el
 * precedente que ya existia; el segundo, el que anade este modulo.
 */
const IMPORTADORES_PERMITIDOS = [
  'lib/modules/documentos/adapters/driven/storage/document-storage-supabase.ts',
  'lib/modules/recetas/adapters/driven/storage/recipe-image-supabase.ts',
];

function toPosix(ruta: string): string {
  return ruta.split(sep).join('/');
}

/**
 * Fuente sin comentarios: lo que se vigila son los IMPORTS, no la prosa. Varios archivos del repo
 * nombran la libreria en un comentario para explicar que NO la importan, y sobre el texto crudo esas
 * advertencias se leerian como infracciones.
 *
 * Primero los comentarios de linea y despues los de bloque: al reves, un `//` que contenga una
 * apertura de bloque se traga el resto del archivo y el barrido pasaria en verde sin mirar nada.
 */
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

/** `from '<paquete>'`, `require('<paquete>')` e `import('<paquete>')`, y nada mas. */
function importaElPaquete(source: string, paquete: string): boolean {
  const escapado = paquete.replace(/[/@-]/g, (c) => `\\${c}`);
  return new RegExp(
    `from\\s+['"]${escapado}['"]|require\\(\\s*['"]${escapado}['"]\\s*\\)|import\\(\\s*['"]${escapado}['"]\\s*\\)`,
  ).test(fuenteSinComentarios(source));
}

describe('documentos — configuracion del almacenamiento y aislamiento de su libreria', () => {
  describe('la configuracion se lee en la invocacion, no al importar (R32, R31)', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      for (const name of REQUIRED_VARS) delete process.env[name];
      Object.assign(process.env, originalEnv);
    });

    it('R32, R31 — importar el adaptador con las tres variables vacias no lanza', async () => {
      for (const name of REQUIRED_VARS) process.env[name] = '';

      const adaptador = await import(ADAPTADOR);

      // Y lo que se importo es el adaptador de verdad, con las tres operaciones del puerto: si el
      // import resolviera a un modulo vacio, este caso pasaria en verde sin haber probado nada.
      expect(typeof adaptador.createDocumentSignedUpload).toBe('function');
      expect(typeof adaptador.createDocumentSignedReadUrl).toBe('function');
      expect(typeof adaptador.downloadDocument).toBe('function');
    });

    it('R32 — el puerto NO expresa ninguna operacion de borrado, ni el adaptador la implementa', async () => {
      for (const name of REQUIRED_VARS) process.env[name] = '';

      const adaptador = await import(ADAPTADOR);
      const borrados = Object.keys(adaptador).filter((nombre) => /remove|delete|borrar/i.test(nombre));
      expect(borrados, `el adaptador expone una operacion de borrado: ${borrados.join(', ')}`).toEqual([]);
    });

    it('R32 — invocar sin configuracion lanza nombrando las tres variables, sin ningun valor', async () => {
      for (const name of REQUIRED_VARS) delete process.env[name];

      const { createDocumentSignedUpload } = await import(ADAPTADOR);

      let mensaje = '';
      try {
        await createDocumentSignedUpload('empresa/archivo.pdf', 900);
      } catch (error) {
        mensaje = error instanceof Error ? error.message : String(error);
      }
      for (const name of REQUIRED_VARS) expect(mensaje).toContain(name);
    });

    it('R32 — con una sola presente, el mensaje nombra solo las que faltan y nunca el valor de la otra', () => {
      for (const name of REQUIRED_VARS) delete process.env[name];
      process.env.SUPABASE_STORAGE_URL = 'https://proyecto.supabase.co';

      let mensaje = '';
      try {
        readDocumentStorageConfigFromEnv();
      } catch (error) {
        mensaje = error instanceof Error ? error.message : String(error);
      }
      expect(mensaje).not.toContain('SUPABASE_STORAGE_URL');
      expect(mensaje).toContain('SUPABASE_DOCUMENTS_BUCKET');
      expect(mensaje).toContain('SUPABASE_STORAGE_KEY');
      expect(mensaje).not.toContain('https://proyecto.supabase.co');
    });

    it('R32 — una variable vacia o solo espacios cuenta como ausente', () => {
      for (const name of REQUIRED_VARS) delete process.env[name];
      process.env.SUPABASE_STORAGE_URL = '   ';
      process.env.SUPABASE_DOCUMENTS_BUCKET = 'documentos-privados';
      process.env.SUPABASE_STORAGE_KEY = 'credencial';

      expect(() => readDocumentStorageConfigFromEnv()).toThrowError(/SUPABASE_STORAGE_URL/);
    });

    it('R11, R32 — con las tres presentes resuelve el bucket PROPIO de los documentos, no el de las imagenes', () => {
      for (const name of REQUIRED_VARS) delete process.env[name];
      process.env.SUPABASE_STORAGE_URL = 'https://proyecto.supabase.co';
      process.env.SUPABASE_STORAGE_BUCKET = 'bucket-publico-de-imagenes';
      process.env.SUPABASE_DOCUMENTS_BUCKET = 'documentos-privados';
      process.env.SUPABASE_STORAGE_KEY = 'credencial';

      expect(readDocumentStorageConfigFromEnv()).toEqual({
        url: 'https://proyecto.supabase.co',
        bucket: 'documentos-privados',
        key: 'credencial',
      });
    });
  });

  describe('.env.example declara la variable nueva, vacia y documentada (R32)', () => {
    const envExample = readFileSync(join(repoRoot, '.env.example'), 'utf8');

    it('R32 — SUPABASE_DOCUMENTS_BUCKET esta declarada, VACIA y con su documentacion', () => {
      expect(envExample).toMatch(/^SUPABASE_DOCUMENTS_BUCKET=$/m);
      expect(envExample).toMatch(/Storage de documentos/);
      expect(envExample).toMatch(/PRIVADO/);
    });

    it('R11, R32 — la direccion y la credencial se REUTILIZAN: no nace ninguna variable duplicada', () => {
      const declaradas = [...envExample.matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1] as string);
      const duplicadas = declaradas.filter((nombre) => declaradas.indexOf(nombre) !== declaradas.lastIndexOf(nombre));
      expect(duplicadas).toEqual([]);
      for (const nueva of ['SUPABASE_DOCUMENTS_URL', 'SUPABASE_DOCUMENTS_KEY']) {
        expect(declaradas, `${nueva} duplicaria el proyecto o la credencial`).not.toContain(nueva);
      }
    });

    it('R32 — el archivo no contiene ningun secreto: toda variable esta vacia o es un marcador', () => {
      const conValor = [...envExample.matchAll(/^([A-Z0-9_]+)=(.+)$/gm)].map((m) => ({
        nombre: m[1] as string,
        valor: (m[2] as string).trim(),
      }));
      const sospechosas = conValor.filter(({ valor }) => !/USER:PASSWORD@HOST/.test(valor));
      expect(
        sospechosas.map(({ nombre }) => nombre),
        'variables con un valor que no es un marcador en .env.example',
      ).toEqual([]);
    });
  });

  describe('la libreria de Storage sigue aislada (R26)', () => {
    const fuentesDeProduccion = ARBOL_DE_PRODUCCION.flatMap((dir) => archivosDe(join(repoRoot, dir)));

    it('R26 — el barrido recorre de verdad el arbol de produccion', () => {
      expect(fuentesDeProduccion.length).toBeGreaterThan(100);
    });

    it('R26 — exactamente DOS archivos de produccion importan la libreria, y este modulo aporta el segundo', () => {
      const importadores = fuentesDeProduccion
        .filter((abs) => importaElPaquete(readFileSync(abs, 'utf8'), '@supabase/storage-js'))
        .map((abs) => toPosix(relative(repoRoot, abs)))
        .sort();

      expect(importadores).toEqual(IMPORTADORES_PERMITIDOS);
    });

    it('R26 — el detector dispara: un import de la libreria en otro archivo seria un hallazgo', () => {
      // Sin este caso, una expresion mal escrita dejaria el barrido en verde sobre cualquier cosa.
      expect(importaElPaquete("import { StorageClient } from '@supabase/storage-js';", '@supabase/storage-js')).toBe(
        true,
      );
      expect(importaElPaquete("// nombra @supabase/storage-js en un comentario", '@supabase/storage-js')).toBe(false);
    });

    it('R31 — el dominio y los puertos del modulo no ven la libreria', () => {
      const delModulo = archivosDe(join(repoRoot, 'lib', 'modules', 'documentos'))
        .map((abs) => toPosix(relative(repoRoot, abs)))
        .filter((ruta) => ruta.includes('/domain/') || ruta.includes('/ports/'));
      expect(delModulo.length).toBeGreaterThan(0);

      for (const ruta of delModulo) {
        const source = readFileSync(join(repoRoot, ruta), 'utf8');
        expect(importaElPaquete(source, '@supabase/storage-js'), `${ruta} importa la libreria`).toBe(false);
      }
    });
  });
});
