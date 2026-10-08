// T8 (QC-75) — Guardia: ninguna pantalla bajo `app/(private)/` se sirve sin exigir permiso (R20).
//
// QC-75 movio el corte de la zona privada del middleware —que cortaba por NOMBRE DE ROL y se
// retira en la tanda 4 (R16)— a cada `page.tsx`, que abre con
// `await requirePagePermission('<modulo>.consultar')` (R6). Ese diseno tiene una virtud y un
// agujero. La virtud: el corte esta donde se sirve la pantalla, no en una lista paralela que se
// desincroniza. El agujero: es una CONVENCION, y una pantalla nueva que se olvide de la linea
// compila, pasa el lint, renderiza perfecto y queda ABIERTA a cualquiera con sesion, sin que nada
// se ponga rojo. Esta guardia es la unica red para ese caso.
//
// Mismo patron que `tests/guards/guard-rutas-privadas-cubiertas.test.ts` —su hermana: aquella ata
// «toda pantalla privada exige SESION», esta ata «toda pantalla privada exige PERMISO»—:
// `findRepoRoot`, barrido del arbol real, funciones puras exportadas, casos sinteticos que
// demuestran que la regla dispara Y el simetrico que no la viola, y un ancla anti-vacuidad.
//
// Lo que esta guardia NO cubre, dicho para que nadie lo suponga: que el permiso exigido sea *el
// correcto* para esa pantalla (que `/pedidos` pida `pedidos.consultar` y no `dashboard.consultar`).
// Eso no es analizable por texto sin duplicar la tabla de `design.md > 2.2`; lo cubre
// `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`, caso por pagina. Aqui se comprueba lo
// que si es analizable y es lo que se olvida: que la llamada EXISTE y que su codigo pertenece al
// catalogo.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from '@/lib/modules/identity';

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

/** Raiz del arbol privado: toda pantalla que cuelga de aqui exige permiso (R6). */
const PRIVATE_ROOT = join('app', '(private)');

/**
 * Carpetas que no producen URL y no se recorren: `components/` es la convencion de este repo para
 * colocar los componentes propios junto a la pantalla que los usa, no una ruta.
 */
const NON_ROUTE_DIRS = new Set(['components']);

/**
 * Los codigos validos salen del CATALOGO, importado (R20). Nunca escritos a mano aqui: una lista
 * copiada al lado del catalogo es exactamente la desincronizacion que estas guardias existen para
 * impedir, y ademas dejaria pasar en verde un codigo que el catalogo ya no tiene.
 */
const CODIGOS_VALIDOS: ReadonlySet<string> = new Set(PERMISSIONS.map((permiso) => permiso.code));

/**
 * Los comentarios explican; no ejecutan. Se quitan antes de juzgar el codigo — si no, el JSDoc de
 * cualquiera de las nueve paginas, que documenta por que el corte vive ahi y NOMBRA
 * `requirePagePermission` y su codigo, bastaria para dar la guardia por satisfecha sin que la
 * llamada existiera.
 *
 * **El orden importa: los de LINEA primero, los de BLOQUE despues.** Al reves, un comentario de
 * linea que contenga una apertura de bloque abre un bloque FALSO que se cierra en el siguiente
 * cierre de bloque del archivo (tipicamente el proximo JSDoc) y se traga todo lo que haya en
 * medio, la llamada incluida. El caso real esta documentado en `guard-firma-sesion-unica.test.ts`
 * y repetido en `guard-autorizacion-por-permiso.test.ts`, de donde se copia esta funcion tal cual.
 * Aqui el sentido del fallo se invierte —tragarse codigo daria FALSOS POSITIVOS, no falsos
 * negativos—, pero el remedio es el mismo y el caso «no se ciega...» de mas abajo lo vigila.
 */
export function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** Un segmento entre parentesis es un route group: organiza carpetas y no aparece en la URL. */
export function isRouteGroup(segment: string): boolean {
  return segment.startsWith('(') && segment.endsWith(')');
}

