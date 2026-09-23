import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { PRIVATE_ROUTE_PREFIXES, SUPPLIERS_ROUTE } from '@/lib/shared/routes';

/**
 * Contrato de la ruta de la lista de proveedores: R1, R2, R42 y R43
 * (`specs/QC-44-pantalla-de-proveedores/tasks.md > T4`).
 *
 * **Guardias de codigo, sin DOM**, mismo patron que `tests/unit/inventario/product-route-contract.test.ts`.
 * Lo que esta pantalla promete **no hacer** —no incrustar la URL, no importar por ruta profunda,
 * no dejar componentes sueltos junto a `page.tsx`, no declarar un landmark principal propio, no
 * llamar a rutas de API propias— es invisible renderizando: si manana la pantalla empezase a
 * hacer cualquiera de esas cosas, ningun assert de DOM se pondria rojo. De ahi este archivo.
 *
 * **Alcance: la ruta de LISTA.** El detalle (`[id]/`) lo construye otra task y la guardia de
 * convencion completa de las dos rutas es T17; este archivo no la adelanta ni pisa esos archivos.
 */

const RAIZ = join(__dirname, '..', '..', '..');

/**
 * Carpeta de la ruta, **derivada de la constante** (R2). El App Router es el unico que exige que
 * el nombre de la carpeta coincida con la URL; el route group `(private)` no aporta segmento.
 */
