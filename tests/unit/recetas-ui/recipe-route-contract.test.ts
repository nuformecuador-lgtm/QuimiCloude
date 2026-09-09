import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { PERMISSIONS } from '@/lib/modules/identity';
import { PRIVATE_NAV_ITEMS, type NavLink } from '@/lib/shared/navigation/private-nav';
import { FORMULAS_ROUTE, NEW_RECIPE_ROUTE, recipeEditRoute } from '@/lib/shared/routes';

/**
 * Contrato de la ruta de recetas: R3, R7, R9, R10, R14, R18, R22, R25, R28, R29, R43, R44, R45,
 * R46, R47, R48, R49, R50 y R51 (`specs/QC-26-pantalla-de-recetas/tasks.md > T22`).
 *
 * **Guardias de codigo, sin DOM**, mismo patron que
 * `tests/unit/inventario/product-route-contract.test.ts` y
 * `tests/unit/dashboard-route-contract.test.ts`. Todo lo que esta feature promete **no hacer**
 * -no incrustar la ruta, no repetir la autorizacion, no invocar el detalle desde la lista, no
 * filtrar en cliente, no convertir la cantidad a numero, no colar el CRUD de unidades ni tocar
 * `recetas` o `db/`, no montar un segundo `<Toaster/>`, no reinventar primitivas- es invisible
 * renderizando: si manana la pantalla empezase a hacer cualquiera de esas cosas, ningun assert de
 * DOM se pondria rojo. De ahi este archivo.
 *
 * **Diferencia con el precedente de inventario**: esta ruta tiene subrutas propias (`nueva/` y
 * `[id]/`), asi que «la unica carpeta de la ruta es components/» no vale aqui: las carpetas
 * legitimas son `components`, `nueva` y `[id]`, y eso es lo que se afirma explicitamente.
 */

const RAIZ = join(__dirname, '..', '..', '..');

/** Carpeta de la ruta, **derivada de la constante** (R3). El route group `(private)` no aporta
 *  segmento de URL. */
