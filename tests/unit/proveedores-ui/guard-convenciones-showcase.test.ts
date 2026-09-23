import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { SUPPLIERS_ROUTE } from '@/lib/shared/routes';

/**
 * Guardia de convenciones del catalogo visual de proveedores.
 *
 * Cubre lo que ningun render puede ver: que `react-intersection-observer` siga aislada en un solo
 * archivo, que nadie escuche el desplazamiento a mano, que la URL de proveedores no se incruste
 * como literal, que los componentes de cliente de la vista no arrastren la composicion ni la base
 * de datos al navegador, y dos propiedades del DIFF de la rama: que no aparezca ningun archivo
 * bajo `db/` y que `components/shared/entity-image.tsx` no cambie (se reutiliza tal cual).
 */

const RAIZ = join(__dirname, '..', '..', '..');

const CARPETA_LISTA = join('app', '(private)', SUPPLIERS_ROUTE.replace(/^\//, ''));

const LIBRERIA_DE_INTERSECCION = 'react-intersection-observer';
const ARCHIVO_AUTORIZADO = join(CARPETA_LISTA, 'components', 'showcase-load-trigger.tsx');

/** Carpetas de codigo de PRODUCCION que se barren; `tests/` queda fuera a proposito. */
const CARPETAS_DE_PRODUCCION = ['app', 'components', 'lib'] as const;

function leer(rutaRelativa: string): string {
  return readFileSync(join(RAIZ, rutaRelativa), 'utf8');
}

function aPosix(ruta: string): string {
  return ruta.split('\\').join('/');
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

/** Todas las fuentes `.ts`/`.tsx` bajo `carpeta`, recursivo, en rutas relativas a la raiz. */
function fuentesBajo(carpeta: string): string[] {
  const encontradas: string[] = [];

  const recorrer = (directorio: string) => {
    for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
      const completa = join(directorio, entrada.name);
      if (entrada.isDirectory()) {
        if (entrada.name === 'node_modules' || entrada.name === '.next') continue;
        recorrer(completa);
        continue;
      }
      if (entrada.name.endsWith('.ts') || entrada.name.endsWith('.tsx')) {
        encontradas.push(aPosix(relative(RAIZ, completa)));
      }
    }
  };

  recorrer(join(RAIZ, carpeta));
  return encontradas.sort();
}

const FUENTES_DE_PRODUCCION = CARPETAS_DE_PRODUCCION.flatMap((carpeta) => fuentesBajo(carpeta));

const FUENTES_DE_LA_VISTA = fuentesBajo(CARPETA_LISTA);

const CLIENTES_DE_LA_VISTA = FUENTES_DE_LA_VISTA.filter((ruta) =>
  new RegExp(`^\\s*['"]use client['"]`, 'm').test(leer(ruta)),
);

function git(args: readonly string[]): string | null {
  try {
    return execFileSync('git', [...args], { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

/** El merge-base con `origin/dev`, o `null` si no se puede calcular (sin git, o sin esa rama). */
const MERGE_BASE = (() => {
  const salida = git(['merge-base', 'origin/dev', 'HEAD']);
  const sha = (salida ?? '').trim();
  return sha.length > 0 ? sha : null;
})();

describe('convenciones del catalogo visual de proveedores (QC-140)', () => {
  it('R18: react-intersection-observer solo la importa showcase-load-trigger.tsx', () => {
    const importadores = FUENTES_DE_PRODUCCION.filter((archivo) =>
      fuenteSinComentarios(archivo).includes(LIBRERIA_DE_INTERSECCION),
    );

    expect(importadores).toEqual([aPosix(ARCHIVO_AUTORIZADO)]);
  });

  it('D8: ningun archivo de la vista crea un IntersectionObserver a mano ni escucha el scroll', () => {
    const OBSERVADOR_A_MANO = /\bnew\s+IntersectionObserver\b/;
    const ESCUCHA_DE_SCROLL = /addEventListener\(\s*['"`]scroll['"`]/;

    const hallazgos: string[] = [];
    for (const archivo of FUENTES_DE_LA_VISTA) {
      const fuente = fuenteSinComentarios(archivo);
      if (OBSERVADOR_A_MANO.test(fuente)) hallazgos.push(`${archivo}: new IntersectionObserver`);
      if (ESCUCHA_DE_SCROLL.test(fuente)) hallazgos.push(`${archivo}: addEventListener('scroll')`);
    }

    expect(hallazgos).toEqual([]);
  });

  it('R1: la URL de proveedores no aparece como literal, ni entre comillas ni en plantilla', () => {
    // `lib/shared/routes.ts` es la UNICA fuente legitima del literal: es donde `SUPPLIERS_ROUTE` y
    // `supplierDetailRoute` lo declaran. Todo lo demas tiene que derivarse de esas dos.
    const RUTAS_COMPARTIDAS = 'lib/shared/routes.ts';
    const literales = [`'${SUPPLIERS_ROUTE}'`, `"${SUPPLIERS_ROUTE}"`, `\`${SUPPLIERS_ROUTE}\``];
    const enPlantilla = `\`${SUPPLIERS_ROUTE}`;

    const hallazgos: string[] = [];
    for (const archivo of FUENTES_DE_PRODUCCION.filter((ruta) => ruta !== RUTAS_COMPARTIDAS)) {
      const fuente = leer(archivo);
      for (const literal of literales) {
        if (fuente.includes(literal)) hallazgos.push(`${archivo} incrusta ${literal}`);
      }
      if (fuente.includes(enPlantilla)) hallazgos.push(`${archivo} incrusta ${SUPPLIERS_ROUTE} en una plantilla`);
    }

    expect(hallazgos).toEqual([]);
  });

  it('los componentes de cliente de la vista no importan lib/composition, @/lib/shared/db ni @prisma/client', () => {
    expect(CLIENTES_DE_LA_VISTA.length, 'la vista deberia tener componentes de cliente').toBeGreaterThan(0);

    const hallazgos: string[] = [];
    for (const archivo of CLIENTES_DE_LA_VISTA) {
      const fuente = fuenteSinComentarios(archivo);
      if (fuente.includes('@/lib/composition')) hallazgos.push(`${archivo} importa la composicion`);
      if (fuente.includes('@/lib/shared/db')) hallazgos.push(`${archivo} importa el cliente de base de datos`);
      if (fuente.includes('@prisma/client')) hallazgos.push(`${archivo} importa Prisma`);
    }

    expect(hallazgos).toEqual([]);
  });

  it('R29: el diff de la rama contra origin/dev no añade ningun archivo bajo db/', (ctx) => {
    if (MERGE_BASE === null) {
      ctx.skip('no se pudo calcular el merge-base con origin/dev: este caso NO ha comprobado nada.');
      return;
    }

    // Dos fuentes, como en `guard-convenciones-proveedores.test.ts`: los archivos ya COMMITEADOS
    // desde el merge-base (`git diff`) y los del ARBOL DE TRABAJO todavia sin commitear (`git
    // status --porcelain`). Un archivo nuevo sin `git add` no aparece en `git diff` -no tiene blob
    // que comparar-, y quedarse solo con `git diff` dejaria pasar justo ese caso.
    const salidaDiff = git(['diff', '--name-only', '--diff-filter=A', MERGE_BASE, '--', 'db/']);
    expect(salidaDiff, 'git no pudo calcular el diff de db/').not.toBeNull();

    const anadidos = new Set(
      (salidaDiff as string)
        .split('\n')
        .map((linea) => linea.trim())
        .filter((linea) => linea.length > 0),
    );

    const salidaEstado = git(['status', '--porcelain', '--', 'db/']);
    expect(salidaEstado, 'git no pudo leer el estado de db/').not.toBeNull();

    for (const linea of (salidaEstado as string).split('\n')) {
      if (linea.trim().length === 0) continue;
      const camino = linea.slice(3).trim();
      const destino = camino.includes(' -> ') ? camino.split(' -> ')[1] : camino;
      anadidos.add(aPosix(destino.replace(/^"|"$/g, '')));
    }

    expect([...anadidos].sort(), `la ficha anade archivos bajo db/: ${[...anadidos].join(', ')}`).toEqual([]);
  });

  it('D20: components/shared/entity-image.tsx no aparece en el diff de la rama', (ctx) => {
    if (MERGE_BASE === null) {
      ctx.skip('no se pudo calcular el merge-base con origin/dev: este caso NO ha comprobado nada.');
      return;
    }

    const ARCHIVO = 'components/shared/entity-image.tsx';
    const salida = git(['diff', '--name-only', MERGE_BASE, '--', ARCHIVO]);
    expect(salida, `git no pudo calcular el diff de ${ARCHIVO}`).not.toBeNull();

    const tocado = (salida as string).trim();
    expect(tocado, `la ficha toca ${ARCHIVO}, y D20 dice que se reutiliza tal cual`).toBe('');
  });
});
