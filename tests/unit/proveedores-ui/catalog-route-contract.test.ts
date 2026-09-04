import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { PRIVATE_ROUTE_PREFIXES, SUPPLIERS_ROUTE, supplierDetailRoute } from '@/lib/shared/routes';

/**
 * Contrato de la ruta de DETALLE del proveedor: R2, R3, R30, R40, R41, R42, R43, R46 y R49
 * (`specs/QC-44-pantalla-de-proveedores/tasks.md > T10-T14`).
 *
 * **Guardias de codigo, sin DOM**, mismo patron que `tests/unit/recetas-ui/
 * recipe-route-contract.test.ts`. Todo lo que esta ruta promete **no hacer** -no incrustar la URL,
 * no convertir importes a coma flotante, no capturarlos con un control numerico, no ofrecer el
 * alta de unidades, no atarse a los componentes internos de la ruta de lista, no llamar a rutas de
 * API propias- es invisible renderizando: si manana la pantalla empezase a hacer cualquiera de
 * esas cosas, ningun assert de DOM se pondria rojo. De ahi este archivo.
 *
 * **Alcance: la ruta de detalle** (`[id]/`). La ruta de lista tiene su propia guardia.
 */

const RAIZ = join(__dirname, '..', '..', '..');

/**
 * Carpeta de la ruta, **derivada del helper de detalle** (R3): `[id]` es el segmento dinamico que
 * impone el App Router, y el route group `(private)` no aporta segmento de URL. Si alguien moviera
 * la carpeta sin mover el helper -o al reves-, esto cae.
 */
