// Limites de alcance de QC-171: el bucket de recortes sigue siendo uno solo, nada se mueve ni se
// copia, ninguna migracion nueva toca `image_path`, el resto del almacenamiento no cambia y no
// entra ninguna dependencia nueva.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

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

function toPosix(ruta: string): string {
  return ruta.split(sep).join('/');
}

function enDisco(rutaRelativa: string): string {
  return readFileSync(join(repoRoot, rutaRelativa), 'utf8');
}

function archivosDe(absDir: string): readonly string[] {
  const salida: string[] = [];
  const recorrer = (dir: string) => {
    for (const nombre of readdirSync(dir)) {
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else salida.push(ruta);
    }
  };
  recorrer(absDir);
  return salida;
}

// -------------------------------------------------------------------------------------------
// R18 — un unico bucket de recortes, sin mover ni copiar, sin migracion nueva sobre image_path
// -------------------------------------------------------------------------------------------

describe('QC-171 R18 — un unico bucket de recortes, el actual, sin mover ni copiar nada', () => {
  const ARBOL_DE_PRODUCCION = ['lib', 'app', 'components', 'hooks', 'scripts'];

  it('R18 — el unico nombre de bucket de recortes en produccion es SUPABASE_CROPS_BUCKET', () => {
    const fuentesDeProduccion = ARBOL_DE_PRODUCCION.flatMap((dir) => archivosDe(join(repoRoot, dir)))
      .filter((abs) => /\.(ts|tsx)$/.test(abs));
    expect(fuentesDeProduccion.length).toBeGreaterThan(100);

    const nombresDeBucketDeRecortes = new Set<string>();
    for (const abs of fuentesDeProduccion) {
      const fuente = readFileSync(abs, 'utf8');
      for (const coincidencia of fuente.matchAll(/SUPABASE_[A-Z0-9_]*CROPS?[A-Z0-9_]*BUCKET/g)) {
        nombresDeBucketDeRecortes.add(coincidencia[0]);
      }
    }

    expect([...nombresDeBucketDeRecortes].sort()).toEqual(['SUPABASE_CROPS_BUCKET']);
  });

  it('R18 — ningun adaptador de recortes llama a move ni a copy', () => {
    const ADAPTADORES = [
      'lib/modules/documentos/adapters/driven/storage/crop-storage-supabase.ts',
      'lib/modules/documentos/adapters/driven/storage/crop-catalog-supabase.ts',
      'lib/modules/documentos/adapters/driven/storage/crop-catalog-memory.ts',
      'lib/modules/documentos/adapters/driven/storage/crop-storage-memory.ts',
    ];
    for (const ruta of ADAPTADORES) {
      const fuente = enDisco(ruta);
      expect(fuente, `${ruta}: llama a .move(`).not.toMatch(/\.move\(/);
      expect(fuente, `${ruta}: llama a .copy(`).not.toMatch(/\.copy\(/);
    }
  });

  it('R18 — la lista de migraciones que tocan image_path no crece: ninguna migracion nueva la toca', () => {
    // Las cinco de siempre, de antes de esta ficha (recetas, la columna de products y el reparto
    // entre products y el catalogo del proveedor). Esta ficha no anade tabla, columna ni migracion.
    const MIGRACIONES_CONOCIDAS = [
      'db/migrations/20260902163256_recipes_and_recipe_lines/migration.sql',
      'db/migrations/20260903200000_product_image_path/down.sql',
      'db/migrations/20260903200000_product_image_path/migration.sql',
      'db/migrations/20260904123854_split_product_and_supplier_catalog/down.sql',
      'db/migrations/20260904123854_split_product_and_supplier_catalog/migration.sql',
    ].sort();

    const migraciones = archivosDe(join(repoRoot, 'db', 'migrations'))
      .filter((abs) => readFileSync(abs, 'utf8').includes('image_path'))
      .map((abs) => toPosix(relative(repoRoot, abs)))
      .sort();

    expect(migraciones).toEqual(MIGRACIONES_CONOCIDAS);
  });
});

// -------------------------------------------------------------------------------------------
// R20 — el resto del almacenamiento no cambia
// -------------------------------------------------------------------------------------------

describe('QC-171 R20 — los PDF, las recetas y products no cambian de forma de leerse', () => {
  it('R20 — document-storage-supabase.ts sigue usando createSignedUrl para los PDF', () => {
    const fuente = enDisco('lib/modules/documentos/adapters/driven/storage/document-storage-supabase.ts');
    expect(fuente).toMatch(/\.createSignedUrl\(/);
    expect(fuente).not.toMatch(/getPublicUrl/);
  });

  it('R20 — recipe-image-supabase.ts no nombra la operacion de los recortes', () => {
    const fuente = enDisco('lib/modules/recetas/adapters/driven/storage/recipe-image-supabase.ts');
    expect(fuente).not.toMatch(/cropPublicUrl/);
  });

  it('R20 — la lectura de products sigue devolviendo la ruta, sin componer ninguna URL de recorte', () => {
    for (const ruta of [
      'lib/modules/inventario/adapters/driven/persistence/product-prisma.ts',
      'lib/modules/inventario/domain/product-view.ts',
    ]) {
      const fuente = enDisco(ruta);
      expect(fuente).not.toMatch(/cropPublicUrl|getPublicUrl/);
    }
  });
});

// -------------------------------------------------------------------------------------------
// R21 — ninguna dependencia nueva
// -------------------------------------------------------------------------------------------

describe('QC-171 R21 — sin dependencias nuevas frente a docs/dependencias.md', () => {
  function dependenciasDeclaradas(): string[] {
    const pkg = JSON.parse(enDisco('package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})].sort();
  }

  function paquetesRegistrados(): Set<string> {
    const md = enDisco('docs/dependencias.md');
    const registrados = new Set<string>();
    for (const linea of md.split('\n')) {
      const fila = linea.trim();
      if (!fila.startsWith('|')) continue;
      const primeraCelda = fila.split('|')[1]?.trim() ?? '';
      const match = /^`([^`]+)`$/.exec(primeraCelda);
      if (match) registrados.add(match[1]);
    }
    return registrados;
  }

  it('R21 — toda dependencia de package.json tiene su fila aprobada en docs/dependencias.md', () => {
    const registrados = paquetesRegistrados();
    const sinAprobar = dependenciasDeclaradas().filter((nombre) => !registrados.has(nombre));

    expect(sinAprobar).toEqual([]);
  });

  it('R21 — la composicion de la URL usa la libreria ya aprobada, sin nombrar ninguna otra', () => {
    const fuente = enDisco('lib/modules/documentos/adapters/driven/storage/crop-catalog-supabase.ts');
    expect(fuente).toMatch(/@supabase\/storage-js/);
  });
});