/** URL de una carpeta con `page.tsx`, a partir de sus segmentos relativos a `app/(private)/`. */
export function routeFromSegments(segments: readonly string[]): string {
  const utiles = segments.filter((segment) => !isRouteGroup(segment));
  return utiles.length === 0 ? '/' : `/${utiles.join('/')}`;
}

function listDirectories(dir: string): readonly string[] {
  let names: readonly string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((name) => statSync(join(dir, name)).isDirectory());
}

function hasPage(dir: string): boolean {
  try {
    statSync(join(dir, 'page.tsx'));
    return true;
  } catch {
    return false;
  }
}

/** Una pantalla del arbol real: su URL, su ruta de archivo legible y su fuente. */
export type PantallaPrivada = {
  /** URL que sirve, con los route groups descartados. */
  readonly route: string;
  /** Camino relativo al repo, con `/`, para poder nombrarlo en el mensaje de fallo. */
  readonly file: string;
  readonly source: string;
};

/**
 * Todas las pantallas (`page.tsx`) que cuelgan de `app/(private)/`, ignorando `components/` y los
 * route groups. Hoy son NUEVE: las ocho de `design.md > 2.2` mas
 * `/configuracion/presentaciones`, que anade QC-45 y que exige `inventario.modificar`.
 */
export function listPrivatePages(root: string): readonly PantallaPrivada[] {
  function walk(dir: string, segments: readonly string[]): readonly PantallaPrivada[] {
    const propias: readonly PantallaPrivada[] = hasPage(dir)
      ? [
          {
            route: routeFromSegments(segments),
            file: [PRIVATE_ROOT, ...segments, 'page.tsx'].join('/').split(sep).join('/'),
            source: readFileSync(join(dir, 'page.tsx'), 'utf8'),
          },
        ]
      : [];
    const hijas = listDirectories(dir)
      .filter((name) => !NON_ROUTE_DIRS.has(name))
      .flatMap((name) => walk(join(dir, name), [...segments, name]));
    return [...propias, ...hijas];
  }

  return [...walk(join(root, PRIVATE_ROOT), [])].sort((a, b) => a.route.localeCompare(b.route));
}

/**
 * Los codigos que una fuente exige con `requirePagePermission('...')`, ya sin comentarios. Acepta
 * comilla simple, doble y plantilla sin interpolar: las tres compilan y el formateador del repo
 * podria cambiar de una a otra.
 */
