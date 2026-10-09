import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { INVENTORY_IMPORT_ROUTE } from '@/lib/shared/routes';

/**
 * Contrato de la pantalla de importacion: guardias de codigo, sin DOM. Son las reglas de
 * `product-route-contract.test.ts` que valen para cualquier pantalla (barrel, frontera de cliente,
 * multiplataforma); jsdom no ve hojas de estilo, asi que un `hidden hover:flex` o un control de
 * 32 px solo se detectan leyendo la fuente.
 */

const RAIZ = join(__dirname, '..', '..', '..', '..');

const CARPETA_RUTA = join('app', '(private)', INVENTORY_IMPORT_ROUTE.replace(/^\//, ''));
const PAGE_PATH = aPosix(join(CARPETA_RUTA, 'page.tsx'));
const COMPONENTES_PATH = aPosix(join(CARPETA_RUTA, 'components'));
const BARREL_PATH = `${COMPONENTES_PATH}/index.ts`;

function aPosix(ruta: string): string {
  return ruta.split('\\').join('/');
}

function leer(rutaRelativa: string): string {
  return readFileSync(join(RAIZ, rutaRelativa), 'utf8');
}

function esLineaDeComentario(linea: string): boolean {
  const limpia = linea.trim();
  return limpia.startsWith('//') || limpia.startsWith('*') || limpia.startsWith('/*');
}

function sinComentarios(codigo: string): string {
  return codigo
    .split('\n')
    .filter((linea) => !esLineaDeComentario(linea))
    .join('\n');
}

/** Numero de linea en el archivo original de cada linea de `sinComentarios`. */
function lineasOriginales(codigo: string): number[] {
  const numeros: number[] = [];
  codigo.split('\n').forEach((linea, indice) => {
    if (!esLineaDeComentario(linea)) numeros.push(indice + 1);
  });
  return numeros;
}

function fuentesBajo(carpetaRelativa: string): string[] {
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

  recorrer(join(RAIZ, carpetaRelativa));
  return encontradas.sort();
}

const FUENTES_DE_LA_RUTA = fuentesBajo(CARPETA_RUTA);

/** Solo cuenta la directiva: un comentario que cite `'use client'` no hace cliente al archivo. */
function esCliente(codigo: string): boolean {
  return /^\s*['"]use client['"];?\s*$/m.test(sinComentarios(codigo));
}

const FUENTES_DE_CLIENTE = FUENTES_DE_LA_RUTA.filter((ruta) => esCliente(leer(ruta)));

const PROHIBIDOS_EN_CLIENTE = [
  '@/lib/composition',
  '@/lib/shared/db',
  '@prisma/client',
  'prisma.',
  'supabase',
  'next/headers',
] as const;

/** Especificadores de import (estaticos, dinamicos y reexports) de un archivo. */
function especificadores(codigo: string): string[] {
  const encontrados: string[] = [];
  const patron = /(?:from\s+|import\s*\(\s*|import\s+)(['"])([^'"]+)\1/g;
  let encaje: RegExpExecArray | null;
  while ((encaje = patron.exec(sinComentarios(codigo))) !== null) encontrados.push(encaje[2]);
  return encontrados;
}

/** `true` si el especificador entra en `importar/components/<archivo>` saltandose el barrel. */
function saltaElBarrel(especificador: string): boolean {
  const normalizado = especificador.replace(/\/$/, '');
  return (
    /(^|\/)importar\/components\/[^/]+/.test(normalizado) ||
    /^\.\/components\/[^/]+/.test(normalizado)
  );
}

// ---------------------------------------------------------------------------------------------
// Multiplataforma: area tactil de 44x44 px y 16 px en los campos, control a control.
// ---------------------------------------------------------------------------------------------

const CONTROLES_VIGILADOS = [
  'Button',
  'SelectTrigger',
  'Input',
  'AutocompleteInput',
  'AutocompleteItem',
  'AlertDialogAction',
  'Link',
] as const;

const CONTROLES_CON_FUENTE: readonly string[] = ['Input', 'AutocompleteInput', 'AutocompleteItem'];

const UTILIDADES_QUE_OCULTAN = ['hidden', 'invisible', 'opacity-0', 'sr-only', 'scale-0'] as const;

/** `Link` solo es un control cuando se pinta con aspecto de boton. */
function vigilaLaEtiqueta(nombre: string, texto: string): boolean {
  return (
    nombre !== 'Link' ||
    texto.includes('data-slot="button"') ||
    texto.includes('buttonVariants')
  );
}

/** Fin de la expresion desde `inicio`, saltando cadenas y contando llaves. */
function finDeExpresion(codigo: string, inicio: number, cierre: '>' | '}'): number {
  let profundidad = 0;
  let comilla: string | null = null;

  for (let i = inicio; i < codigo.length; i += 1) {
    const caracter = codigo[i];

    if (comilla !== null) {
      if (caracter === '\\') i += 1;
      else if (caracter === comilla) comilla = null;
      continue;
    }
    if (caracter === "'" || caracter === '"' || caracter === '`') {
      comilla = caracter;
      continue;
    }
    if (caracter === '{') {
      profundidad += 1;
      continue;
    }
    if (caracter === '}') {
      profundidad -= 1;
      if (cierre === '}' && profundidad === 0) return i + 1;
      continue;
    }
    if (cierre === '>' && caracter === '>' && profundidad === 0) return i + 1;
  }

  return -1;
}

function etiquetasDeApertura(
  codigo: string,
  nombre: string,
  lineas: number[],
): { texto: string; linea: number }[] {
  const encontradas: { texto: string; linea: number }[] = [];
  const patron = new RegExp(`<${nombre}(?![A-Za-z0-9_$])`, 'g');
  let encaje: RegExpExecArray | null;

  while ((encaje = patron.exec(codigo)) !== null) {
    const fin = finDeExpresion(codigo, encaje.index, '>');
    expect(fin, `no se pudo leer la etiqueta <${nombre}> entera`).toBeGreaterThan(-1);
    encontradas.push({
      texto: codigo.slice(encaje.index, fin),
      linea: lineas[codigo.slice(0, encaje.index).split('\n').length - 1] ?? 0,
    });
  }

  return encontradas;
}

function valorDeAtributo(etiqueta: string, nombre: string): string | null {
  const inicio = etiqueta.indexOf(`${nombre}=`);
  if (inicio === -1) return null;

  const abre = inicio + nombre.length + 1;
  const caracter = etiqueta[abre];

  if (caracter === '{') {
    const fin = finDeExpresion(etiqueta, abre, '}');
    return fin === -1 ? null : etiqueta.slice(abre, fin);
  }
  if (caracter === '"' || caracter === "'") {
    const fin = etiqueta.indexOf(caracter, abre + 1);
    return fin === -1 ? null : etiqueta.slice(abre, fin + 1);
  }
  return null;
}

/** Los componentes agrupan clases en constantes locales; resolverlas evita falsos rojos. */
function constantesConLaClase(codigo: string, clase: string): string[] {
  const nombres: string[] = [];
  const patron = /const\s+([A-Za-z_$][\w$]*)\s*=\s*(['"`])([^'"`]*)\2/g;
  let encaje: RegExpExecArray | null;

  while ((encaje = patron.exec(codigo)) !== null) {
    if (encaje[3].includes(clase)) nombres.push(encaje[1]);
  }

  return nombres;
}

function llevaLaClase(className: string | null, clase: string, constantes: string[]): boolean {
  if (className === null) return false;
  if (className.includes(clase)) return true;
  return constantes.some((nombre) => new RegExp(`(?<![\\w$])${nombre}(?![\\w$])`).test(className));
}

/**
 * El control lleva la talla tactil por alguna de sus formas: la clase (literal o en una constante
 * local), el eje `touch` de `Button`, `touch: true` en `buttonVariants(...)` o la constante
 * compartida `touchTarget` en su `className`.
 */
function llevaLaTallaTactil(etiqueta: string, className: string | null, constantes: string[]): boolean {
  if (/\stouch(?:=\{true\})?(?=\s|\/?>)/.test(etiqueta)) return true;
  if (className === null) return false;
  if (/(?<![\w$])touchTarget(?![\w$])/.test(className)) return true;
  if (/buttonVariants\([^)]*\btouch:\s*true/.test(className)) return true;
  return llevaLaClase(className, 'min-h-11', constantes);
}

/** Las constantes locales que llevan la talla: la clase literal o la constante compartida. */
function constantesTactilesDe(codigo: string): string[] {
  return [
    ...constantesConLaClase(codigo, 'min-h-11'),
    ...constantesConLaClase(codigo, '${touchTarget}'),
  ];
}

function identificaAlControl(etiqueta: string): string {
  return (
    valorDeAtributo(etiqueta, 'data-testid') ??
    valorDeAtributo(etiqueta, 'aria-label') ??
    valorDeAtributo(etiqueta, 'id') ??
    'sin identificador'
  );
}

/** Cada incumplimiento multiplataforma del archivo, mas cuantos controles se vigilaron. */
function incumplimientosMultiplataforma(
  ruta: string,
  original: string,
): { fallos: string[]; controles: number } {
  const codigo = sinComentarios(original);
  const lineas = lineasOriginales(original);
  const fallos: string[] = [];
  let controles = 0;

  if (codigo.includes('100vh')) fallos.push(`${ruta}: usa 100vh`);

  for (const linea of codigo.split('\n')) {
    if (!linea.includes('hover:')) continue;
    for (const utilidad of UTILIDADES_QUE_OCULTAN) {
      if (linea.includes(utilidad)) {
        fallos.push(`${ruta}: «hover» no puede ser la unica via de revelar «${utilidad}»`);
      }
    }
  }

  const constantesTactiles = constantesTactilesDe(codigo);
  const constantesDeFuente = constantesConLaClase(codigo, 'text-base');

  for (const nombre of CONTROLES_VIGILADOS) {
    const todas = etiquetasDeApertura(codigo, nombre, lineas);
    if (codigo.includes(`<${nombre}`) && todas.length === 0) {
      fallos.push(`${ruta}: escribe <${nombre} pero la guardia no leyo ninguna etiqueta`);
    }

    for (const { texto, linea } of todas.filter((e) => vigilaLaEtiqueta(nombre, e.texto))) {
      const className = valorDeAtributo(texto, 'className');
      const control = `${ruta}:${linea} <${nombre}> (${identificaAlControl(texto)})`;
      controles += 1;

      if (!llevaLaTallaTactil(texto, className, constantesTactiles)) {
        fallos.push(`${control} debe forzar min-h-11 en SU className`);
      }
      // Por debajo de 16 px, iOS hace zoom al enfocar.
      const esCampo = CONTROLES_CON_FUENTE.includes(nombre);
      if (esCampo && !llevaLaClase(className, 'text-base', constantesDeFuente)) {
        fallos.push(`${control} debe fijar text-base en SU className`);
      }
    }
  }

  return { fallos, controles };
}

describe('contrato de la ruta de importacion de inventario', () => {
  it('la pantalla existe donde la ubica INVENTORY_IMPORT_ROUTE, con su barrel de componentes', () => {
    expect(existsSync(join(RAIZ, PAGE_PATH)), `deberia existir ${PAGE_PATH}`).toBe(true);
    expect(existsSync(join(RAIZ, BARREL_PATH)), `deberia existir ${BARREL_PATH}`).toBe(true);
    expect(FUENTES_DE_LA_RUTA.length).toBeGreaterThan(2);
  });

  it('la pagina importa sus componentes solo desde el barrel, que no declara frontera de cliente', () => {
    const pagina = sinComentarios(leer(PAGE_PATH));
    expect(pagina).toContain("from './components'");
    expect(especificadores(leer(PAGE_PATH)).filter(saltaElBarrel)).toEqual([]);

    expect(esCliente(leer(BARREL_PATH)), 'el barrel no puede llevar use client').toBe(false);
    expect(sinComentarios(leer(BARREL_PATH))).not.toContain('use client');
  });

  it('ningun archivo de produccion fuera de components/ entra en un componente de la ruta por ruta profunda', () => {
    const profundos: string[] = [];

    for (const carpeta of ['app', 'components', 'lib', 'hooks']) {
      if (!existsSync(join(RAIZ, carpeta))) continue;
      for (const ruta of fuentesBajo(carpeta)) {
        if (ruta.startsWith(`${COMPONENTES_PATH}/`)) continue;
        const enRuta = ruta.startsWith(`${aPosix(CARPETA_RUTA)}/`);
        for (const especificador of especificadores(leer(ruta))) {
          const relativoAqui = especificador.startsWith('./components/');
          if (relativoAqui && !enRuta) continue;
          if (saltaElBarrel(especificador)) profundos.push(`${ruta} -> ${especificador}`);
        }
      }
    }

    expect(profundos).toEqual([]);
  });

  it('no quedan componentes sueltos junto a page.tsx', () => {
    const archivosDeAppRouter = [
      'page.tsx',
      'layout.tsx',
      'loading.tsx',
      'error.tsx',
      'not-found.tsx',
    ];
    for (const entrada of readdirSync(join(RAIZ, CARPETA_RUTA), { withFileTypes: true })) {
      if (entrada.isDirectory()) continue;
      expect(archivosDeAppRouter, `${entrada.name} no es un archivo del App Router`).toContain(
        entrada.name,
      );
    }
  });

  it('los componentes de cliente no importan composicion ni base de datos', () => {
    expect(FUENTES_DE_CLIENTE.length).toBeGreaterThan(0);

    for (const ruta of FUENTES_DE_CLIENTE) {
      const codigo = sinComentarios(leer(ruta));
      for (const prohibido of PROHIBIDOS_EN_CLIENTE) {
        expect(codigo, `${ruta} no debe contener «${prohibido}»`).not.toContain(prohibido);
      }
    }
  });

  it('no usa 100vh, ni hover como unica via, y respeta tamanos tactiles y de fuente', () => {
    const fallos: string[] = [];
    let controles = 0;

    for (const ruta of FUENTES_DE_LA_RUTA) {
      const resultado = incumplimientosMultiplataforma(ruta, leer(ruta));
      fallos.push(...resultado.fallos);
      controles += resultado.controles;
    }

    expect(fallos).toEqual([]);
    expect(controles, 'la guardia no esta vigilando ningun control').toBeGreaterThan(0);
  });

  describe('las guardias muerden con fuentes fabricadas', () => {
    it('un import profundo a un componente de la ruta se detecta; el barrel no', () => {
      expect(saltaElBarrel('./components/import-upload-field')).toBe(true);
      const profundo = '@/app/(private)/inventario/importar/components/download-file';
      expect(saltaElBarrel(profundo)).toBe(true);
      expect(saltaElBarrel('./components')).toBe(false);
      expect(saltaElBarrel('@/app/(private)/inventario/importar/components')).toBe(false);
    });

    it('la directiva use client se reconoce y un comentario que la cita no', () => {
      expect(esCliente("'use client';\n\nexport function A() {}")).toBe(true);
      expect(esCliente("// sin 'use client' a proposito\nexport function A() {}")).toBe(false);
    });

    it('un control sin area tactil, un campo sin 16 px, 100vh y hover que revela se detectan', () => {
      const fabricado = [
        "'use client';",
        'export function Roto() {',
        '  return (',
        '    <div className="h-[100vh]">',
        '      <Button data-testid="sin-area" className="text-base">x</Button>',
        '      <Input data-testid="sin-fuente" className="min-h-11" />',
        '      <span className="hidden hover:flex">y</span>',
        '    </div>',
        '  );',
        '}',
      ].join('\n');
      const { fallos, controles } = incumplimientosMultiplataforma('fabricado.tsx', fabricado);

      expect(controles).toBe(2);
      expect(fallos.some((f) => f.includes('100vh'))).toBe(true);
      expect(fallos.some((f) => f.includes('"sin-area"') && f.includes('min-h-11'))).toBe(true);
      expect(fallos.some((f) => f.includes('"sin-fuente"') && f.includes('text-base'))).toBe(true);
      expect(fallos.some((f) => f.includes('«hidden»'))).toBe(true);

      const correcto = [
        "const TOUCH = 'min-h-11 min-w-11';",
        "const FIELD = 'text-base';",
        'export function Bien() {',
        '  return <Input className={`${TOUCH} ${FIELD}`} />;',
        '}',
      ].join('\n');
      expect(incumplimientosMultiplataforma('correcto.tsx', correcto).fallos).toEqual([]);
    });

    it('R8 — la talla compartida cuenta como area tactil, y quitarla se sigue detectando', () => {
      const conLaTalla = [
        "const FIELD = `${touchTarget} text-base`;",
        'export function Bien() {',
        '  return (',
        '    <>',
        '      <Button data-testid="eje" touch>x</Button>',
        '      <Button data-testid="eje-explicito" touch={true} variant="outline">x</Button>',
        '      <Input data-testid="constante" className={`w-full ${touchTarget} text-base`} />',
        '      <Input data-testid="compuesta" className={FIELD} />',
        '      <Link data-slot="button" data-testid="enlace" href="/x" className={buttonVariants({ variant: \'outline\', touch: true })}>x</Link>',
        '    </>',
        '  );',
        '}',
      ].join('\n');
      const bien = incumplimientosMultiplataforma('con-la-talla.tsx', conLaTalla);
      expect(bien.controles).toBe(5);
      expect(bien.fallos).toEqual([]);

      const sinLaTalla = [
        'export function Roto() {',
        '  return (',
        '    <>',
        '      <Button data-testid="sin-eje" variant="outline">x</Button>',
        '      <Button data-testid="ontouch" ontouchstart={f}>x</Button>',
        '      <Link data-slot="button" data-testid="enlace-sin" href="/x" className={buttonVariants({ variant: \'outline\', touch: false })}>x</Link>',
        '    </>',
        '  );',
        '}',
      ].join('\n');
      const { fallos } = incumplimientosMultiplataforma('sin-la-talla.tsx', sinLaTalla);
      for (const testId of ['sin-eje', 'ontouch', 'enlace-sin']) {
        expect(fallos.some((f) => f.includes(`"${testId}"`) && f.includes('min-h-11'))).toBe(true);
      }
    });
  });
});
