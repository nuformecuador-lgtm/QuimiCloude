import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { PERMISSIONS } from '@/lib/modules/identity';
import { PRIVATE_NAV_ITEMS, type NavLink } from '@/lib/shared/navigation/private-nav';
import {
  INVENTORY_IMPORT_ROUTE,
  INVENTORY_ROUTE,
  PRIVATE_ROUTE_PREFIXES,
} from '@/lib/shared/routes';

/**
 * Contrato de la ruta de inventario: R2, R5, R7, R8, R9, R13, R18, R22, R25, R27, R28, R29, R30,
 * R31 y R32 (`specs/QC-22-pantalla-de-productos/tasks.md > T13`).
 *
 * **Guardias de codigo, sin DOM**, mismo patron que `tests/unit/dashboard-route-contract.test.ts`.
 * Todo lo que esta feature promete **no hacer** —no incrustar la ruta, no llamar a rutas de API
 * propias, no repetir la autorizacion, no ofrecer la gestion de presentaciones, no esconder una
 * accion detras del puntero, no duplicar el armazon heredado— es invisible renderizando: si
 * manana la pantalla empezase a hacer cualquiera de esas cosas, ningun assert de DOM se pondria
 * rojo. De ahi este archivo.
 *
 * Es tambien donde aterriza la mitad de R31 que **jsdom no puede observar**: sin hojas de estilo,
 * un control escondido con `hidden hover:flex` sigue pareciendo visible en un test de render
 * (comprobado al escribir T12). Aqui se mira la fuente, que es donde esa regla se rompe.
 */

const RAIZ = join(__dirname, '..', '..', '..');

/** Carpeta de la ruta, **derivada de la constante** (R2). El App Router es el unico que exige
 *  que el nombre de la carpeta coincida con la URL; el route group `(private)` no aporta
 *  segmento. */
const CARPETA_RUTA = join('app', '(private)', INVENTORY_ROUTE.replace(/^\//, ''));
const PAGE_PATH = join(CARPETA_RUTA, 'page.tsx');
const COMPONENTES_PATH = join(CARPETA_RUTA, 'components');
const BARREL_PATH = join(COMPONENTES_PATH, 'index.ts');

/** El layout privado, unico archivo heredado de la zona privada que R32 autoriza a tocar. */
const LAYOUT_PRIVADO_PATH = join('app', '(private)', 'layout.tsx');

/** El literal de la ruta, en las dos comillas en las que se puede escribir. */
const LITERALES_DE_RUTA = [`'${INVENTORY_ROUTE}'`, `"${INVENTORY_ROUTE}"`, `\`${INVENTORY_ROUTE}`];

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

/**
 * Numero de linea en el archivo ORIGINAL de cada linea de `fuenteSinComentarios`. Sin esto, un
 * fallo de R31 apuntaria a una linea que no existe en el archivo que hay que abrir.
 */
function lineasOriginales(rutaRelativa: string): number[] {
  const numeros: number[] = [];

  leer(rutaRelativa)
    .split('\n')
    .forEach((linea, indice) => {
      const limpia = linea.trim();
      if (!(limpia.startsWith('//') || limpia.startsWith('*') || limpia.startsWith('/*'))) {
        numeros.push(indice + 1);
      }
    });

  return numeros;
}

/** Todos los archivos `.ts`/`.tsx` bajo una carpeta, en rutas relativas a la raiz del repo. */
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
        encontradas.push(relative(RAIZ, completa).split('\\').join('/'));
      }
    }
  };

  recorrer(join(RAIZ, carpetaRelativa));
  return encontradas.sort();
}