export function extractRequiredPermissions(sourceSinComentarios: string): readonly string[] {
  const patron = /requirePagePermission\(\s*(['"`])([^'"`]*)\1\s*\)/g;
  return [...sourceSinComentarios.matchAll(patron)].map((match) => match[2] ?? '');
}

/** Las dos formas de incumplir la regla, distinguibles a proposito: se arreglan distinto. */
export type Infraccion =
  | { readonly clase: 'sin-llamada'; readonly file: string }
  | { readonly clase: 'codigo-fuera-del-catalogo'; readonly file: string; readonly code: string };

/**
 * Juzga una pantalla: sin llamada es un agujero abierto; con un codigo que el catalogo no tiene es
 * un 404 permanente y silencioso (nadie lleva ese permiso, asi que nadie entra nunca).
 */
export function findInfracciones(
  pantallas: readonly { readonly file: string; readonly source: string }[],
  codigosValidos: ReadonlySet<string>,
): readonly Infraccion[] {
  return pantallas.flatMap((pantalla): readonly Infraccion[] => {
    const codigos = extractRequiredPermissions(stripComments(pantalla.source));
    if (codigos.length === 0) return [{ clase: 'sin-llamada', file: pantalla.file }];
    return codigos
      .filter((code) => !codigosValidos.has(code))
      .map((code) => ({ clase: 'codigo-fuera-del-catalogo', file: pantalla.file, code }) as const);
  });
}

function describir(infracciones: readonly Infraccion[]): string {
  return infracciones
    .map((infraccion) =>
      infraccion.clase === 'sin-llamada'
        ? `${infraccion.file}: NO llama a requirePagePermission — la pantalla se sirve a cualquiera con sesion (R6, R20)`
        : `${infraccion.file}: exige '${infraccion.code}', que no esta en PERMISSIONS — nadie lo tiene, asi que la pantalla da 404 siempre`,
    )
    .join('; ');
}

/**
 * Las diez pantallas privadas de hoy, escritas por su URL. Es el ANCLA ANTI-VACUIDAD: si el
 * barrido se rompiera —ruta de `app/(private)` cambiada, `sep` de Windows, un `readdirSync` que
 * falla en silencio— la lista se vaciaria y esta guardia pasaria en verde sin haber mirado un solo
 * archivo. Que haya que tocarla al anadir una pantalla es el precio, y es barato: obliga a mirar
 * esta guardia justo cuando hay una pantalla nueva que proteger.
 */
// AMPLIADA el 2026-09-08 (QC-45 T1, ronda 2): las ocho de `design.md > 2.2` mas
// `/configuracion/presentaciones`, la pantalla del catalogo de presentaciones, que exige
// `inventario.modificar` —administrar el catalogo es modificar inventario— y no `consultar`.
//
// TENSADA el 2026-09-08 (QC-39 T3): de nueve a DIEZ, con `/configuracion/unidades`, la pantalla
// del catalogo de unidades de medida. Es la unica que llama a `requirePagePermission` DOS veces
// —`unidades.consultar` y `unidades.modificar` (QC-39 R12)—, y el barrido de abajo la valida igual
// porque recorre TODOS los codigos que encuentra en el archivo, no solo el primero. El ancla se
// SUBE, nunca se relaja: ni un aserto de esta guardia cambia.
//
// TENSADA el 2026-09-11 (QC-67 T3): de diez a ONCE, con `/configuracion/usuarios`, la pantalla de
// administracion de usuarios. Llama a `requirePagePermission` UNA sola vez —`usuarios.consultar`
// (QC-67 R4)— porque `usuarios.modificar` no cierra la pantalla, solo oculta las escrituras (R6):
// QC-74 decidio que `modificar` NO implica `consultar`, asi que cortar por los dos dejaria fuera a
// quien tiene exactamente el permiso que la lista exige. Darse de alta en esta lista es el punto de
// extension por diseño de la guardia; el ancla se SUBE y ni un aserto cambia.
// TENSADA el 2026-09-17 (QC-63 T11): de doce a TRECE, con `/asignacion/[id]`, la pantalla de
// ejecucion de la receta de un pedido asignado. Llama a `requirePagePermission` UNA sola vez
// -`asignaciones.consultar`, la misma que exige la lista- porque esta pantalla no anade ninguna
// escritura propia de `asignaciones`: abrir y finalizar los hace el caso de uso, no un permiso
// nuevo de pantalla.
//
// TENSADA el 2026-09-23: de trece a CATORCE, con
// `/proveedores/[id]/importar/[documentoId]`, la revision de una importacion de catalogo desde un
// PDF. Llama a `requirePagePermission` DOS veces -`proveedores.consultar` y
// `proveedores.modificar`-, mismo patron que `/configuracion/unidades`: revisar y confirmar la
// importacion son una escritura sobre el catalogo del proveedor, no una lectura sola.
//
// TENSADA el 2026-09-25 (QC-159 T9): de catorce a QUINCE, con
// `/produccion/formulas/importar/[documentoId]`, la revision de una importacion de formula desde
// un PDF. Llama a `requirePagePermission` DOS veces -`recetas.consultar` y `recetas.modificar`
// (R32)-, mismo patron que las dos filas anteriores: revisar y confirmar la importacion son una
// escritura sobre las recetas, no una lectura sola.
//
// TENSADA el 2026-09-25: de quince a DIECISEIS, con `/clientes`. Llama a `requirePagePermission`
// UNA sola vez -`clientes.consultar`-, mismo patron que `/configuracion/usuarios`: la escritura no
// cierra la pantalla, solo oculta sus acciones.
//
// TENSADA el 2026-09-25 (QC-168): de dieciseis a DIECISIETE, con `/asignacion/empaque/[id]`, la
// pantalla de ejecucion del pedido de empaque. Llama a `requirePagePermission` UNA sola vez
// -`asignaciones.consultar`-, mismo patron que `/asignacion/[id]`: abrir y terminar el empaque los
// hace el caso de uso, no un permiso nuevo de pantalla.
//
// TENSADA el 2026-10-02 (QC-174): de diecisiete a DIECINUEVE, con
// `/produccion/formulas/[id]/versiones/nueva` y `/produccion/formulas/[id]/versiones/[versionId]`,
// el alta y la edicion de una version de receta. Cada una llama a `requirePagePermission` UNA sola
// vez -`recetas.consultar`-, mismo patron que `/produccion/formulas/[id]`: guardar lo autoriza el
// caso de uso con `recetas.modificar`.
//
// TENSADA el 2026-10-06 (QC-209): de diecinueve a VEINTE, con `/inventario/importar`, que llama a
// `requirePagePermission` UNA sola vez, con `inventario.modificar`.
//
// TENSADA el 2026-10-08 (QC-167 T12, R20): de veinte a VEINTIUNA, con `/dashboard/recorrido/[id]`,
// el recorrido de ejecucion de un pedido. Llama a `requirePagePermission` UNA sola vez
// -`dashboard.consultar`-, el mismo permiso que `/dashboard`: es su detalle, no un modulo nuevo.
const RUTAS_ESPERADAS_HOY = [
  '/asignacion',
  '/asignacion/[id]',
  '/asignacion/empaque/[id]',
  '/clientes',
  '/configuracion/presentaciones',
  '/configuracion/unidades',
  '/configuracion/usuarios',
  '/dashboard',
  '/dashboard/recorrido/[id]',
  '/inventario',
  '/inventario/importar',
  '/pedidos',
  '/produccion/formulas',
  '/produccion/formulas/[id]',
  '/produccion/formulas/[id]/versiones/[versionId]',
  '/produccion/formulas/[id]/versiones/nueva',
  '/produccion/formulas/importar/[documentoId]',
  '/produccion/formulas/nueva',
  '/proveedores',
  '/proveedores/[id]',
  '/proveedores/[id]/importar/[documentoId]',
].sort();

describe('guardia — toda pantalla bajo app/(private)/ exige un permiso del catalogo (R6, R20)', () => {
  it('el barrido encuentra exactamente las veintiuna pantallas privadas de hoy', () => {
    const rutas = [...listPrivatePages(repoRoot).map((pantalla) => pantalla.route)].sort();

    expect(rutas).toEqual(RUTAS_ESPERADAS_HOY);
  });

  it('cada pantalla privada llama a requirePagePermission con un codigo del catalogo', () => {
    const pantallas = listPrivatePages(repoRoot);
    const infracciones = findInfracciones(pantallas, CODIGOS_VALIDOS);

    expect(
      infracciones,
      infracciones.length === 0
        ? undefined
        : `Estas pantallas de app/(private)/ incumplen el corte por permiso: ${describir(infracciones)}. ` +
            "Anade `await requirePagePermission('<modulo>.consultar')` como PRIMERA linea del " +
            'componente, antes de leer searchParams/params y antes de pintar nada (R6, ' +
            'design.md > 2.2). El middleware ya no corta por rol: si esta linea falta, no hay corte.',
    ).toEqual([]);
  });

  it('el catalogo importado tiene codigos: sin el, la comprobacion del codigo no comprobaria nada', () => {
    expect(CODIGOS_VALIDOS.size).toBeGreaterThan(0);
    expect(CODIGOS_VALIDOS.has('inventario.consultar')).toBe(true);
  });

  // Casos sinteticos: la regla dispara donde debe y NO dispara donde no debe, sin depender del
  // arbol real. Son los que sostienen la guardia si algun dia el arbol cambia entero.
  it('dispara con una pantalla sin la llamada, y no dispara con una que la hace bien', () => {
    const sinLlamada = {
      file: 'app/(private)/facturas/page.tsx',
      source: 'export default async function FacturasPage() {\n  return <div />;\n}\n',
    };
    const correcta = {
      file: 'app/(private)/inventario/page.tsx',
      source:
        'export default async function InventarioPage() {\n' +
        "  await requirePagePermission('inventario.consultar');\n" +
        '  return <div />;\n}\n',
    };

    expect(findInfracciones([sinLlamada], CODIGOS_VALIDOS)).toEqual([
      { clase: 'sin-llamada', file: sinLlamada.file },
    ]);
    expect(findInfracciones([correcta], CODIGOS_VALIDOS)).toEqual([]);
  });

  it('dispara con un codigo que no esta en el catalogo, y lo distingue de la falta de llamada', () => {
    const conErrata = {
      file: 'app/(private)/inventario/page.tsx',
      // `inventaro`: la errata que el typecheck ya atrapa hoy —`PermissionCode` es union de
      // literales—, pero que un `as string` o un helper mas laxo dejarian pasar manana.
      source: "export default async function P() {\n  await requirePagePermission('inventaro.consultar');\n}\n",
    };

    expect(findInfracciones([conErrata], CODIGOS_VALIDOS)).toEqual([
      {
        clase: 'codigo-fuera-del-catalogo',
        file: conErrata.file,
        code: 'inventaro.consultar',
      },
    ]);
  });

  it('no se ciega con los comentarios: mencionar la llamada en prosa NO cuenta como llamarla', () => {
    const soloEnComentario = {
      file: 'app/(private)/facturas/page.tsx',
      source:
        '/**\n' +
        " * Esta pantalla deberia llamar a requirePagePermission('inventario.consultar').\n" +
        ' */\n' +
        "// TODO: await requirePagePermission('pedidos.consultar');\n" +
        'export default async function FacturasPage() {\n  return <div />;\n}\n',
    };

    expect(findInfracciones([soloEnComentario], CODIGOS_VALIDOS)).toEqual([
      { clase: 'sin-llamada', file: soloEnComentario.file },
    ]);
  });

  it('quita los comentarios de LINEA antes que los de BLOQUE, y por eso no se traga la llamada', () => {
    // Un comentario de linea con una apertura de bloque dentro. Con el orden invertido, ese `/*`
    // falso abriria un bloque que se cerraria en el `*/` del JSDoc siguiente y se llevaria por
    // delante la llamada real: la pantalla quedaria marcada como «sin llamada» teniendola.
    const fuente =
      '// el glob de la config es app/**/*.tsx y no /* esto */\n' +
      '/** Documenta la pantalla. */\n' +
      "export default async function P() {\n  await requirePagePermission('pedidos.consultar');\n}\n";

    expect(extractRequiredPermissions(stripComments(fuente))).toEqual(['pedidos.consultar']);
  });

  it('la URL ignora los route groups y `components/` no produce ruta', () => {
    expect(routeFromSegments(['inventario'])).toBe('/inventario');
    expect(routeFromSegments(['(ventas)', 'facturas'])).toBe('/facturas');
    expect(routeFromSegments(['produccion', 'formulas', 'nueva'])).toBe('/produccion/formulas/nueva');
    expect(isRouteGroup('(private)')).toBe(true);
    expect(isRouteGroup('formulas')).toBe(false);
  });

  it('el camino de archivo que se nombra en el fallo usa `/` tambien en Windows', () => {
    expect(listPrivatePages(repoRoot).every((pantalla) => !pantalla.file.includes('\\'))).toBe(true);
  });
});