const CARPETA_DETALLE = join('app', '(private)', supplierDetailRoute('[id]').replace(/^\//, ''));
const PAGE_PATH = join(CARPETA_DETALLE, 'page.tsx');
const COMPONENTES_PATH = join(CARPETA_DETALLE, 'components');
const BARREL_PATH = join(COMPONENTES_PATH, 'index.ts');

/** Archivos que el App Router puede tener en la raiz de una ruta. Todo lo demas va en `components/`. */
const ARCHIVOS_DEL_APP_ROUTER = new Set([
  'page.tsx',
  'layout.tsx',
  'loading.tsx',
  'error.tsx',
  'not-found.tsx',
  'template.tsx',
  'default.tsx',
]);

/** El literal de la ruta, en las tres comillas en las que se puede escribir. */
const LITERALES_PROHIBIDOS = [
  `'${SUPPLIERS_ROUTE}'`,
  `"${SUPPLIERS_ROUTE}"`,
  `\`${SUPPLIERS_ROUTE}`,
];

function leer(rutaRelativa: string): string {
  return readFileSync(join(RAIZ, rutaRelativa), 'utf8');
}

/** Fuente sin lineas de comentario: las guardias miran codigo, no prosa. */
function fuenteSinComentarios(rutaRelativa: string): string {
  return leer(rutaRelativa)
    .split('\n')
    .filter((linea) => {
      const limpia = linea.trim();
      return !(limpia.startsWith('//') || limpia.startsWith('*') || limpia.startsWith('/*'));
    })
    .join('\n');
}

/** Todos los archivos `.ts`/`.tsx` de la ruta de detalle, en rutas relativas a la raiz del repo. */
function fuentesDeLaRuta(): string[] {
  const encontradas: string[] = [];

  const recorrer = (directorio: string) => {
    for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
      const completa = join(directorio, entrada.name);
      if (entrada.isDirectory()) {
        recorrer(completa);
        continue;
      }
      if (entrada.name.endsWith('.ts') || entrada.name.endsWith('.tsx')) {
        encontradas.push(relative(RAIZ, completa).split('\\').join('/'));
      }
    }
  };

  recorrer(join(RAIZ, CARPETA_DETALLE));
  return encontradas.sort();
}

const FUENTES_DE_LA_RUTA = fuentesDeLaRuta();

/** Los que declaran frontera de cliente. R46 va sobre estos. */
const FUENTES_DE_CLIENTE = FUENTES_DE_LA_RUTA.filter((ruta) => leer(ruta).includes("'use client'"));

/** Los dos campos que R41 protege: viajan como cadena decimal de punta a punta. */
const CAMPOS_DE_IMPORTE = ['cost', 'minPurchase'] as const;

/** Lo que convertiria un importe a coma flotante o lo reformatearia. */
const CONVERSIONES_PROHIBIDAS = ['parseFloat(', 'Number(', 'toFixed(', 'Intl.NumberFormat'] as const;

describe('contrato de la ruta de detalle del proveedor', () => {
  it('la pagina de detalle existe donde dice el helper de ruta y esta cubierta por el prefijo', () => {
    // R3, R5 — la ruta esperada se DERIVA de `supplierDetailRoute`.
    expect(existsSync(join(RAIZ, PAGE_PATH)), `falta ${PAGE_PATH}`).toBe(true);
    expect(existsSync(join(RAIZ, BARREL_PATH)), `falta ${BARREL_PATH}`).toBe(true);

    // Un solo prefijo cubre lista y detalle: la comparacion del middleware es por segmentos.
    expect(PRIVATE_ROUTE_PREFIXES).toContain(SUPPLIERS_ROUTE);
    expect(supplierDetailRoute('abc').startsWith(`${SUPPLIERS_ROUTE}/`)).toBe(true);
  });

  it('ningun archivo de la ruta incrusta la URL como literal', () => {
    // R2, R3 — la unica aparicion legitima de la URL como texto es el nombre de la carpeta, que
    // impone el framework. Todo lo demas se deriva de la constante y del helper.
    for (const archivo of FUENTES_DE_LA_RUTA) {
      const fuente = leer(archivo);
      for (const literal of LITERALES_PROHIBIDOS) {
        expect(fuente, `${archivo} incrusta ${literal}`).not.toContain(literal);
      }
    }
  });

  it('los componentes viven en components/ y la pagina los importa por el barrel', () => {
    // R42 — ni componentes sueltos junto a `page.tsx`, ni importes por ruta profunda.
    const enLaRaiz = readdirSync(join(RAIZ, CARPETA_DETALLE), { withFileTypes: true })
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

  it('la ruta de detalle no se ata a los componentes internos de la ruta de lista', () => {
    // `design.md > 6.1` — el parser de paginacion y el estado de error son PROPIOS de esta ruta.
    // Importar los de la otra ataria dos rutas por sus tripas, que es justo lo que el barrel por
    // ruta existe para impedir.
    for (const archivo of FUENTES_DE_LA_RUTA) {
      expect(fuenteSinComentarios(archivo), `${archivo} importa de la ruta de lista`).not.toMatch(
        /from '\.\.\/components/,
      );
      expect(fuenteSinComentarios(archivo), `${archivo} importa de la ruta de lista`).not.toMatch(
        /from '@\/app\/\(private\)\/proveedores\/components/,
      );
    }
  });

  it('la pagina no declara un landmark principal propio ni llama a rutas de API propias', () => {
    // R1 — `SidebarInset` del layout privado ya es el `main` y tiene que seguir siendo unico.
    // R43 — toda lectura y toda mutacion pasan por Server Actions.
    for (const archivo of FUENTES_DE_LA_RUTA) {
      const fuente = leer(archivo);
      expect(fuente, `${archivo} declara un landmark principal propio`).not.toMatch(/<main[\s>]/);
      expect(fuente, `${archivo} llama a una ruta de API propia`).not.toMatch(/fetch\(\s*['"`]\//);
    }
  });

  it('ningun componente de cliente importa la composicion ni el cliente de base de datos', () => {
    // R46, R49 — los datos de negocio bajan por props o llegan por Server Action; un componente de
    // cliente que importe `lib/composition` arrastraria Prisma al navegador.
    expect(FUENTES_DE_CLIENTE.length, 'la ruta deberia tener componentes de cliente').toBeGreaterThan(0);

    for (const archivo of FUENTES_DE_CLIENTE) {
      const fuente = fuenteSinComentarios(archivo);
      expect(fuente, `${archivo} importa la composicion`).not.toContain("@/lib/composition");
      expect(fuente, `${archivo} importa el cliente de base de datos`).not.toContain('@/lib/shared/db');
      expect(fuente, `${archivo} importa Prisma`).not.toContain('@prisma/client');
    }
  });

  it('el costo y el minimo de compra no pasan por coma flotante en ningun archivo', () => {
    // R41, `design.md > 9` — la cadena decimal se pinta y se envia TAL CUAL. La guardia mira los
    // archivos que hablan de esos dos campos: son los unicos que podrian convertirlos.
    const archivosDeImporte = FUENTES_DE_LA_RUTA.filter((archivo) =>
      CAMPOS_DE_IMPORTE.some((campo) => fuenteSinComentarios(archivo).includes(campo)),
    );

    expect(archivosDeImporte.length, 'ningun archivo pinta los importes').toBeGreaterThan(0);

    for (const archivo of archivosDeImporte) {
      const fuente = fuenteSinComentarios(archivo);
      for (const conversion of CONVERSIONES_PROHIBIDAS) {
        expect(fuente, `${archivo} convierte un importe con ${conversion}`).not.toContain(
          conversion,
        );
      }
    }
  });

  it('ningun control de costo o de minimo de compra es un input numerico del navegador', () => {
    // R41 — el valor de un `type="number"` pasa por el binario de coma flotante. `deliveryTime` SI
    // es entero y ahi el control numerico es correcto, asi que la guardia mira el bloque de cada
    // elemento y no el archivo entero.
    for (const archivo of FUENTES_DE_LA_RUTA) {
      const bloques = fuenteSinComentarios(archivo).split('<').slice(1);
      for (const bloque of bloques) {
        const elemento = bloque.split('>')[0];
        const esDeImporte = CAMPOS_DE_IMPORTE.some(
          (campo) =>
            elemento.includes(`name="${campo}"`) ||
            elemento.includes(`data-testid="catalog-field-${campo}"`),
        );
        if (!esDeImporte) continue;
        expect(elemento, `${archivo} captura un importe con un control numerico`).not.toContain(
          'type="number"',
        );
      }
    }
  });

  it('el selector de unidad no importa ninguna operacion de alta de unidad', () => {
    // R40 en negativo — el alta de unidades es QC-38 y su pantalla QC-39. El componente solo
    // recibe unidades por props: no importa NINGUN adaptador driving de `unidades`.
    const fuente = fuenteSinComentarios(join(COMPONENTES_PATH, 'unit-select.tsx'));

    expect(fuente).not.toMatch(/@\/lib\/modules\/unidades\/adapters/);
    expect(fuente).not.toContain('createUnit');
    expect(fuente).not.toContain('Action(');
    // Lo unico que importa de `unidades` es el TIPO de la referencia de unidad.
    expect(fuente).toContain("import type { UnitRef } from '@/lib/modules/unidades'");
  });

  it('la tabla del catalogo no pinta ninguna imagen de la linea', () => {
    // R30 en negativo — la columna existe en la base desde QC-52 y nadie la llena (`P1`).
    for (const archivo of FUENTES_DE_LA_RUTA) {
      const fuente = fuenteSinComentarios(archivo);
      expect(fuente, `${archivo} pinta una imagen`).not.toMatch(/<img[\s>]/);
      expect(fuente, `${archivo} pinta una imagen`).not.toMatch(/<Image[\s>]/);
      expect(fuente, `${archivo} importa el componente de imagen`).not.toContain("from 'next/image'");
    }
  });

  it('ningun archivo de la ruta toca los modulos, la base de datos ni la composicion', () => {
    // R49 — los modulos se consumen SOLO por su contrato publico y por sus adaptadores driving.
    for (const archivo of FUENTES_DE_LA_RUTA) {
      const fuente = fuenteSinComentarios(archivo);
      const importesDeModulo = [...fuente.matchAll(/from '(@\/lib\/modules\/[^']+)'/g)].map(
        (encontrado) => encontrado[1],
      );

      for (const importado of importesDeModulo) {
        const esContratoPublico = /^@\/lib\/modules\/[a-z-]+$/.test(importado);
        const esAdaptadorDriving = importado.includes('/adapters/driving/');
        expect(
          esContratoPublico || esAdaptadorDriving,
          `${archivo} importa ${importado}, que no es contrato publico ni adaptador driving`,
        ).toBe(true);
      }

      expect(fuente, `${archivo} importa la base de datos`).not.toContain('@/db');
    }
  });
});