// La subruta de importacion es otra pantalla, con su propio contrato en
// `importar/importar-route-contract.test.ts`; aqui solo se vigila /inventario.
const CARPETA_SUBRUTA_IMPORTAR = join(
  'app',
  '(private)',
  INVENTORY_IMPORT_ROUTE.replace(/^\//, ''),
);
const NOMBRE_SUBRUTA_IMPORTAR = INVENTORY_IMPORT_ROUTE.split('/').pop() as string;
const PREFIJO_SUBRUTA_IMPORTAR = `${CARPETA_SUBRUTA_IMPORTAR.split('\\').join('/')}/`;

/** Los archivos de la ruta: `page.tsx` y todos los componentes propios. */
const FUENTES_DE_LA_RUTA = fuentesBajo(CARPETA_RUTA).filter(
  (ruta) => !ruta.startsWith(PREFIJO_SUBRUTA_IMPORTAR),
);

/**
 * El selector de presentacion ya NO vive en la ruta: QC-44 lo promovio a `components/shared/`
 * porque la pantalla de proveedores lo necesita con la MISMA API, y el barrel de la ruta lo
 * reexporta. Sigue siendo parte de lo que esta pantalla pinta, asi que las guardias que miran
 * ESE archivo -R25, R30 y R31- lo siguen mirando en su ubicacion nueva; si no, la mudanza habria
 * apagado su cobertura en silencio.
 */
const SELECTOR_PRESENTACION_PATH = join('components', 'shared', 'presentation-select.tsx')
  .split('\\')
  .join('/');

/** Lo que esta pantalla pinta: sus archivos propios mas el selector promovido. */
const FUENTES_VIGILADAS = [...FUENTES_DE_LA_RUTA, SELECTOR_PRESENTACION_PATH];

/** Los que declaran frontera de cliente. R30 va sobre estos. */
const FUENTES_DE_CLIENTE = FUENTES_VIGILADAS.filter((ruta) => leer(ruta).includes("'use client'"));

/**
 * Los controles que R31 obliga a agrandar. Se buscan como **etiqueta de apertura JSX**
 * (`<Nombre`), no como texto suelto: `AlertDialogAction` tambien aparece en la linea del import.
 */
const CONTROLES_VIGILADOS = [
  'Button',
  'SelectTrigger',
  'Input',
  'AutocompleteInput',
  'AutocompleteItem',
  'AlertDialogAction',
  'Link',
] as const;

/**
 * Los que ademas fijan 16 px en SU className: los que el usuario LEE mientras escribe o elige.
 *
 * `AutocompleteInput` y `AutocompleteItem` entraron el 2026-09-07, cuando el selector de
 * presentacion paso de desplegable a autocomplete: sin anadirlos aqui, el campo se habria salido
 * de la guardia del area tactil por un simple cambio de nombre de etiqueta.
 */
const CONTROLES_CON_FUENTE: readonly string[] = ['Input', 'AutocompleteInput', 'AutocompleteItem'];

/**
 * `Link` no es un control por si mismo: solo se vigila cuando se pinta CON ASPECTO DE BOTON
 * (`data-slot="button"` + `buttonVariants`). Las acciones que navegan son enlaces reales -no el
 * primitivo `Button` con `render`, que avisa por `nativeButton` y le cuelga un `role="button"` al
 * `<a>`-, y sin este filtro esas acciones se saldrian de la guardia del area tactil. Los enlaces
 * de texto corriente quedan fuera a proposito.
 */
function vigilaLaEtiqueta(nombre: string, texto: string): boolean {
  return nombre !== 'Link' || texto.includes('data-slot="button"');
}

/**
 * Avanza desde `inicio` hasta el cierre de la expresion, ignorando lo que caiga dentro de una
 * cadena y contando llaves. Es lo minimo para leer una etiqueta JSX **completa** aunque ocupe
 * varias lineas o lleve `className={`${A} ${B}`}` — mirar linea a linea es justo el error que ya
 * se colo antes en esta feature con los imports multilinea.
 */
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

/** Cada etiqueta de apertura `<Nombre ...>` del archivo, con su linea, como texto completo. */
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

/** Valor de un atributo de la etiqueta, sea `attr="..."` o `attr={...}`. */
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

/**
 * Constantes locales de cadena cuyo valor contiene `clase`. Los componentes no escriben la clase
 * literal, la agrupan (`const TOUCH_TARGET = 'min-h-11 min-w-11'`), asi que resolver `min-h-11` a
 * ojo sobre el `className` daria falsos rojos.
 */
function constantesConLaClase(codigo: string, clase: string): string[] {
  const nombres: string[] = [];
  const patron = /const\s+([A-Za-z_$][\w$]*)\s*=\s*(['"`])([^'"`]*)\2/g;
  let encaje: RegExpExecArray | null;

  while ((encaje = patron.exec(codigo)) !== null) {
    if (encaje[3].includes(clase)) nombres.push(encaje[1]);
  }

  return nombres;
}

/** El `className` lleva la clase, literal o a traves de una constante local que la contiene. */
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

/** Como se nombra un control en el mensaje de fallo, para no obligar a buscarlo a mano. */
function identificaAlControl(etiqueta: string): string {
  return (
    valorDeAtributo(etiqueta, 'data-testid') ??
    valorDeAtributo(etiqueta, 'aria-label') ??
    valorDeAtributo(etiqueta, 'id') ??
    'sin identificador'
  );
}

/** Comprueba que ningun archivo de la ruta contiene ninguno de los textos prohibidos. */
function ningunArchivoContiene(prohibidos: readonly string[], fuentes = FUENTES_DE_LA_RUTA) {
  for (const ruta of fuentes) {
    const codigo = fuenteSinComentarios(ruta);
    for (const prohibido of prohibidos) {
      expect(codigo, `${ruta} no debe contener «${prohibido}»`).not.toContain(prohibido);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Enmienda 2026-09-18 — la sesion se puede leer PARA PREGUNTAR al modulo, nunca
// para decidir aqui. Detectores compartidos entre el caso real y el caso de mutacion.
// ---------------------------------------------------------------------------------------------

/** El literal de permiso de escritura, en el UNICO sitio en que puede vivir: el modulo. */
const INVENTARIO_MODIFICAR = 'inventario.modificar';

const ADJUST_BATCH_STOCK_PATH = 'lib/modules/inventario/domain/adjust-batch-stock.ts';

/** Prohibidos duros: son formas de CORTAR el paso desde la pantalla, no de preguntar. */
const PROHIBIDOS_DUROS_DE_SESION = [
  'requireAdmin',
  'ADMIN_ROLE_NAME',
  'decideRouteAccess',
  'next/headers',
  'redirect(',
] as const;

/**
 * `true` si un archivo que lee la sesion lo hace para DELEGAR en el predicado del modulo y no
 * para decidir el acceso el mismo: no es cliente, importa y usa `canAdjustBatchStock` de
 * `@/lib/modules/inventario`, no hurga en `.permissions` ni en `roleName` de `SessionUser` por su
 * cuenta -eso seria una segunda definicion de la regla-, y no contiene ninguno de los prohibidos
 * duros.
 */
function delegaLaSesionEnElPredicado(codigo: string): boolean {
  if (codigo.includes("'use client'")) return false;
  if (!codigo.includes('canAdjustBatchStock')) return false;
  if (!codigo.includes('@/lib/modules/inventario')) return false;
  if (codigo.includes('.permissions') || codigo.includes('roleName')) return false;
  return !PROHIBIDOS_DUROS_DE_SESION.some((prohibido) => codigo.includes(prohibido));
}

/**
 * Igual que `fuenteSinComentarios`, pero sobre una cadena en memoria: para fuentes fabricadas y
 * para archivos fuera de la ruta (`adjust-batch-stock.ts`, que `fuenteSinComentarios` no cubre
 * porque lee del disco por ruta relativa dentro de la ruta vigilada).
 */
function sinLineasDeComentarioDeCadena(codigo: string): string {
  return codigo
    .split('\n')
    .filter((linea) => {
      const limpia = linea.trim();
      return !(limpia.startsWith('//') || limpia.startsWith('*') || limpia.startsWith('/*'));
    })
    .join('\n');
}

/** Indice del `)` que cierra la lista de parametros que abre en `aperturaParametros`. */
function indiceCierreDeParametros(codigo: string, aperturaParametros: number): number {
  let profundidad = 0;
  for (let i = aperturaParametros; i < codigo.length; i += 1) {
    if (codigo[i] === '(') profundidad += 1;
    if (codigo[i] === ')') {
      profundidad -= 1;
      if (profundidad === 0) return i;
    }
  }
  return -1;
}

/** Indice de la `{` que abre el CUERPO de la funcion, saltando el tipo de retorno -que puede
 *  traer sus propias llaves y angulos, como `Promise<{ stock: number }>`-. */
function indiceLlaveDeCuerpo(codigo: string, cierreParametros: number): number {
  let profundidadAngulos = 0;
  let profundidadLlavesDeTipo = 0;
  for (let i = cierreParametros + 1; i < codigo.length; i += 1) {
    const caracter = codigo[i];
    if (caracter === '<') {
      profundidadAngulos += 1;
    } else if (caracter === '>') {
      profundidadAngulos = Math.max(0, profundidadAngulos - 1);
    } else if (caracter === '{') {
      if (profundidadAngulos === 0 && profundidadLlavesDeTipo === 0) return i;
      profundidadLlavesDeTipo += 1;
    } else if (caracter === '}') {
      profundidadLlavesDeTipo = Math.max(0, profundidadLlavesDeTipo - 1);
    }
  }
  return -1;
}

/**
 * El cuerpo -SIN las llaves que lo envuelven- de `function <nombre>(...) { ... }`, con balance de
 * llaves, buscada por su nombre este DONDE este -declarada, asignada o devuelta-. Equivalente
 * local a `cuerpoDeFuncion` de `tests/unit/inventario/qc91-alcance.test.ts:151-171`, que exige
 * `export` y por eso no sirve para `adjustBatchStock`, que es la funcion INTERNA que
 * `createAdjustBatchStock` devuelve.
 */
function cuerpoDeFuncionAnidada(fuente: string, nombre: string): string | null {
  const codigo = sinLineasDeComentarioDeCadena(fuente);
  const inicio = codigo.indexOf(`function ${nombre}(`);
  if (inicio === -1) return null;
  const aperturaParametros = codigo.indexOf('(', inicio);
  const cierreParametros = indiceCierreDeParametros(codigo, aperturaParametros);
  if (cierreParametros === -1) return null;
  const llave = indiceLlaveDeCuerpo(codigo, cierreParametros);
  if (llave === -1) return null;
  let profundidad = 0;
  for (let i = llave; i < codigo.length; i += 1) {
    if (codigo[i] === '{') profundidad += 1;
    if (codigo[i] === '}') {
      profundidad -= 1;
      if (profundidad === 0) return codigo.slice(llave + 1, i);
    }
  }
  return null;
}

/**
 * `true` si, tras quitar el espacio en blanco inicial, el cuerpo empieza EXACTAMENTE por la
 * llamada al corte de permiso -ni una validacion antes, ni una lectura del repositorio-. Mide
 * ORDEN, no mera presencia: `requirePermission` en cualquier otra posicion da `false`.
 */
function primeraSentenciaEsRequirePermission(cuerpo: string): boolean {
  return cuerpo.trimStart().startsWith(`requirePermission(actor, '${INVENTARIO_MODIFICAR}')`);
}

describe('contrato de la ruta de inventario', () => {
  it('la pantalla existe donde la ubica INVENTORY_ROUTE y sus componentes viven en su barrel', () => {
    // R2, R27 — la ruta esperada se DERIVA de la constante, no se escribe a mano.
    expect(existsSync(join(RAIZ, PAGE_PATH)), `deberia existir ${PAGE_PATH}`).toBe(true);
    expect(existsSync(join(RAIZ, BARREL_PATH)), `deberia existir ${BARREL_PATH}`).toBe(true);
    expect(FUENTES_DE_LA_RUTA.length).toBeGreaterThan(1);
  });

  it('la ubicacion de la ruta se deriva de INVENTORY_ROUTE y ningun archivo incrusta el literal', () => {
    // R2 — el literal existe en UN solo sitio del repo: la constante. Duplicarlo es como se
    // acaba con `/dashboard` y `/panel` conviviendo.
    const conElLiteral: string[] = [];

    for (const carpeta of ['app', 'components', 'lib', 'hooks']) {
      if (!existsSync(join(RAIZ, carpeta))) continue;
      for (const ruta of fuentesBajo(carpeta)) {
        if (ruta === 'lib/shared/routes.ts') continue;
        const codigo = fuenteSinComentarios(ruta);
        if (LITERALES_DE_RUTA.some((literal) => codigo.includes(literal))) conElLiteral.push(ruta);
      }
    }

    expect(conElLiteral, 'el literal de la ruta solo puede vivir en lib/shared/routes.ts').toEqual(
      [],
    );

    // Y la constante se declara una sola vez.
    expect(leer('lib/shared/routes.ts')).toContain('export const INVENTORY_ROUTE');
    expect(fuenteSinComentarios('lib/shared/navigation/private-nav.ts')).not.toContain(
      'const INVENTORY_ROUTE =',
    );
  });

  it('el item Inventario del sidebar y el prefijo privado apuntan a la misma constante', () => {
    // R2 (+ R3, cuya cobertura del prefijo vigila `guard-rutas-privadas-cubiertas.test.ts`).
    const enlaces = PRIVATE_NAV_ITEMS.filter((item): item is NavLink => item.kind === 'link');
    expect(enlaces.filter((enlace) => enlace.href === INVENTORY_ROUTE)).toHaveLength(1);

    expect(PRIVATE_ROUTE_PREFIXES).toContain(INVENTORY_ROUTE);

    // La pantalla no redeclara constantes de ruta por su cuenta.
    ningunArchivoContiene(['export const INVENTORY_ROUTE', 'PRIVATE_NAV_ITEMS =']);
  });

  it('la pantalla no repite requireAdmin ni decide autorizacion', () => {
    // R5 — la autorizacion sobre los datos la aportan los casos de uso; la pantalla solo exige el
    // permiso de consulta con `requirePagePermission` (el caso de abajo). Comparar roles o
    // resolver la sesion aqui seria una tercera regla que nadie mantiene sincronizada.
    //
    // NOTA 2026-09-18 (enmienda aprobada): la premisa sigue en pie -la pantalla no decide
    // autorizacion-, pero preguntar si se pinta un control no es decidir autorizacion. La
    // autorizacion dura la da el caso de uso (abajo) y rechaza igual aunque la pantalla se
    // la saltara: la pantalla no es la regla, es su reflejo. Precedente de esta misma distincion en
    // `app/(private)/pedidos/components/order-list-section.tsx` («No es autorizacion, es
    // PRESENTACION»). Por eso `getSessionUser` deja de estar prohibido a secas: se admite SOLO si
    // el archivo delega en el predicado del modulo.
    ningunArchivoContiene([
      'requireAdmin',
      'ADMIN_ROLE_NAME',
      'decideRouteAccess',
      'next/headers',
      'redirect(',
    ]);

    for (const ruta of FUENTES_DE_LA_RUTA) {
      const codigo = fuenteSinComentarios(ruta);
      if (!codigo.includes('getSessionUser')) continue;
      expect(
        delegaLaSesionEnElPredicado(codigo),
        `${ruta} lee la sesion pero no delega en canAdjustBatchStock de @/lib/modules/inventario`,
      ).toBe(true);
    }

    // El bucle de arriba puede quedarse legitimamente vacio: si ningun archivo de la ruta lee la
    // sesion, no hay nada que vigilar y esa es la direccion segura. Las afirmaciones duras de este
    // mismo caso (los prohibidos de `ningunArchivoContiene`) corren igual, vacio o no.
  });

  // ---------------------------------------------------------------------------------------------
  // Enmienda 2026-09-18 — MARCA POSITIVA: el retensado deja el repo MEJOR
  // protegido que antes, no solo igual de protegido con una excepcion nueva.
  // ---------------------------------------------------------------------------------------------

  it('el literal del permiso de escritura no vive en la ruta', () => {
    // El literal es del modulo (`lib/modules/inventario/domain/actor.ts`); la ruta solo pregunta.
    ningunArchivoContiene(
      [`'${INVENTARIO_MODIFICAR}'`, `"${INVENTARIO_MODIFICAR}"`, `\`${INVENTARIO_MODIFICAR}`],
      FUENTES_VIGILADAS,
    );
  });

  it('el caso de uso de ajuste exige el permiso ANTES de validar y ANTES de tocar el repositorio', () => {
    const fuente = sinLineasDeComentarioDeCadena(leer(ADJUST_BATCH_STOCK_PATH));
    const cuerpo = cuerpoDeFuncionAnidada(fuente, 'adjustBatchStock');
    expect(
      cuerpo,
      'adjustBatchStock no existe con esa forma: el sujeto de esta prueba cambio',
    ).not.toBeNull();
    expect(primeraSentenciaEsRequirePermission(cuerpo as string)).toBe(true);
  });

  describe('la marca positiva muerde de verdad, con fuentes fabricadas', () => {
    it('la lectura de sesion sin el predicado, con requireAdmin, con redirect( o hurgando en .permissions/roleName no delega', () => {
      const sinPredicado = [
        "import { identity } from '@/lib/composition';",
        '',
        'export async function ProductListSection() {',
        '  const sessionUser = await identity.getSessionUser();',
        "  const canAdjust = sessionUser?.permissions?.includes('inventario.modificar') ?? false;",
        '  return canAdjust;',
        '}',
      ].join('\n');
      expect(delegaLaSesionEnElPredicado(sinPredicado)).toBe(false);

      const conRequireAdmin = [
        "import { requireAdmin } from '@/lib/composition';",
        'export async function ProductListSection() {',
        '  await requireAdmin();',
        '  return true;',
        '}',
      ].join('\n');
      expect(delegaLaSesionEnElPredicado(conRequireAdmin)).toBe(false);

      const conRedirect = [
        "import { redirect } from 'next/navigation';",
        "import { canAdjustBatchStock } from '@/lib/modules/inventario';",
        'export async function ProductListSection() {',
        '  const sessionUser = await identity.getSessionUser();',
        '  if (!canAdjustBatchStock(sessionUser)) redirect(\'/login\');',
        '}',
      ].join('\n');
      expect(delegaLaSesionEnElPredicado(conRedirect)).toBe(false);

      const clienteQueDelega = [
        "'use client';",
        "import { canAdjustBatchStock } from '@/lib/modules/inventario';",
        'export function ProductListSection() {',
        '  const sessionUser = getSessionUser();',
        '  return canAdjustBatchStock(sessionUser);',
        '}',
      ].join('\n');
      expect(delegaLaSesionEnElPredicado(clienteQueDelega)).toBe(false);

      const queDelega = [
        "import { identity } from '@/lib/composition';",
        "import { canAdjustBatchStock } from '@/lib/modules/inventario';",
        'export async function ProductListSection() {',
        '  const sessionUser = await identity.getSessionUser();',
        '  return canAdjustBatchStock(sessionUser);',
        '}',
      ].join('\n');
      expect(delegaLaSesionEnElPredicado(queDelega)).toBe(true);

      const queDelegaPeroTambienHurga = [
        "import { identity } from '@/lib/composition';",
        "import { canAdjustBatchStock } from '@/lib/modules/inventario';",
        'export async function ProductListSection() {',
        '  const sessionUser = await identity.getSessionUser();',
        '  const puedeAdemas = sessionUser.permissions.includes(\'inventario.modificar\');',
        '  return canAdjustBatchStock(sessionUser) && puedeAdemas;',
        '}',
      ].join('\n');
      expect(delegaLaSesionEnElPredicado(queDelegaPeroTambienHurga)).toBe(false);
    });

    it('requirePermission borrado o movido despues del safeParse deja de ser la primera sentencia', () => {
      const conElCorte = [
        'export function createAdjustBatchStock(deps) {',
        '  return async function adjustBatchStock(input, actor) {',
        "    requirePermission(actor, 'inventario.modificar');",
        '    const parsed = schema.safeParse(input);',
        '    return deps.products.adjustBatchStock(parsed.data);',
        '  };',
        '}',
      ].join('\n');
      const cuerpoConElCorte = cuerpoDeFuncionAnidada(conElCorte, 'adjustBatchStock');
      expect(cuerpoConElCorte).not.toBeNull();
      expect(primeraSentenciaEsRequirePermission(cuerpoConElCorte as string)).toBe(true);

      const sinElCorte = [
        'export function createAdjustBatchStock(deps) {',
        '  return async function adjustBatchStock(input, actor) {',
        '    const parsed = schema.safeParse(input);',
        '    return deps.products.adjustBatchStock(parsed.data);',
        '  };',
        '}',
      ].join('\n');
      const cuerpoSinElCorte = cuerpoDeFuncionAnidada(sinElCorte, 'adjustBatchStock');
      expect(cuerpoSinElCorte).not.toBeNull();
      expect(primeraSentenciaEsRequirePermission(cuerpoSinElCorte as string)).toBe(false);

      const corteTardio = [
        'export function createAdjustBatchStock(deps) {',
        '  return async function adjustBatchStock(input, actor) {',
        '    const parsed = schema.safeParse(input);',
        "    requirePermission(actor, 'inventario.modificar');",
        '    return deps.products.adjustBatchStock(parsed.data);',
        '  };',
        '}',
      ].join('\n');
      const cuerpoCorteTardio = cuerpoDeFuncionAnidada(corteTardio, 'adjustBatchStock');
      expect(cuerpoCorteTardio).not.toBeNull();
      expect(primeraSentenciaEsRequirePermission(cuerpoCorteTardio as string)).toBe(false);
    });

    it('el literal del permiso metido a mano en un archivo de ruta se detecta en sus tres comillas', () => {
      const conComillaSimple = `const puede = '${INVENTARIO_MODIFICAR}' === permiso;`;
      const conComillaDoble = `const puede = "${INVENTARIO_MODIFICAR}" === permiso;`;
      const conAcentoGrave = `const puede = \`${INVENTARIO_MODIFICAR}\`;`;
      const sinElLiteral = 'const puede = canAdjustBatchStock(actor);';

      for (const conElLiteral of [conComillaSimple, conComillaDoble, conAcentoGrave]) {
        const contiene = [
          `'${INVENTARIO_MODIFICAR}'`,
          `"${INVENTARIO_MODIFICAR}"`,
          `\`${INVENTARIO_MODIFICAR}`,
        ].some((literal) => conElLiteral.includes(literal));
        expect(contiene, conElLiteral).toBe(true);
      }
      expect(
        [`'${INVENTARIO_MODIFICAR}'`, `"${INVENTARIO_MODIFICAR}"`, `\`${INVENTARIO_MODIFICAR}`].some(
          (literal) => sinElLiteral.includes(literal),
        ),
      ).toBe(false);
    });
  });

  // QC-75 T12 — sustituye a la afirmacion «hay una fila {prefix, roles:[Administrador]} en la
  // lista ruta->rol». Esa lista se retiro (QC-75 R16): lo que ata esta ruta a quien puede verla
  // ya no es un rol en el borde, sino el permiso que exige la propia pantalla (R6) y el que
  // declara su item de menu (R5). Los dos tienen que ser EL MISMO codigo, o la pantalla saldria
  // en el menu de quien recibe un 404 al pulsarla.
  it('la pantalla exige inventario.consultar y su item de menu declara el mismo permiso (R5, R6)', () => {
    // El codigo se DERIVA del catalogo de `identity`, nunca se escribe a mano: si alguien lo
    // renombrara, esto se pone rojo en vez de quedarse vigilando un permiso inexistente.
    const permiso = PERMISSIONS.find(
      (entrada) => entrada.module === 'inventario' && entrada.action === 'consultar',
    );
    expect(permiso, 'el catalogo de identity deberia tener inventario.consultar').toBeDefined();

    expect(fuenteSinComentarios(PAGE_PATH)).toContain(
      `requirePagePermission('${permiso?.code}')`,
    );

    const enlace = PRIVATE_NAV_ITEMS.filter(
      (item): item is NavLink => item.kind === 'link',
    ).find((item) => item.href === INVENTORY_ROUTE);
    expect(enlace?.permission).toBe(permiso?.code);
  });

  it('la tabla no puede pintar quien creo o modifico un producto, ni su presentacion', () => {
    // Test **en negativo** sobre la fuente. La autoria y la presentacion se mudaron a
    // `product_batches` el 2026-09-09, asi que ya no existen en `ProductView` y no pueden
    // pintarse por ninguna via. La prohibicion se mantiene como guardia: si alguien las
    // reintroduce, el dato aparece y esto se rompe.
    ningunArchivoContiene([
      '.createdBy',
      '.updatedBy',
      "key: 'createdBy'",
      "key: 'updatedBy'",
      "id: 'createdBy'",
      "id: 'updatedBy'",
      "'product-column-createdBy'",
      "'product-column-updatedBy'",
    ]);

    // Y la defensa de tipos sigue en pie: el tipo de columna se DERIVA de `ProductView`
    // excluyendo los campos prohibidos, en vez de ser una union escrita a mano que alguien
    // amplie sin pensar.
    const columnas = fuenteSinComentarios(
      join(COMPONENTES_PATH, 'product-columns.tsx').split('\\').join('/'),
    );
    expect(columnas).toContain('Exclude<keyof ProductView');
    // La unidad es de nuevo una columna propia del producto (`products.unit_id`), asi que el
    // campo oculto vuelve a llamarse `unitId`. Se exige el nombre NUEVO -y ademas que el viejo no
    // reaparezca-: si el centinela se hubiera quedado vigilando `latestBatchUnitId`, el campo
    // actual podria colarse como columna sin que nada se pusiera rojo.
    expect(columnas).toContain("'unitId'");
    expect(columnas).not.toContain("'latestBatchUnitId'");
    expect(columnas).toContain("'imagePath'");
  });

  it('el costo, la compra minima y el tiempo de entrega no se nombran en ningun archivo de la ruta', () => {
    // QC-52 R5 y R6 (derogan la parte de QC-22 R8 que trataba el costo como campo del producto).
    //
    // ACOTADO: hasta QC-52 este caso recorria las lineas que contuvieran `cost` para prohibir que
    // pasaran por coma flotante. Desde que el producto perdio los tres campos no queda ninguna
    // linea que recorrer, y un bucle sobre cero elementos no asegura nada
    // (`docs/verification.md > Que NO cuenta`). Lo que se afirma ahora es EN POSITIVO: la
    // pantalla no los menciona por ninguna via -ni campo, ni oculto, ni columna, ni valor
    // derivado-, que es exactamente lo que R5 y R6 piden.
    // ACOTADO OTRA VEZ EL 2026-09-10: el alta gano el costo del primer LOTE (`unitCost` y
    // `totalCost`, campos de `product_batches`), asi que la palabra `cost` vuelve a aparecer en
    // la ruta -y debe poder aparecer-. Lo que R5 y R6 prohiben no es la palabra: es que el
    // PRODUCTO vuelva a tener costo. Por eso se prohiben los identificadores exactos de aquel
    // campo -`cost` a secas, en cualquiera de las formas en que un campo se nombra aqui- y no la
    // subcadena, que hoy daria un falso positivo sobre el costo del lote.
    ningunArchivoContiene([
      "'cost'",
      '"cost"',
      '`cost`',
      '.cost',
      'product-field-cost',
      'product-hidden-cost',
      'minPurchase',
      'deliveryTime',
    ]);

    // Y sigue sin haber conversion a coma flotante de ningun importe en esta capa.
    ningunArchivoContiene(['parseFloat(', 'toFixed(', 'Number.parseFloat(']);
  });

  it('el desbordamiento horizontal no lo declara ningun archivo de la ruta', () => {
    // R9 — lo absorbe el envoltorio del primitivo `table` (`data-slot=table-container`), que ya
    // trae `overflow-x-auto`. Declararlo aqui significaria un segundo contenedor con scroll, o
    // el scroll en un ancestro, que es justo lo que R9 prohibe.
    ningunArchivoContiene(['overflow-x', 'sticky', 'position: fixed', 'fixed inset']);
  });

  it('la pantalla no ofrece busqueda ni control de orden', () => {
    // R13 — test **en negativo**: el backend solo acepta `page` y `pageSize` y ordena fijo, asi
    // que cualquier buscador de esta capa mentiria (solo filtraria la pagina visible).
    ningunArchivoContiene(['type="search"', 'orderBy', 'sortBy', 'sortDirection', 'filter(']);
  });

  it('el alta y la edicion salen por las Server Actions del catalogo', () => {
    // R18, R28 — y jamas por una ruta de API propia.
    const formulario = fuenteSinComentarios(
      join(COMPONENTES_PATH, 'product-form.tsx').split('\\').join('/'),
    );

    expect(formulario).toContain('createProductAction');
    expect(formulario).toContain('updateProductAction');
    expect(formulario).toContain('@/lib/modules/inventario/adapters/driving/product-actions');
  });

  it('ningun archivo de la ruta usa fetch a rutas API propias', () => {
    // R28 — la prohibicion es de `docs/architecture.md` y de la decision del 2026-09-03.
    ningunArchivoContiene(['fetch(', "'/api/", '"/api/', 'axios', 'XMLHttpRequest']);
  });

  it('el layout privado monta la region de avisos y la pantalla no monta otra', () => {
    // R22 — la region vive en el layout (superando a R36/D9 de QC-11 por decision humana del
    // 2026-09-03). Si cada pantalla montase la suya, habria varias regiones `aria-live`
    // compitiendo por anunciar lo mismo.
    const layout = fuenteSinComentarios(LAYOUT_PRIVADO_PATH);
    expect(layout).toContain('@/components/ui/sonner');
    expect(layout).toContain('<Toaster');

    ningunArchivoContiene(['<Toaster', '@/components/ui/sonner']);
  });

  it('la pantalla no ofrece listar, editar ni borrar presentaciones', () => {
    // R25 — test **en negativo**, y sobre la fuente CRUDA (comentarios incluidos): abrir la
    // gestion de presentaciones es exactamente lo que una feature posterior puede colar aqui, y
    // esa pantalla es QC-45. La unica operacion permitida es el alta desde el selector (R24).
    const prohibidas = ['updatePresentationAction', 'deletePresentationAction'];

    for (const ruta of FUENTES_VIGILADAS) {
      const crudo = leer(ruta);
      for (const prohibida of prohibidas) {
        expect(crudo, `${ruta} no debe nombrar «${prohibida}»`).not.toContain(prohibida);
      }
    }

    // Y las dos que si se usan siguen siendo solo esas dos.
    const selector = fuenteSinComentarios(SELECTOR_PRESENTACION_PATH);
    expect(selector).toContain('listPresentationsAction');
    expect(selector).toContain('createPresentationAction');
  });

  it('los componentes de ruta se exponen por el barrel y no se importan por ruta profunda', () => {
    // R27 — regla del arnes (`docs/architecture.md > Componentes`), y el reviewer la trata como
    // anti-patron si se incumple.
    const barrel = fuenteSinComentarios(BARREL_PATH.split('\\').join('/'));

    // Todos los componentes de la ruta salen por el barrel.
    for (const ruta of FUENTES_DE_LA_RUTA) {
      if (!ruta.includes('/components/') || ruta.endsWith('/index.ts')) continue;
      const nombreDeArchivo = ruta.split('/').pop() as string;
      const modulo = `./${nombreDeArchivo.replace(/\.tsx?$/, '')}`;
      expect(barrel, `el barrel debe reexportar ${modulo}`).toContain(`from '${modulo}'`);
    }

    // La pagina importa SOLO desde el barrel.
    const pagina = fuenteSinComentarios(PAGE_PATH.split('\\').join('/'));
    expect(pagina).toContain("from './components'");
    expect(pagina).not.toContain("from './components/");

    // El barrel NO declara frontera cliente/servidor: eso va en cada componente.
    expect(barrel).not.toContain('use client');

    // Y no queda ningun componente suelto junto a `page.tsx`.
    const raizDeLaRuta = readdirSync(join(RAIZ, CARPETA_RUTA), { withFileTypes: true });
    const archivosDeAppRouter = ['page.tsx', 'layout.tsx', 'loading.tsx', 'error.tsx', 'not-found.tsx'];
    for (const entrada of raizDeLaRuta) {
      if (entrada.isDirectory()) {
        if (entrada.name === NOMBRE_SUBRUTA_IMPORTAR) continue;
        expect(entrada.name, 'la unica carpeta de la ruta es components/').toBe('components');
        continue;
      }
      expect(archivosDeAppRouter, `${entrada.name} no es un archivo del App Router`).toContain(
        entrada.name,
      );
    }
  });

  it('ninguna primitiva se escribe a mano y no entraron dependencias nuevas', () => {
    // R29 — las primitivas vienen del CLI de shadcn/ui. La pantalla no puede rehacer a mano lo
    // que ya existe en `components/ui/`, y la decision del 2026-09-03 (P2) cerro que **no** entra
    // ninguna dependencia nueva.
    for (const primitiva of [
      'table.tsx',
      'select.tsx',
      'alert-dialog.tsx',
      'sheet.tsx',
      // El selector de presentacion se compone con esta desde el 2026-09-07.
      'autocomplete.tsx',
    ]) {
      expect(
        existsSync(join(RAIZ, 'components', 'ui', primitiva)),
        `falta components/ui/${primitiva}`,
      ).toBe(true);
    }

    // Nada de tablas, dialogos ni paneles escritos a mano en la ruta.
    ningunArchivoContiene(['<table', '<dialog', 'role="dialog"', 'createPortal']);

    const packageJson = JSON.parse(leer('package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const instaladas = {
      ...(packageJson.dependencies ?? {}),
      ...(packageJson.devDependencies ?? {}),
    };

    for (const descartada of ['react-hook-form', '@hookform/resolvers']) {
      expect(instaladas, `«${descartada}» quedo descartada el 2026-09-03`).not.toHaveProperty(
        descartada,
      );
    }

    ningunArchivoContiene(['@/components/ui/form', 'react-hook-form', '@hookform/']);
  });

  it('los componentes de cliente no importan composicion ni base de datos', () => {
    // R30 — los datos de catalogo bajan por props desde el Server Component, o salen de una
    // Server Action. Nunca del punto de composicion ni de Prisma.
    expect(FUENTES_DE_CLIENTE.length).toBeGreaterThan(0);

    ningunArchivoContiene(
      ['@/lib/composition', '@prisma/client', 'prisma.', 'supabase', 'next/headers'],
      FUENTES_DE_CLIENTE,
    );
  });

  it('no usa 100vh, ni hover como unica via, y respeta tamanos tactiles y de fuente', () => {
    // R31 — la mitad que jsdom NO puede observar (sin hojas de estilo, un control escondido con
    // `hidden hover:flex` sigue pasando un `toBeVisible()`). Sin excepcion de escritorio
    // declarada: el `design.md` no declara ninguna.
    const utilidadesQueOcultan = ['hidden', 'invisible', 'opacity-0', 'sr-only', 'scale-0'];

    let controlesVigilados = 0;
    const archivosConControles = new Set<string>();

    for (const ruta of FUENTES_VIGILADAS) {
      const codigo = fuenteSinComentarios(ruta);

      expect(codigo, `${ruta} no debe usar 100vh`).not.toContain('100vh');

      for (const linea of codigo.split('\n')) {
        if (!linea.includes('hover:') && !linea.includes('group-hover:')) continue;
        for (const utilidad of utilidadesQueOcultan) {
          expect(
            linea,
            `${ruta}: «hover» no puede ser la unica via de revelar «${utilidad}»`,
          ).not.toContain(utilidad);
        }
      }

      // Area tactil de 44x44 px y 16 px de fuente, **control a control** (R31). Los primitivos
      // miden 32 px de alto y heredan un `text-sm`, asi que ambos hay que forzarlos por clase.
      //
      // Acotado el 2026-09-03: hasta entonces esto se media POR ARCHIVO (`codigo` completo
      // `toContain('min-h-11')`), y una sola aparicion en cualquier parte lo satisfacia. El
      // reviewer lo demostro quitando `TOUCH_TARGET` y `FIELD_TEXT` de un campo ENTERO de
      // `product-form.tsx`: la suite seguia verde. Un test que no falla al romper lo que afirma
      // no cuenta — es el mismo agujero por el que se rechazo QC-30 en su primera ronda.
      const constantesTactiles = constantesTactilesDe(codigo);
      const constantesDeFuente = constantesConLaClase(codigo, 'text-base');

      for (const nombre of CONTROLES_VIGILADOS) {
        const todasLasEtiquetas = etiquetasDeApertura(codigo, nombre, lineasOriginales(ruta));

        // Autocomprobacion: si el archivo escribe la etiqueta, el lector tiene que verla. Sin
        // esto, un fallo del lector dejaria la guardia muda en vez de roja.
        if (codigo.includes(`<${nombre}`)) {
          expect(
            todasLasEtiquetas.length,
            `${ruta}: escribe <${nombre} pero la guardia no leyo ninguna etiqueta`,
          ).toBeGreaterThan(0);
        }

        const etiquetas = todasLasEtiquetas.filter(({ texto }) => vigilaLaEtiqueta(nombre, texto));

        for (const { texto, linea } of etiquetas) {
          const className = valorDeAtributo(texto, 'className');
          const control = `${ruta}:${linea} <${nombre}> (${identificaAlControl(texto)})`;
          controlesVigilados += 1;
          archivosConControles.add(ruta);

          expect(
            llevaLaTallaTactil(texto, className, constantesTactiles),
            `${control} debe forzar el area tactil (touch, touchTarget o min-h-11 en SU className)`,
          ).toBe(true);

          // 16 px en los campos: por debajo, iOS hace zoom al enfocar.
          if (CONTROLES_CON_FUENTE.includes(nombre)) {
            expect(
              llevaLaClase(className, 'text-base', constantesDeFuente),
              `${control} debe fijar 16px en SU className (text-base, literal o via constante local)`,
            ).toBe(true);
          }
        }
      }
    }

    // Y la guardia no puede quedarse sin nada que vigilar: la pantalla renderiza controles.
    expect(controlesVigilados, 'R31 no esta vigilando ningun control').toBeGreaterThan(0);
    expect(archivosConControles.size).toBeGreaterThan(0);
  });

  it('R8 — la talla compartida cuenta como area tactil, y un control sin ninguna forma sigue fallando', () => {
    const codigo = [
      "const FIELD = `${touchTarget} text-base`;",
      "const LOCAL = 'min-h-11 min-w-11';",
    ].join('\n');
    const constantes = constantesTactilesDe(codigo);

    const conLaTalla = [
      '<Button data-testid="eje" touch>',
      '<Button data-testid="eje-explicito" touch={true} variant="outline">',
      '<Button\n  variant="ghost"\n  touch\n  data-testid="multilinea"\n/>',
      '<Input className={`w-full ${touchTarget} text-base`}>',
      '<Input className={FIELD}>',
      '<Input className={LOCAL}>',
      "<Link data-slot=\"button\" className={buttonVariants({ variant: 'outline', touch: true })}>",
      "<Link data-slot=\"button\" className={cn(buttonVariants({ variant: 'outline' }), touchTarget)}>",
    ];
    for (const etiqueta of conLaTalla) {
      expect(
        llevaLaTallaTactil(etiqueta, valorDeAtributo(etiqueta, 'className'), constantes),
        etiqueta,
      ).toBe(true);
    }

    const sinLaTalla = [
      '<Button data-testid="sin-eje" variant="outline">',
      '<Button data-testid="ontouch" ontouchstart={f}>',
      '<Input className="w-full text-base">',
      "<Link data-slot=\"button\" className={buttonVariants({ variant: 'outline', touch: false })}>",
    ];
    for (const etiqueta of sinLaTalla) {
      expect(
        llevaLaTallaTactil(etiqueta, valorDeAtributo(etiqueta, 'className'), constantes),
        etiqueta,
      ).toBe(false);
    }
  });

  it('la feature no duplica el armazon heredado: solo edita los cuatro archivos autorizados', () => {
    // R32 — el choque entre las features 4 y 10 ya ocurrio una vez en este repo. Lo que se
    // vigila no es «no tocar nada», es **no re-crear** lo que ya esta mergeado.
    expect(existsSync(join(RAIZ, LAYOUT_PRIVADO_PATH))).toBe(true);
    expect(existsSync(join(RAIZ, 'components', 'private', 'app-sidebar.tsx'))).toBe(true);

    // La ruta no trae su propio layout, ni su sidebar, ni su copia de las primitivas.
    for (const ruta of FUENTES_DE_LA_RUTA) {
      expect(ruta, 'la ruta no declara su propio layout').not.toContain('/layout.tsx');
      expect(ruta, 'la ruta no re-crea la barra lateral').not.toContain('sidebar');
    }

    // Y no se declara un segundo `main`: `SidebarInset` del layout privado ya lo es.
    ningunArchivoContiene(['<main', 'SidebarInset', 'SidebarProvider', 'AppSidebar']);

    // Un solo layout privado y un solo declarante de la navegacion privada.
    expect(
      fuentesBajo(join('app', '(private)')).filter((ruta) => ruta.endsWith('/layout.tsx')),
    ).toHaveLength(1);
    expect(
      fuentesBajo('lib').filter((ruta) =>
        fuenteSinComentarios(ruta).includes('export const PRIVATE_NAV_ITEMS'),
      ),
    ).toHaveLength(1);
  });
});