const CARPETA_RUTA = join('app', '(private)', SUPPLIERS_ROUTE.replace(/^\//, ''));
const PAGE_PATH = join(CARPETA_RUTA, 'page.tsx');
const COMPONENTES_PATH = join(CARPETA_RUTA, 'components');
const BARREL_PATH = join(COMPONENTES_PATH, 'index.ts');

/** El literal de la ruta, en las dos comillas en las que se puede escribir. */
const LITERALES_PROHIBIDOS = [`'${SUPPLIERS_ROUTE}'`, `"${SUPPLIERS_ROUTE}"`];

/** Archivos del App Router que SI pueden vivir en la raiz de la ruta (R42). */
const ARCHIVOS_DEL_APP_ROUTER = new Set([
  'page.tsx',
  'layout.tsx',
  'loading.tsx',
  'error.tsx',
  'not-found.tsx',
  'template.tsx',
  'route.ts',
]);

function leer(relPath: string): string {
  return readFileSync(join(RAIZ, relPath), 'utf8');
}

/** Los archivos de la ruta de LISTA: `page.tsx` y todo lo de su `components/`. */
function archivosDeLaLista(): readonly string[] {
  const componentes = readdirSync(join(RAIZ, COMPONENTES_PATH), { withFileTypes: true })
    .filter((entrada) => entrada.isFile() && /\.tsx?$/.test(entrada.name))
    .map((entrada) => join(COMPONENTES_PATH, entrada.name));

  return [PAGE_PATH, ...componentes];
}

describe('contrato de la ruta de proveedores', () => {
  it('la pantalla existe exactamente donde dice la constante de ruta', () => {
    // R1, R2 — la ruta esperada se DERIVA de `SUPPLIERS_ROUTE`: si alguien moviera la carpeta
    // sin mover la constante (o al reves), esto cae. La pagina vive bajo el route group privado.
    expect(existsSync(join(RAIZ, PAGE_PATH)), `falta ${PAGE_PATH}`).toBe(true);
    expect(existsSync(join(RAIZ, BARREL_PATH)), `falta ${BARREL_PATH}`).toBe(true);

    // Y esa URL esta cubierta por la lista de prefijos privados (R5): sin ella, `(private)` no
    // aparece en la URL y la pantalla se serviria sin sesion.
    expect(PRIVATE_ROUTE_PREFIXES).toContain(SUPPLIERS_ROUTE);
  });

  it('ningun archivo de la ruta incrusta la URL como literal', () => {
    // R2 — la unica aparicion legitima de `/proveedores` como texto es el nombre de la carpeta,
    // que impone el framework. Todo lo demas se deriva de la constante.
    for (const archivo of archivosDeLaLista()) {
      const fuente = leer(archivo);
      for (const literal of LITERALES_PROHIBIDOS) {
        expect(fuente, `${archivo} incrusta ${literal}`).not.toContain(literal);
      }
    }
  });

  it('los componentes de la ruta viven en components/ y la pagina los importa por el barrel', () => {
    // R42 — ni componentes sueltos junto a `page.tsx`, ni importes por ruta profunda.
    const enLaRaiz = readdirSync(join(RAIZ, CARPETA_RUTA), { withFileTypes: true })
      .filter((entrada) => entrada.isFile())
      .map((entrada) => entrada.name)
      .filter((nombre) => !ARCHIVOS_DEL_APP_ROUTER.has(nombre));

    expect(enLaRaiz, `componentes sueltos junto a page.tsx: ${enLaRaiz.join(', ')}`).toEqual([]);

    const pagina = leer(PAGE_PATH);
    expect(pagina).toContain("from './components'");
    expect(pagina, 'la pagina importa por ruta profunda').not.toMatch(/from '\.\/components\/[^']+'/);

    // El barrel NO declara `'use client'`: la frontera la declara cada componente, y convertir el
    // barrel en frontera arrastraria al cliente toda la ruta
    // (`docs/architecture.md > Componentes`).
    expect(leer(BARREL_PATH)).not.toMatch(/^\s*['"]use client['"]/m);
  });

  it('la pagina no declara un landmark principal propio ni llama a rutas de API propias', () => {
    // R1 — `SidebarInset` del layout privado ya es el `main` y tiene que seguir siendo unico; el
    // render lo comprueba en el DOM, aqui se vigila la fuente.
    // R43 — toda lectura y toda mutacion pasan por Server Actions: ni `fetch('/api/...')` ni una
    // ruta propia creada al efecto.
    for (const archivo of archivosDeLaLista()) {
      const fuente = leer(archivo);
      expect(fuente, `${archivo} declara un landmark principal propio`).not.toMatch(/<main[\s>]/);
      expect(fuente, `${archivo} llama a una ruta de API propia`).not.toMatch(
        /fetch\(\s*['"`]\/api/,
      );
    }
  });

  it('R30 (QC-140, 2026-09-23): la lista ya no monta la tabla compartida ni paginacion propia, y conserva su vacio, su error y su esqueleto', () => {
    // QC-140 sustituye la lista paginada de QC-44 (D2 de su requirements.md) por el catalogo
    // visual: cada fila es un proveedor con su carrusel de lineas, sin tabla, sin controles de
    // pagina y sin orden por columnas (R2). Este caso se reescribe para esa forma nueva en vez
    // de seguir exigiendo `DataTable`, que la lista ya no usa.
    const nombres = readdirSync(join(RAIZ, COMPONENTES_PATH));

    for (const borrado of [
      'supplier-table.tsx',
      'supplier-table-skeleton.tsx',
      'supplier-columns.tsx',
      'supplier-columns-skeleton.ts',
      'supplier-list-section.tsx',
      'supplier-list-params.ts',
      'supplier-list-toolbar.tsx',
    ]) {
      expect(nombres, `${COMPONENTES_PATH} no deberia tener ${borrado}`).not.toContain(borrado);
    }
    expect(
      nombres.filter((nombre) => /toolbar|pagination/i.test(nombre)),
      'la lista ya no tiene barra ni paginacion, propias ni compartidas',
    ).toEqual([]);

    // El filtro (`supplier-showcase-filters.tsx`) reutiliza legitimamente `SEARCH_DEBOUNCE_MS` del
    // paquete de la tabla compartida (mismo rebote que su busqueda global); lo que R2 prohibe es
    // el COMPONENTE de tabla, no cualquier import de ese paquete.
    const montaComponenteDeTabla = /\bDataTable\b/;
    const importaTablaPrimitiva = /from\s*['"]@\/components\/ui\/table['"]/;
    for (const archivo of archivosDeLaLista()) {
      const fuente = leer(archivo);
      expect(fuente, `${archivo} monta el componente DataTable de QC-44`).not.toMatch(montaComponenteDeTabla);
      expect(fuente, `${archivo} monta la tabla primitiva`).not.toMatch(importaTablaPrimitiva);
    }

    for (const conservado of [
      join(COMPONENTES_PATH, 'supplier-list-empty.tsx'),
      join(COMPONENTES_PATH, 'supplier-list-error.tsx'),
      join(COMPONENTES_PATH, 'supplier-showcase-skeleton.tsx'),
      join(COMPONENTES_PATH, 'supplier-showcase-list.tsx'),
      join(COMPONENTES_PATH, 'supplier-showcase-section.tsx'),
    ]) {
      expect(existsSync(join(RAIZ, conservado)), `falta ${conservado}`).toBe(true);
    }
  });
});
