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
 * de datos al navegador, y dos propiedades de lo que TOCAN LOS COMMITS DE QC-140 -no el diff de
 * la rama que corre esta guardia, que puede traer trabajo de otra ficha-: que no aparezca ningun
 * archivo bajo `db/` y que `components/shared/entity-image.tsx` no cambie (se reutiliza tal cual).
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

/** Marca con la que QC-140 firma sus commits (`fix(QC-140): ...`, `test(QC-140): ...`, ...). */
const MARCA_DE_LA_FEATURE = 'QC-140';

/**
 * Archivos que TOCAN los commits DE QC-140 dentro de `origin/dev..HEAD`, mas los del arbol de
 * trabajo. `null` cuando no hay ninguno: QC-140 ya esta fusionada en `origin/dev` -su merge
 * (PR #118) borra sus commits del rango de cualquier rama que arranque despues, esta incluida- o
 * la rama no tiene relacion con `origin/dev`.
 *
 * Antes, R29 y D20 miraban el diff COMPLETO de `origin/dev..HEAD` contra la base de fusion: eso
 * confunde «lo que trajo QC-140» con «lo que trae la rama que corre la guardia». Una rama con sus
 * propias migraciones -como esta- pone en rojo un caso que protege el alcance de OTRA ficha, ya
 * cerrada, sin que QC-140 haya tocado nada. Filtrar por `--grep` en vez de por el rango entero es
 * el mismo criterio que ya usa `archivosTocadosPorLaFeature` de
 * `guard-convenciones-proveedores.test.ts` para el mismo problema.
 */
function archivosDeQC140(): readonly string[] | null {
  const salidaLog = git(['log', '--no-merges', '--format=%H', `--grep=${MARCA_DE_LA_FEATURE}`, 'origin/dev..HEAD']);
  if (salidaLog === null) return null;
  const commits = salidaLog
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => linea.length > 0);
  if (commits.length === 0) return null;

  const tocados = new Set<string>();
  const salidaShow = git(['show', '--pretty=format:', '--name-only', ...commits]);
  for (const ruta of (salidaShow ?? '').split('\n')) {
    const limpia = ruta.trim();
    if (limpia.length > 0) tocados.add(aPosix(limpia));
  }

  // El arbol de trabajo cuenta: un cambio de QC-140 sin commitear no deja de ser suyo. Solo se
  // llega aqui cuando el rango YA tiene commits con la marca -la unica senal disponible de que
  // esta corrida es la rama de QC-140-, asi que sumar lo sin commitear no le atribuye a QC-140
  // el trabajo sin commitear de otra ficha que comparta el arbol.
  const salidaEstado = git(['status', '--porcelain']);
  for (const linea of (salidaEstado ?? '').split('\n')) {
    if (linea.trim().length === 0) continue;
    const camino = linea.slice(3).trim();
    const destino = camino.includes(' -> ') ? camino.split(' -> ')[1] : camino;
    tocados.add(aPosix(destino.replace(/^"|"$/g, '')));
  }

  return [...tocados].sort();
}

/** Los archivos de QC-140, o `null` con un `ctx.skip()` en voz alta si no hay nada que mirar. */
function archivosDeQC140OMudo(ctx: Pick<import('vitest').TestContext, 'skip'>): readonly string[] | null {
  const tocados = archivosDeQC140();
  if (tocados === null) {
    ctx.skip(
      `origin/dev..HEAD no tiene ningun commit de ${MARCA_DE_LA_FEATURE} (ya fusionada en dev, o ` +
        'esta rama no tiene relacion con ella): este caso NO ha comprobado nada.',
    );
    return null;
  }
  return tocados;
}

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

  it('R29: los commits de QC-140 en el rango no tocan ningun archivo bajo db/', (ctx) => {
    const tocados = archivosDeQC140OMudo(ctx);
    if (tocados === null) return;

    const bajoDb = tocados.filter((ruta) => ruta.startsWith('db/'));
    expect(bajoDb, `QC-140 toca archivos bajo db/: ${bajoDb.join(', ')}`).toEqual([]);
  });

  it('D20: QC-140 no toca components/shared/entity-image.tsx', (ctx) => {
    const tocados = archivosDeQC140OMudo(ctx);
    if (tocados === null) return;

    const ARCHIVO = 'components/shared/entity-image.tsx';
    expect(
      tocados.includes(ARCHIVO),
      `QC-140 toca ${ARCHIVO}, y D20 dice que se reutiliza tal cual`,
    ).toBe(false);
  });
});