const CARPETA_RUTA = join('app', '(private)', FORMULAS_ROUTE.replace(/^\//, ''));
const PAGE_PATH = join(CARPETA_RUTA, 'page.tsx');
const COMPONENTES_PATH = join(CARPETA_RUTA, 'components');
const BARREL_PATH = join(COMPONENTES_PATH, 'index.ts');

/** Subrutas de alta y edicion. El alta se deriva del sufijo de `NEW_RECIPE_ROUTE`; la carpeta de
 *  edicion es `[id]` por convencion de Next.js -el App Router exige corchetes, y ningun literal
 *  de identificador puede sustituirlos-. */
const NUEVA_SUFIJO = NEW_RECIPE_ROUTE.slice(FORMULAS_ROUTE.length + 1);
const CARPETA_NUEVA = join(CARPETA_RUTA, NUEVA_SUFIJO);
const PAGE_NUEVA_PATH = join(CARPETA_NUEVA, 'page.tsx');
const CARPETA_EDICION = join(CARPETA_RUTA, '[id]');
const PAGE_EDICION_PATH = join(CARPETA_EDICION, 'page.tsx');

/** El layout privado, unico archivo heredado de la zona privada que R51 autoriza a tocar (junto
 *  con `routes.ts`, `private-nav.ts` y `lib/composition/index.ts`; la lista ruta->rol que tambien
 *  se nombraba aqui se retiro en QC-75). */
const LAYOUT_PRIVADO_PATH = join('app', '(private)', 'layout.tsx');

/** El literal de la ruta, en las tres comillas en las que se puede escribir. */
const LITERALES_DE_RUTA = [`'${FORMULAS_ROUTE}'`, `"${FORMULAS_ROUTE}"`, `\`${FORMULAS_ROUTE}`];

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
 * fallo apuntaria a una linea que no existe en el archivo que hay que abrir.
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

/** La misma ruta con separadores de posix: `fuentesBajo` las devuelve asi tambien en Windows. */
function enRutaDePosix(ruta: string): string {
  return ruta.split(sep).join('/');
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

/** Los archivos de la ruta completa: las tres `page.tsx` y todos los componentes propios. */
const FUENTES_DE_LA_RUTA = fuentesBajo(CARPETA_RUTA);

/** Solo los archivos de la LISTA -R10 ampliado exige que ninguno de estos lleve el marcador ni el
 *  aviso de linea con producto de baja, esa senal es solo del formulario-. */
const ARCHIVOS_DE_LA_LISTA = [
  join(COMPONENTES_PATH, 'recipe-columns.ts'),
  join(COMPONENTES_PATH, 'recipe-table.tsx'),
  join(COMPONENTES_PATH, 'recipe-table-skeleton.tsx'),
  join(COMPONENTES_PATH, 'recipe-list-empty.tsx'),
  join(COMPONENTES_PATH, 'recipe-list-error.tsx'),
  join(COMPONENTES_PATH, 'recipe-list-params.ts'),
  join(COMPONENTES_PATH, 'recipe-list-section.tsx'),
  join(COMPONENTES_PATH, 'recipe-list-toolbar.tsx'),
  join(COMPONENTES_PATH, 'delete-recipe-dialog.tsx'),
  PAGE_PATH,
].map((ruta) => ruta.split('\\').join('/'));

/**
 * EXCEPCION UNICA Y NOMBRADA a la regla «todo archivo de `components/` sale por el barrel» (R46).
 *
 * `recipe-step-schema.ts` (QC-64) es el unico archivo de la carpeta cuyo simbolo publico tiene un
 * tipo **de la libreria del editor**: `RECIPE_STEP_EXTENSIONS` es un `Extensions` de
 * `@tiptap/core`. Reexportarlo desde el barrel deja escapar ese tipo por una puerta que la
 * guardia de aislamiento no ve —`tests/guards/guard-editor-aislado.test.ts` compara el literal
 * `@tiptap`, y el barrel no lo escribe—, de modo que cualquier archivo del repo podria acabar
 * dependiendo de la libreria sin nombrarla. R25 y `specs/QC-64-editor-y-lectura-de-pasos/design.md
 * > 7` exigen lo contrario: que la libreria viva en DOS archivos y que sustituirla sea reescribir
 * esos dos. Su unico consumidor legitimo es `recipe-step-editor.tsx`, en la misma carpeta, por
 * ruta relativa; el barrel si exporta `RecipeStepEditor`, que es lo que el resto de la ruta usa.
 *
 * La regla general sigue mordiendo para TODOS los demas archivos de `components/`: esta lista es
 * por NOMBRE, no un patron. Y `tests/guards/guard-editor-aislado.test.ts` tiene un caso que se
 * pone rojo si el reexport vuelve a entrar.
 */
const FUERA_DEL_BARREL = ['recipe-step-schema.ts'];

/** Los que declaran frontera de cliente. R50 y R49 van sobre estos. */
const FUENTES_DE_CLIENTE = FUENTES_DE_LA_RUTA.filter((ruta) => leer(ruta).includes("'use client'"));

/**
 * Los controles que R50 obliga a agrandar. Se buscan como **etiqueta de apertura JSX**
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
 * Los que ademas fijan 16 px en SU className. Son los que el usuario LEE mientras escribe o
 * elige: el campo de texto y cada opcion del desplegable.
 *
 * `AutocompleteInput` y `AutocompleteItem` entraron el 2026-09-07, cuando el selector de
 * ingrediente paso de un desplegable escrito a mano a los primitivos de
 * `components/ui/autocomplete.tsx`: sin anadirlos aqui, el campo mas usado de la pantalla se
 * habria salido de la guardia del area tactil por un simple cambio de nombre de etiqueta.
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
 * varias lineas o lleve `className={`${A} ${B}`}`.
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
 * Constantes locales de cadena cuyo valor contiene `clase`. Los componentes agrupan la clase
 * (`const TOUCH_TARGET = 'min-h-11 min-w-11'`), asi que resolver `min-h-11` a ojo sobre el
 * `className` daria falsos rojos.
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

/** Como se nombra un control en el mensaje de fallo, para no obligar a buscarlo a mano. */
function identificaAlControl(etiqueta: string): string {
  return (
    valorDeAtributo(etiqueta, 'data-testid') ??
    valorDeAtributo(etiqueta, 'aria-label') ??
    valorDeAtributo(etiqueta, 'id') ??
    'sin identificador'
  );
}

/** Comprueba que ningun archivo de la lista dada contiene ninguno de los textos prohibidos. */
function ningunArchivoContiene(prohibidos: readonly string[], fuentes = FUENTES_DE_LA_RUTA) {
  for (const ruta of fuentes) {
    const codigo = fuenteSinComentarios(ruta);
    for (const prohibido of prohibidos) {
      expect(codigo, `${ruta} no debe contener «${prohibido}»`).not.toContain(prohibido);
    }
  }
}

describe('contrato de la ruta de recetas', () => {
  it('las tres rutas existen donde las ubican FORMULAS_ROUTE, NEW_RECIPE_ROUTE y recipeEditRoute', () => {
    // R3 — las tres rutas esperadas se DERIVAN de la constante, no se escriben a mano.
    expect(existsSync(join(RAIZ, PAGE_PATH)), `deberia existir ${PAGE_PATH}`).toBe(true);
    expect(existsSync(join(RAIZ, BARREL_PATH)), `deberia existir ${BARREL_PATH}`).toBe(true);

    expect(NEW_RECIPE_ROUTE).toBe(`${FORMULAS_ROUTE}/nueva`);
    expect(existsSync(join(RAIZ, PAGE_NUEVA_PATH)), `deberia existir ${PAGE_NUEVA_PATH}`).toBe(
      true,
    );

    expect(recipeEditRoute('sonda-de-prueba')).toBe(`${FORMULAS_ROUTE}/sonda-de-prueba`);
    expect(existsSync(join(RAIZ, PAGE_EDICION_PATH)), `deberia existir ${PAGE_EDICION_PATH}`).toBe(
      true,
    );

    expect(FUENTES_DE_LA_RUTA.length).toBeGreaterThan(1);
  });

  it('ningun archivo de produccion incrusta el literal de la ruta y private-nav reexporta, no redeclara', () => {
    // R3 — el literal existe en UN solo sitio del repo: la constante.
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

    expect(leer('lib/shared/routes.ts')).toContain('export const FORMULAS_ROUTE');

    // `private-nav.ts` REEXPORTA la constante -no la redeclara-.
    expect(fuenteSinComentarios('lib/shared/navigation/private-nav.ts')).not.toContain(
      'const FORMULAS_ROUTE =',
    );
    expect(leer('lib/shared/navigation/private-nav.ts')).toContain('export { FORMULAS_ROUTE }');

    // El item del sidebar y el prefijo privado apuntan a la misma constante.
    const enlaces = PRIVATE_NAV_ITEMS.filter((item): item is NavLink => item.kind === 'link');
    const recetasComoHijo = PRIVATE_NAV_ITEMS.flatMap((item) =>
      item.kind === 'group' ? item.items : [item],
    ).filter((item): item is NavLink => item.kind === 'link' && item.href === FORMULAS_ROUTE);
    expect([...enlaces, ...recetasComoHijo].some((enlace) => enlace.href === FORMULAS_ROUTE)).toBe(
      true,
    );
  });

  it('la pantalla no repite la comprobacion de permiso ni decide autorizacion sobre los datos', () => {
    // R7 — la autorizacion sobre los datos la aportan los casos de uso de `recetas`; la pantalla
    // solo exige el permiso de consulta con `requirePagePermission` (el caso de abajo). Comparar
    // permisos a mano o resolver la sesion aqui seria una tercera regla que nadie mantiene
    // sincronizada.
    ningunArchivoContiene([
      'requireAdmin',
      // QC-74: el envoltorio se llama asi desde T10; la prohibicion vale igual. Ojo: NO alcanza a
      // `requirePagePermission`, que es otro identificador y es justo lo que las paginas deben
      // llamar (QC-75 R6).
      'requirePermission(',
      'getSessionUser',
      'ADMIN_ROLE_NAME',
      'decideRouteAccess',
      'next/headers',
    ]);
  });

  // QC-75 T12 — sustituye a la afirmacion «hay una fila {prefix: FORMULAS_ROUTE,
  // roles:[Administrador]} en la lista ruta->rol». Esa lista se retiro (QC-75 R16): quien puede ver
  // estas pantallas lo decide el permiso que ellas mismas exigen (R6) y el que declara su item de
  // menu (R5), que tienen que ser EL MISMO codigo. Se deriva del catalogo, no se escribe a mano.
  it('las tres pantallas exigen recetas.consultar y el item de menu declara ese mismo permiso (QC-75 R5, R6)', () => {
    const permiso = PERMISSIONS.find(
      (entrada) => entrada.module === 'recetas' && entrada.action === 'consultar',
    );
    expect(permiso, 'el catalogo de identity deberia tener recetas.consultar').toBeDefined();

    for (const pagina of [PAGE_PATH, PAGE_NUEVA_PATH, PAGE_EDICION_PATH]) {
      expect(fuenteSinComentarios(pagina), `${pagina} deberia exigir su permiso`).toContain(
        `requirePagePermission('${permiso?.code}')`,
      );
    }

    const enlace = PRIVATE_NAV_ITEMS.flatMap((item) =>
      item.kind === 'group' ? item.items : [item],
    ).find((item): item is NavLink => item.kind === 'link' && item.href === FORMULAS_ROUTE);
    expect(enlace?.permission).toBe(permiso?.code);
  });

  it('la lista no puede pintar quien creo o modifico una receta', () => {
    // R9 — test **en negativo** sobre la fuente: lo prohibido es LEERLO o DECLARARLO como
    // columna, no nombrarlo -la declaracion de columnas nombra los dos campos justamente para
    // EXCLUIRLOS del tipo, y una prohibicion ciega borraria esa defensa al primer cambio-.
    ningunArchivoContiene([
      '.createdBy',
      '.updatedBy',
      "key: 'createdBy'",
      "key: 'updatedBy'",
      "'recipe-column-createdBy'",
      "'recipe-column-updatedBy'",
    ]);

    const columnas = fuenteSinComentarios(
      join(COMPONENTES_PATH, 'recipe-columns.ts').split('\\').join('/'),
    );
    expect(columnas).toContain('Exclude<keyof RecipeSummary');
    expect(columnas).toContain("'createdBy'");
    expect(columnas).toContain("'updatedBy'");
  });

  it('pintar una pagina de lista cuesta una sola invocacion de listado y ningun archivo de la lista lleva la marca de producto de baja', () => {
    // R10 ampliado — la senal de producto dado de baja existe SOLO en el formulario. Si estos
    // dos `data-testid` aparecieran en cualquier archivo de la lista, la lista estaria pintando
    // algo que solo el formulario puede saber sin romper R10 (una consulta de detalle por fila).
    ningunArchivoContiene(
      ['recipe-line-unavailable', 'recipe-lines-unavailable-notice'],
      ARCHIVOS_DE_LA_LISTA,
    );

    // Ningun archivo de la lista invoca la operacion de detalle.
    ningunArchivoContiene(['getRecipeAction'], ARCHIVOS_DE_LA_LISTA);

    // Y la operacion de listado se invoca una sola vez en TODA la ruta.
    let invocacionesDeListado = 0;
    for (const ruta of FUENTES_DE_LA_RUTA) {
      const veces = fuenteSinComentarios(ruta).split('listRecipesAction(').length - 1;
      invocacionesDeListado += veces;
    }
    expect(invocacionesDeListado, 'listRecipesAction debe invocarse una sola vez en toda la ruta').toBe(
      1,
    );
  });

  it('la pantalla no ofrece busqueda ni control de orden configurable', () => {
    // R14 — test **en negativo**: el backend solo acepta `page` y `pageSize` y ordena fijo.
    ningunArchivoContiene(['type="search"', 'orderBy', 'sortBy', 'sortDirection']);
  });

  it('la imagen se pinta con la direccion que entrega la consulta y ningun archivo compone una URL de almacenamiento', () => {
    // R18 — nada de variables de entorno de storage, ni concatenacion, ni cliente de Supabase.
    ningunArchivoContiene(['process.env', 'NEXT_PUBLIC_SUPABASE', 'supabase', '.storage.']);

    const tabla = fuenteSinComentarios(join(COMPONENTES_PATH, 'recipe-table.tsx').split('\\').join('/'));
    expect(tabla).toContain('recipe.imageUrl');
    expect(tabla).not.toContain('${recipe.imageUrl}');
  });

  it('el guardado sale por createRecipeAction o updateRecipeAction y no existe ninguna operacion por linea ni por paso', () => {
    // R22 — el contrato de `recetas` no publica operaciones por linea ni por paso; el guardado es
    // SIEMPRE la lista final completa en una sola invocacion.
    const formulario = fuenteSinComentarios(
      join(COMPONENTES_PATH, 'recipe-form.tsx').split('\\').join('/'),
    );
    expect(formulario).toContain('createRecipeAction');
    expect(formulario).toContain('updateRecipeAction');

    // Todas las invocaciones de "algo Action(" en la ruta son de las siete operaciones publicadas
    // por `recetas`, `inventario` y `unidades` -ninguna operacion por linea ni por paso existe-.
    const permitidas = new Set([
      'createRecipeAction',
      'updateRecipeAction',
      'deleteRecipeAction',
      'getRecipeAction',
      'listRecipesAction',
      'listProductsAction',
      'listUnitsAction',
    ]);

    for (const ruta of FUENTES_DE_LA_RUTA) {
      const codigo = fuenteSinComentarios(ruta);
      const patron = /([A-Za-z][A-Za-z0-9_]*Action)\(/g;
      let encaje: RegExpExecArray | null;
      while ((encaje = patron.exec(codigo)) !== null) {
        expect(
          permitidas.has(encaje[1]),
          `${ruta}: «${encaje[1]}» no es una de las siete operaciones publicadas`,
        ).toBe(true);
      }
    }
  });

  it('el layout privado monta la region de avisos y la ruta no monta otra', () => {
    // R25 — la region vive en el layout; montar otra aqui competiria por anunciar lo mismo.
    const layout = fuenteSinComentarios(LAYOUT_PRIVADO_PATH);
    expect(layout).toContain('@/components/ui/sonner');
    expect(layout).toContain('<Toaster');

    ningunArchivoContiene(['<Toaster', '@/components/ui/sonner']);
  });

  it('el selector de producto no filtra en cliente y pide el tamano de pagina importado', () => {
    // R28 — nunca `.filter(` por texto sobre la lista de productos descargada.
    const selector = fuenteSinComentarios(
      join(COMPONENTES_PATH, 'product-picker.tsx').split('\\').join('/'),
    );
    expect(selector).not.toContain('.filter(');
    expect(selector).toContain('listProductsAction({ page');
    expect(selector).toContain('pageSize: MAX_PAGE_SIZE');
    expect(selector).not.toMatch(/pageSize:\s*25/);

    ningunArchivoContiene(['.filter('], [
      join(COMPONENTES_PATH, 'product-picker.tsx').split('\\').join('/'),
    ]);
  });

  it('la cantidad nunca se convierte a numero en ningun archivo de la ruta', () => {
    // R29 — la cantidad viaja como cadena decimal tal cual la escribio el usuario.
    ningunArchivoContiene(['parseFloat(', 'Number.parseFloat(', 'toFixed(']);

    for (const ruta of FUENTES_DE_LA_RUTA) {
      for (const linea of fuenteSinComentarios(ruta).split('\n')) {
        if (!linea.includes('quantity')) continue;
        expect(linea, `${ruta}: la cantidad no puede pasar por «Number(»`).not.toContain('Number(');
      }
    }

    // El control PASO A SER `type="number"` por decision humana del 2026-09-08, asi que este
    // test ya no veta ese literal. Lo que R29 protege de verdad NO cambio y se sigue afirmando
    // arriba: la cantidad no se parsea, no se redondea y no pasa por coma flotante en ningun
    // punto de la ruta. Cambio el widget, no el tipo del dato.
  });

  it('la pantalla obtiene las unidades solo por listUnitsAction y ninguna operacion de escritura de unidades entra en esta feature', () => {
    // R43 — sin consulta directa a la tabla de unidades, sin ruta profunda al modulo, sin
    // instanciar su adaptador. R44 — el CRUD de unidades es QC-38: esta ficha SOLO lee.
    ningunArchivoContiene([
      'createUnit',
      'updateUnit',
      'deleteUnit',
      'renameUnit',
      'unit-catalog-prisma',
      'unit-prisma',
      'prisma.unit',
    ]);

    const paginaAlta = fuenteSinComentarios(PAGE_NUEVA_PATH.split('\\').join('/'));
    const paginaEdicion = fuenteSinComentarios(PAGE_EDICION_PATH.split('\\').join('/'));
    expect(paginaAlta).toContain('listUnitsAction');
    expect(paginaEdicion).toContain('listUnitsAction');
  });

  it('la feature no toca lib/modules/recetas ni db/', () => {
    // R44 — la feature amplia `unidades` y `lib/shared`/`lib/composition` en los puntos que R51
    // autoriza, pero no toca el modulo de recetas -ya `done`, QC-25- ni el esquema de datos.
    let diff: string[] = [];
    try {
      const salida = execSync('git diff --name-only origin/dev...HEAD', {
        cwd: RAIZ,
        encoding: 'utf8',
      });
      diff = salida.split('\n').map((linea) => linea.trim()).filter((linea) => linea.length > 0);
    } catch {
      // El rango no esta disponible. NO se deja en verde: `diff` queda vacio a proposito y la
      // asercion de abajo pone el caso ROJO diciendolo. Un entorno sin `origin/dev` alcanzable
      // no es un entorno donde esta guardia se cumpla: es uno donde no se ha comprobado nada.
      diff = [];
    }

    // Esta rama cambia decenas de archivos: un diff vacio significa que el rango no estaba
    // disponible, no que no haya cambios. Sin esto el caso podia acabar en verde sin haber
    // mirado un solo archivo.
    expect(
      diff.length,
      'el rango git origin/dev...HEAD no estaba disponible: este caso no ha comprobado nada',
    ).toBeGreaterThan(0);

    // RETENSADO 2026-09-04 (QC-34). Las dos listas permitidas dejan de estar VACIAS y pasan a
    // tener entradas NOMBRADAS UNA A UNA. No es un aflojamiento: la premisa vieja -«esta rama
    // no cambia nada de `recetas` ni de `db/`»- cayo por dos requisitos de QC-34, y lo que
    // este caso protegia de verdad -que nada MAS se toque por la puerta de atras- sigue
    // vigilado, porque cualquier archivo fuera de estas listas pone el caso rojo.
    //
    // POR QUE `recetas` cambia: QC-34 R43/R44 necesitan el nombre de la receta de un pedido,
    // incluida la dada de BAJA, y QC-33 R32 le prohibe a `pedidos` consultar `prisma.recipe`
    // -exige que «todo lo que sepa de una receta le llegue por los contratos publicos, que
    // DEBEN publicarlo»-. Publicar eso es, por definicion, trabajo DENTRO de `recetas`. Es el
    // mismo criterio y las mismas tres rutas que ya se anotaron en
    // `tests/unit/recetas/module-contract.test.ts`. El repositorio, los casos de uso, la
    // Server Action y el adaptador de almacenamiento de QC-25 siguen CONGELADOS.
    const AMPLIACION_RECETAS_QC34 = [
      // El barrel gana DOS reexportaciones de tipo (`RecipeCatalog`, `RecipeRef`).
      'lib/modules/recetas/index.ts',
      // El contrato de catalogo, que ya existia con `RecipeId` desde QC-33, gana los dos tipos.
      'lib/modules/recetas/domain/recipe-catalog.ts',
      // Y su implementacion, adaptador driven NUEVO -no toca `recipe-prisma.ts`-.
      'lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma.ts',
    ];

    // RETENSADO 2026-09-07 (QC-74 T10), con el mismo criterio que los dos retensados de abajo:
    // el rango `origin/dev...HEAD` mide la rama que corre el gate, no la de QC-34, asi que cada
    // cambio legitimo posterior se NOMBRA uno a uno o el caso deja de vigilar nada. QC-74
    // sustituye la pregunta de autorizacion —«es Administrador»— por «tiene este permiso» en los
    // CINCO casos de uso de `recetas` (R12, R16, R18). Son exactamente estos siete archivos: el
    // envoltorio del actor, los cinco casos de uso y el adaptador driving que arma el actor con
    // `permissions`. El repositorio, el adaptador de almacenamiento y el catalogo siguen
    // congelados, y `index.ts` ya estaba nombrado arriba (QC-74 solo renombra un export suyo).
    const AUTORIZACION_POR_PERMISO_QC74 = [
      'lib/modules/recetas/domain/actor.ts',
      'lib/modules/recetas/domain/errors.ts',
      'lib/modules/recetas/domain/get-recipe.ts',
      'lib/modules/recetas/domain/list-recipes.ts',
      'lib/modules/recetas/domain/create-recipe.ts',
      'lib/modules/recetas/domain/update-recipe.ts',
      'lib/modules/recetas/domain/delete-recipe.ts',
      'lib/modules/recetas/adapters/driving/recipe-actions.ts',
    ];

    // RETENSADO 2026-09-08 (QC-70 T14), con el MISMO criterio que los retensados de QC-34 y
    // QC-74 de arriba: el rango `origin/dev...HEAD` mide la rama que corre el gate, asi que
    // cada cambio legitimo posterior se NOMBRA uno a uno o el caso deja de vigilar nada.
    //
    // QC-70 centraliza el catalogo de errores y, por decision cerrada, MIGRA los cinco modulos:
    // `recetas` incluido. Los siete archivos que toca ya estan nombrados arriba —los cinco casos
    // de uso, `errors.ts`, `recipe-actions.ts` e `index.ts`, todos en las listas de QC-34 y
    // QC-74—, asi que aqui solo hace falta UNO mas.
    //
    // Y ese uno **no cambia una linea de codigo**: `recipe-prisma.ts` sigue congelado en su
    // comportamiento —la misma traduccion de `P2002`, el mismo `RECIPE_NAME_UNIQUE_COLUMN`, la
    // misma consulta—. Lo unico que cambia son DOS COMENTARIOS que nombraban
    // `DuplicateNameError`, clase que QC-70 renombro a `RecipeDuplicateNameError`. La
    // alternativa era dejar en el repositorio el nombre de una clase que ya no existe, que es
    // peor: un comentario que miente envejece igual que el codigo y nadie lo compila.
    const RENOMBRADO_DE_COMENTARIOS_QC70 = [
      'lib/modules/recetas/adapters/driven/persistence/recipe-prisma.ts',
    ];

    // POR QUE `db/` cambia: QC-34 decision cerrada 3 anade el cuarto estado `CANCELADO`, y eso
    // es una migracion del tipo enumerado (R48, R49, R50) con su columna de motivo. La carpeta
    // de migracion es EXACTAMENTE UNA y esta nombrada; el esquema solo gana la columna nueva.
    // Ninguna otra migracion, ningun otro archivo de `db/`.
    const MIGRACION_QC34 = [
      'db/schema.prisma',
      'db/migrations/20260904135210_order_cancellation/migration.sql',
      'db/migrations/20260904135210_order_cancellation/down.sql',
    ];

    // RETENSADO 2026-09-04 (QC-47), con el mismo criterio que el retensado de QC-34 de arriba
    // y por la misma razon: QC-34 esta MERGEADA en `dev`, asi que el rango `origin/dev...HEAD`
    // ya no mide la rama de QC-34 sino la rama que este corriendo el gate. La premisa que este
    // caso protege -«por la puerta de atras no se toca `db/` ni `recetas`»- se mantiene solo si
    // cada migracion legitima posterior se NOMBRA una a una. La de QC-47 crea `companies` y la
    // columna `users.company_id`: nada de recetas, nada de unidades. Cualquier OTRO archivo de
    // `db/` sigue poniendo el caso rojo.
    const MIGRACION_QC47 = [
      'db/migrations/20260904180600_companies_and_user_company/migration.sql',
      'db/migrations/20260904180600_companies_and_user_company/down.sql',
    ];

    // RETENSADO 2026-09-07, con el MISMO criterio que los dos retensados de arriba: el rango
    // `origin/dev...HEAD` mide la rama que corre el gate, asi que cada migracion legitima
    // posterior se NOMBRA una a una o el caso deja de vigilar nada.
    //
    // Aqui se nombran DOS, y no es una eleccion: las dos entraron en `dev` y las dos son
    // legitimas. Quedarse con una sola -que es lo que proponia cada lado del conflicto del
    // merge de QC-74- habria puesto el caso rojo por la otra.
    //
    //  1. La decision humana de quitar la unidad y el precio unitario del pedido, que dropea dos
    //     columnas de `orders`. No toca recetas, ni unidades, ni ninguna otra tabla.
    //  2. QC-74, que introduce el catalogo de permisos: crea `permissions` y `role_permissions`
    //     -con su RLS y su `down.sql`- y nada mas (`design.md > 1.3`). Ni recetas, ni unidades,
    //     ni pedidos.
    //
    // Cualquier OTRO archivo de `db/` sigue poniendo este caso rojo.
    const MIGRACIONES_LEGITIMAS = [
      'db/migrations/20260907120000_orders_drop_unit_and_unit_price/migration.sql',
      'db/migrations/20260907120000_orders_drop_unit_and_unit_price/down.sql',
      'db/migrations/20260907183034_permissions_and_role_permissions/migration.sql',
      'db/migrations/20260907183034_permissions_and_role_permissions/down.sql',
    ];

    // RETENSADO 2026-09-08 (QC-83), con el MISMO criterio que los tres retensados de arriba: el
    // rango `origin/dev...HEAD` mide la rama que corre el gate, no la de QC-34, asi que cada
    // migracion legitima posterior se NOMBRA una a una o el caso deja de vigilar nada.
    //
    // POR QUE `db/` cambia aqui: QC-83 crea `work_groups` y `work_group_members` en el modulo
    // `identity`, con su `down.sql`. No toca recetas, ni unidades, ni pedidos.
    //
    // La UNICA modificacion sobre una tabla preexistente es el indice unico
    // `users_id_company_id_key` que anade a `users` -la clave que las nuevas tablas necesitan para
    // referenciar al miembro dentro de su empresa-, aprobado por el humano (R23). Ninguna columna
    // de `users` cambia: ni se anade, ni se dropea, ni se altera.
    //
    // Cualquier OTRO archivo de `db/` sigue poniendo este caso rojo.
    const MIGRACION_QC83 = [
      'db/migrations/20260908210000_work_groups_and_members/migration.sql',
      'db/migrations/20260908210000_work_groups_and_members/down.sql',
    ];

    const tocaRecetas = diff
      .filter((ruta) => ruta.startsWith('lib/modules/recetas/'))
      .filter((ruta) => !AMPLIACION_RECETAS_QC34.includes(ruta))
      .filter((ruta) => !AUTORIZACION_POR_PERMISO_QC74.includes(ruta))
      .filter((ruta) => !RENOMBRADO_DE_COMENTARIOS_QC70.includes(ruta));
    const tocaDb = diff
      .filter((ruta) => ruta.startsWith('db/'))
      .filter((ruta) => !MIGRACION_QC34.includes(ruta))
      .filter((ruta) => !MIGRACION_QC47.includes(ruta))
      .filter((ruta) => !MIGRACIONES_LEGITIMAS.includes(ruta))
      .filter((ruta) => !MIGRACION_QC83.includes(ruta));
    expect(
      tocaRecetas,
      'ningun archivo de lib/modules/recetas/ fuera de la ampliacion de contrato de QC-34 deberia estar en el diff',
    ).toEqual([]);
    expect(
      tocaDb,
      'ningun archivo de db/ fuera de la migracion de cancelacion de QC-34 deberia estar en el diff',
    ).toEqual([]);
  });

  it('package.json solo incorpora los tres paquetes de arrastre aprobados y sus filas declaran el check fallido', () => {
    // R45 — la excepcion es del 2026-09-03 y su porque queda escrito en `docs/dependencias.md`.
    const packageJson = JSON.parse(leer('package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const instaladas = {
      ...(packageJson.dependencies ?? {}),
      ...(packageJson.devDependencies ?? {}),
    };

    for (const paquete of ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities']) {
      expect(instaladas, `deberia estar instalado «${paquete}»`).toHaveProperty(paquete);
    }

    const dependencias = leer('docs/dependencias.md');
    for (const paquete of ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities']) {
      const fila = dependencias
        .split('\n')
        .find((linea) => linea.includes(`\`${paquete}\``));
      expect(fila, `deberia existir la fila de «${paquete}» en docs/dependencias.md`).toBeDefined();
      expect(fila).toContain('excepcion');
      expect(fila).toContain('CHECK 2');
    }

    // `@dnd-kit` solo se importa desde `recipe-steps-field.tsx`.
    const conDndKit: string[] = [];
    for (const ruta of FUENTES_DE_LA_RUTA) {
      if (fuenteSinComentarios(ruta).includes('@dnd-kit')) conDndKit.push(ruta);
    }
    expect(conDndKit).toEqual([join(COMPONENTES_PATH, 'recipe-steps-field.tsx').split('\\').join('/')]);
  });

  it('los componentes de ruta se exponen por el barrel, las tres paginas importan solo del barrel y no queda ningun componente suelto', () => {
    // R46 — regla del arnes (`docs/architecture.md > Componentes`).
    const barrel = fuenteSinComentarios(BARREL_PATH.split('\\').join('/'));

    for (const ruta of FUENTES_DE_LA_RUTA) {
      if (!ruta.includes('/components/') || ruta.endsWith('/index.ts')) continue;
      const nombreDeArchivo = ruta.split('/').pop() as string;
      if (FUERA_DEL_BARREL.includes(nombreDeArchivo)) {
        // La excepcion es EXPLICITA y se comprueba en los dos sentidos: el archivo no puede
        // salir por el barrel, y sigue teniendo que existir. Asi la excepcion no se convierte en
        // una via para dejar de exponer componentes sin que nadie se entere.
        const modulo = `./${nombreDeArchivo.replace(/\.tsx?$/, '')}`;
        expect(
          existsSync(join(RAIZ, ruta)),
          `${nombreDeArchivo} figura como excepcion del barrel pero ya no existe: si se ha ` +
            'borrado o renombrado, quita tambien la excepcion',
        ).toBe(true);
        expect(
          barrel,
          `${nombreDeArchivo} NO puede reexportarse desde el barrel (ver FUERA_DEL_BARREL)`,
        ).not.toContain(`from '${modulo}'`);
        continue;
      }
      const modulo = `./${nombreDeArchivo.replace(/\.tsx?$/, '')}`;
      expect(barrel, `el barrel debe reexportar ${modulo}`).toContain(`from '${modulo}'`);
    }

    // Las TRES paginas importan SOLO desde el barrel, nunca por ruta profunda.
    const paginaLista = fuenteSinComentarios(PAGE_PATH.split('\\').join('/'));
    expect(paginaLista).toContain("from './components'");
    expect(paginaLista).not.toContain("from './components/");

    const paginaNueva = fuenteSinComentarios(PAGE_NUEVA_PATH.split('\\').join('/'));
    expect(paginaNueva).toContain("from '../components'");
    expect(paginaNueva).not.toContain("from '../components/");

    const paginaEdicion = fuenteSinComentarios(PAGE_EDICION_PATH.split('\\').join('/'));
    expect(paginaEdicion).toContain("from '../components'");
    expect(paginaEdicion).not.toContain("from '../components/");

    // El barrel NO declara frontera cliente/servidor: eso va en cada componente.
    expect(barrel).not.toContain('use client');

    // La unica carpeta bajo la raiz de la ruta que NO es una de las tres legitimas es un error:
    // aqui, a diferencia de inventario, hay TRES carpetas legitimas (subrutas + componentes).
    const CARPETAS_LEGITIMAS = ['components', 'nueva', '[id]'];
    const raizDeLaRuta = readdirSync(join(RAIZ, CARPETA_RUTA), { withFileTypes: true });
    const archivosDeAppRouter = ['page.tsx', 'layout.tsx', 'loading.tsx', 'error.tsx', 'not-found.tsx'];

    const carpetasEncontradas = raizDeLaRuta.filter((entrada) => entrada.isDirectory()).map((entrada) => entrada.name);
    expect([...carpetasEncontradas].sort()).toEqual([...CARPETAS_LEGITIMAS].sort());

    for (const entrada of raizDeLaRuta) {
      if (entrada.isDirectory()) continue;
      expect(archivosDeAppRouter, `${entrada.name} no es un archivo del App Router`).toContain(
        entrada.name,
      );
    }

    // Y las subrutas de alta y edicion tampoco dejan componentes sueltos: solo su `page.tsx`.
    for (const carpeta of [CARPETA_NUEVA, CARPETA_EDICION]) {
      const entradas = readdirSync(join(RAIZ, carpeta), { withFileTypes: true });
      for (const entrada of entradas) {
        expect(entrada.isDirectory(), `${carpeta} no deberia tener subcarpetas`).toBe(false);
        expect(
          archivosDeAppRouter,
          `${carpeta}/${entrada.name} no es un archivo del App Router`,
        ).toContain(entrada.name);
      }
    }
  });

  it('ningun archivo de la ruta usa fetch a rutas API propias', () => {
    // R47 — la prohibicion es de `docs/architecture.md` y de la decision del 2026-09-03.
    ningunArchivoContiene(['fetch(', "'/api/", '"/api/', 'axios', 'XMLHttpRequest']);
  });

  it('las primitivas de components/ui que usa la ruta existen y ninguna se escribio a mano', () => {
    // R48 — las primitivas vienen del CLI de shadcn/ui.
    for (const primitiva of ['table.tsx', 'select.tsx', 'alert-dialog.tsx', 'button.tsx', 'input.tsx', 'label.tsx', 'skeleton.tsx', 'autocomplete.tsx']) {
      expect(
        existsSync(join(RAIZ, 'components', 'ui', primitiva)),
        `falta components/ui/${primitiva}`,
      ).toBe(true);
    }

    ningunArchivoContiene(['<table', '<dialog', 'role="dialog"', 'createPortal']);
  });

  it('los componentes de cliente no importan composicion, Prisma ni sesion por su cuenta', () => {
    // R49 — los datos bajan por props desde el Server Component, o salen de una Server Action.
    expect(FUENTES_DE_CLIENTE.length).toBeGreaterThan(0);

    ningunArchivoContiene(
      ['@/lib/composition', '@prisma/client', 'prisma.', 'supabase', 'next/headers'],
      FUENTES_DE_CLIENTE,
    );
  });

  it('no usa 100vh, ni hover como unica via, y respeta tamanos tactiles y de fuente', () => {
    // R50 — la mitad que jsdom NO puede observar. Sin excepcion de escritorio declarada.
    const utilidadesQueOcultan = ['hidden', 'invisible', 'opacity-0', 'sr-only', 'scale-0'];

    let controlesVigilados = 0;
    const archivosConControles = new Set<string>();

    for (const ruta of FUENTES_DE_LA_RUTA) {
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

      // Area tactil de 44x44 px y 16 px de fuente, **control a control**. Medir por archivo NO
      // vale: el reviewer ya demostro en QC-22 que asi se puede vaciar un campo entero sin que
      // la suite se ponga roja.
      const constantesTactiles = constantesConLaClase(codigo, 'min-h-11');
      const constantesDeFuente = constantesConLaClase(codigo, 'text-base');

      for (const nombre of CONTROLES_VIGILADOS) {
        const todasLasEtiquetas = etiquetasDeApertura(codigo, nombre, lineasOriginales(ruta));

        // Autocomprobacion: si el archivo escribe la etiqueta, el lector tiene que verla.
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
            llevaLaClase(className, 'min-h-11', constantesTactiles),
            `${control} debe forzar el area tactil en SU className (min-h-11, literal o via constante local)`,
          ).toBe(true);

          if (CONTROLES_CON_FUENTE.includes(nombre)) {
            expect(
              llevaLaClase(className, 'text-base', constantesDeFuente),
              `${control} debe fijar 16px en SU className (text-base, literal o via constante local)`,
            ).toBe(true);
          }
        }
      }
    }

    expect(controlesVigilados, 'R50 no esta vigilando ningun control').toBeGreaterThan(0);
    expect(archivosConControles.size).toBeGreaterThan(0);
  });

  it('la feature no duplica el armazon heredado: layout, sidebar, avisos y primitivas siguen siendo unicos', () => {
    // R51 — el choque entre features que re-crean lo heredado ya ha ocurrido antes en este repo.
    expect(existsSync(join(RAIZ, LAYOUT_PRIVADO_PATH))).toBe(true);
    expect(existsSync(join(RAIZ, 'components', 'private', 'app-sidebar.tsx'))).toBe(true);

    // Lo que R51 pide de ESTA feature es que la ruta de recetas no declare layout propio y
    // herede el de la zona privada. Contar los `layout.tsx` de `app/(private)` entera seria
    // afirmar sobre terreno de otras features: el dia que una ficha legitima anada un layout
    // anidado en SU ruta, este test se pondria rojo sin que nada de QC-26 estuviera mal.
    // La carpeta se DERIVA de `FORMULAS_ROUTE` (`CARPETA_RUTA`), nunca de un literal a mano.
    expect(existsSync(join(RAIZ, CARPETA_RUTA)), `deberia existir ${CARPETA_RUTA}`).toBe(true);
    expect(
      FUENTES_DE_LA_RUTA.length,
      `${CARPETA_RUTA} no tiene fuentes: el censo de layouts no comprobaria nada`,
    ).toBeGreaterThan(0);
    expect(
      FUENTES_DE_LA_RUTA.filter((ruta) => ruta.endsWith('/layout.tsx')),
      `ningun archivo bajo ${CARPETA_RUTA} puede ser un layout: la ruta hereda el de la zona privada`,
    ).toEqual([]);

    for (const ruta of FUENTES_DE_LA_RUTA) {
      expect(ruta, 'la ruta no declara su propio layout').not.toContain('/layout.tsx');
      expect(ruta, 'la ruta no re-crea la barra lateral').not.toContain('sidebar');
    }

    ningunArchivoContiene(['<main', 'SidebarInset', 'SidebarProvider', 'AppSidebar']);

    expect(
      fuentesBajo('lib').filter((ruta) =>
        fuenteSinComentarios(ruta).includes('export const PRIVATE_NAV_ITEMS'),
      ),
    ).toHaveLength(1);
  });
});

/**
 * QC-64 R12 — el asistente de lectura NO tiene URL (T11, `design.md > 6`).
 *
 * Es la mitad del requisito que renderizando NO se ve: que el asistente **no sea alcanzable por
 * ninguna via distinta del modal de «Vista previa»** no lo puede afirmar ningun test de DOM —una
 * `page.tsx` nueva que lo montase renderizaria perfectamente—. De ahi estas guardias de fuente,
 * al estilo de las de arriba.
 *
 * La decision cerrada del 2026-09-04 dice «sin URL propia, sin entrada desde el listado del
 * catalogo», y **QC-63 es quien la abrira** para el Operador: si esta feature publicase la ruta,
 * se estaria adelantando a una ficha que aun no se ha decidido.
 */
describe('QC-64 R12 — el asistente de lectura no tiene ruta propia', () => {
  /** Como se nombra al asistente en el codigo: su componente y su carpeta. */
  const SENALES_DEL_ASISTENTE = ['StepReader', 'step-reader'] as const;

  /** El separador de linea, sin escribirlo como escape en un literal. */
  const SALTO_DE_LINEA = String.fromCharCode(10);

  /** La ruta de import publica del asistente y su unica variante profunda posible. */
  const IMPORTS_DEL_ASISTENTE = [
    '@/components/shared/step-reader',
    'components/shared/step-reader',
  ] as const;

  /** El unico archivo de PRODUCCION que puede montarlo (`design.md > 6`). */
  const UNICO_MONTADOR = enRutaDePosix(join(COMPONENTES_PATH, 'recipe-form.tsx'));

  /**
   * Los archivos de test que legitimamente lo nombran: el que lo monta para probarlo, la guardia
   * que comprueba que el asistente NO importa la libreria del editor, y este mismo, que tiene que
   * escribir su nombre para poder prohibirlo. Se excluyen POR NOMBRE, no por carpeta: un test
   * nuevo que lo montase en otro sitio si tiene que salir en la lista.
   */
  const TESTS_QUE_LO_NOMBRAN = [
    'tests/unit/recetas-ui/step-reader.test.tsx',
    'tests/unit/recetas-ui/recipe-route-contract.test.ts',
    'tests/guards/guard-editor-aislado.test.ts',
  ] as const;

  it('ninguna page.tsx del repo monta el asistente', () => {
    const paginas = fuentesBajo('app').filter((ruta) => ruta.endsWith('/page.tsx'));
    expect(paginas.length, 'no se encontro ninguna page.tsx: la guardia no comprobaria nada').
      toBeGreaterThan(0);

    for (const pagina of paginas) {
      const codigo = fuenteSinComentarios(pagina);
      for (const senal of SENALES_DEL_ASISTENTE) {
        expect(
          codigo,
          `${pagina} monta el asistente: R12 dice que solo se alcanza por el modal de vista previa`,
        ).not.toContain(senal);
      }
    }
  });

  it('lib/shared/routes.ts no gana ninguna constante para el asistente y publica exactamente las de hoy', () => {
    const rutas = fuenteSinComentarios('lib/shared/routes.ts');

    // Ninguna constante cuyo NOMBRE o cuyo VALOR aluda al asistente, a la lectura o a la
    // ejecucion de una receta.
    const alude = /asistente|lectura|leer|ejecucion|ejecutar|reader|read|run|execute|paso|step|guia|wizard/i;
    for (const linea of rutas.split(SALTO_DE_LINEA)) {
      const declaracion = /export\s+(?:const|function)\s+([A-Za-z_$][\w$]*)/.exec(linea);
      if (declaracion === null) continue;
      expect(
        declaracion[1],
        `«${declaracion[1]}» parece una ruta del asistente, y R12 dice que no tiene ninguna`,
      ).not.toMatch(alude);
      expect(linea, `${declaracion[1]} apunta a una URL del asistente`).not.toMatch(
        /['"`]\/[^'"`]*(step|paso|lectura|leer|ejecutar|ejecucion|reader)[^'"`]*['"`]/i,
      );
    }

    // Y el conjunto exportado es EXACTAMENTE el de hoy: una constante nueva -aunque se llame de
    // otra forma- tiene que pasar por aqui y por quien la revise.
    //
    // AMPLIADO el 2026-09-07 (QC-35 T1, R2), que es precisamente «pasar por aqui»: la pantalla
    // de pedidos publica `ORDERS_ROUTE`, y vive en este archivo y no en `private-nav.ts` porque
    // el middleware y la regla ruta->rol la necesitan y no pueden depender de la navegacion. El
    // centinela NO se relaja: sigue exigiendo la lista EXACTA, asi que una constante mas sin
    // ficha que la respalde lo vuelve a poner en rojo. Lo que R12 protege de verdad -que el
    // asistente de lectura no gane ruta- queda intacto: `ORDERS_ROUTE` no encaja en el patron
    // `alude` de arriba, que se sigue aplicando a todas las declaraciones del archivo.
    const exportadas = [...rutas.matchAll(/export\s+(?:const|function)\s+([A-Za-z_$][\w$]*)/g)].map(
      (encaje) => encaje[1],
    );
    expect(exportadas.sort()).toEqual(
      [
        'DASHBOARD_ROUTE',
        'FORGOT_PASSWORD_ROUTE',
        'FORMULAS_ROUTE',
        'INVENTORY_ROUTE',
        'LOGIN_ROUTE',
        'NEW_RECIPE_ROUTE',
        'ORDERS_ROUTE',
        // La trae QC-45 (R2), la pantalla de presentaciones; la lista sigue cerrada a proposito: una constante nueva sin ficha vuelve a poner esto en rojo.
        'PRESENTATIONS_ROUTE',
        'PRIVATE_ROUTE_PREFIXES',
        'SUPPLIERS_ROUTE',
        'recipeEditRoute',
        'supplierDetailRoute',
      ].sort(),
    );
  });

  it('el asistente solo se importa desde recipe-form.tsx', () => {
    const importadores: string[] = [];

    for (const carpeta of ['app', 'components', 'lib', 'hooks', 'tests', 'e2e']) {
      if (!existsSync(join(RAIZ, carpeta))) continue;
      for (const ruta of fuentesBajo(carpeta)) {
        if ((TESTS_QUE_LO_NOMBRAN as readonly string[]).includes(ruta)) continue;
        const codigo = fuenteSinComentarios(ruta);
        if (IMPORTS_DEL_ASISTENTE.some((importado) => codigo.includes(importado))) {
          importadores.push(ruta);
        }
      }
    }

    expect(importadores.sort()).toEqual([UNICO_MONTADOR]);
  });

  it('el listado del catalogo no enlaza ni menciona el asistente', () => {
    // R12 — «no se enlaza desde el listado del catalogo». La tabla y la seccion de lista son las
    // dos puertas por las que entraria ese enlace.
    for (const archivo of ['recipe-table.tsx', 'recipe-list-section.tsx']) {
      const codigo = fuenteSinComentarios(enRutaDePosix(join(COMPONENTES_PATH, archivo)));
      for (const senal of SENALES_DEL_ASISTENTE) {
        expect(codigo, `${archivo} no puede enlazar el asistente`).not.toContain(senal);
      }
    }
  });
});
